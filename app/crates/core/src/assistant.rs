use crate::{
    error::AppError,
    repository::TaskRepository,
    service::AppService,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use url::Url;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../../contracts/generated/")]
pub enum Provider {
    Kimi,
    MiniMax,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../contracts/generated/", rename_all = "camelCase")]
pub struct AssistantModel {
    pub id: String,
    pub provider: Provider,
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub is_default: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../contracts/generated/", rename_all = "camelCase")]
pub struct AssistantModelDraft {
    pub id: Option<String>,
    pub provider: Provider,
    pub name: String,
    pub base_url: String,
    pub model: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AssistantModelRecord {
    pub model: AssistantModel,
    pub secret_ref: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../contracts/generated/", rename_all = "camelCase")]
pub struct AvailableModel {
    pub id: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../contracts/generated/", rename_all = "camelCase")]
pub struct AvailableModelsResult {
    pub models: Vec<AvailableModel>,
    pub default_model_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../contracts/generated/", rename_all = "camelCase")]
pub struct AvailableModelsRequest {
    pub id: Option<String>,
    pub provider: Provider,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
}

#[async_trait::async_trait]
pub trait ProviderCatalog: Send + Sync {
    async fn available_models(
        &self,
        config: &AssistantModel,
        api_key: Option<&str>,
    ) -> Result<AvailableModelsResult, AppError>;
}

pub trait AssistantRepository: TaskRepository {
    fn list_models(&self) -> Result<Vec<AssistantModel>, AppError>;
    fn get_model_record(&self, id: &str) -> Result<AssistantModelRecord, AppError>;
    fn save_model_record(&self, record: &AssistantModelRecord) -> Result<Vec<AssistantModel>, AppError>;
    fn set_default_model(&self, id: &str) -> Result<Vec<AssistantModel>, AppError>;
    fn delete_model(&self, id: &str) -> Result<Vec<AssistantModel>, AppError>;
}

impl<R: AssistantRepository> AppService<R> {
    pub fn list_models(&self) -> Result<Vec<AssistantModel>, AppError> {
        self.repository.list_models()
    }

    pub async fn available_models(&self, request: AvailableModelsRequest) -> Result<AvailableModelsResult, AppError> {
        let existing = request.id.as_deref().map(|id| self.repository.get_model_record(id)).transpose()?;
        let config = if let Some(record) = &existing {
            record.model.clone()
        } else {
            AssistantModel {
                id: "draft".into(),
                provider: request.provider,
                name: "Draft".into(),
                base_url: request.base_url.clone().unwrap_or_default(),
                model: String::new(),
                is_default: false,
                created_at: Utc::now().to_rfc3339(),
            }
        };
        validate_provider_url(config.provider, &config.base_url)?;
        let api_key = self.resolve_api_key(existing.as_ref(), request.api_key.as_deref())?;
        self.catalog()?.available_models(&config, api_key.as_deref()).await
    }

    pub async fn save_model(&self, draft: AssistantModelDraft, api_key: Option<String>) -> Result<Vec<AssistantModel>, AppError> {
        let name = draft.name.trim();
        let model_name = draft.model.trim();
        if name.is_empty() || name.len() > 100 || model_name.is_empty() || model_name.len() > 200 {
            return Err(AppError::Validation("Invalid model name or model ID".into()));
        }
        validate_provider_url(draft.provider, &draft.base_url)?;
        if let Some(key) = api_key.as_deref() {
            if key.trim().len() < 10 || key.trim().len() > 500 {
                return Err(AppError::Validation("Invalid API key length".into()));
            }
        }
        let existing = draft.id.as_deref().map(|id| self.repository.get_model_record(id)).transpose()?;
        let is_first = self.repository.list_models()?.is_empty();
        let id = existing.as_ref().map(|record| record.model.id.clone()).unwrap_or_else(|| Uuid::new_v4().to_string());
        let secret_ref = existing.as_ref().map(|record| record.secret_ref.clone())
            .unwrap_or_else(|| if draft.provider == Provider::MiniMax { format!("assistant-model/{}", Uuid::new_v4()) } else { String::new() });
        let model = AssistantModel {
            id,
            provider: draft.provider,
            name: name.into(),
            base_url: draft.base_url,
            model: model_name.into(),
            is_default: existing.as_ref().map(|record| record.model.is_default).unwrap_or(is_first),
            created_at: existing.as_ref().map(|record| record.model.created_at.clone()).unwrap_or_else(|| Utc::now().to_rfc3339()),
        };
        let resolved_key = self.resolve_api_key(existing.as_ref(), api_key.as_deref())?;
        let available = self.catalog()?.available_models(&model, resolved_key.as_deref()).await?;
        if !available.models.iter().any(|item| item.id == model.model) {
            return Err(AppError::Validation("Selected model is not available".into()));
        }
        if draft.provider == Provider::MiniMax {
            let key = resolved_key.ok_or_else(|| AppError::SecretStore("MiniMax API key is required".into()))?;
            self.secrets()?.set(&secret_ref, &key)?;
        }
        self.repository.save_model_record(&AssistantModelRecord { model, secret_ref })
    }

    pub fn set_default_model(&self, id: &str) -> Result<Vec<AssistantModel>, AppError> {
        self.repository.set_default_model(id)
    }

    pub fn delete_model(&self, id: &str) -> Result<Vec<AssistantModel>, AppError> {
        let record = self.repository.get_model_record(id)?;
        let models = self.repository.delete_model(id)?;
        if !record.secret_ref.is_empty() {
            self.secrets()?.delete(&record.secret_ref)?;
        }
        Ok(models)
    }

    fn resolve_api_key(&self, existing: Option<&AssistantModelRecord>, supplied: Option<&str>) -> Result<Option<String>, AppError> {
        if let Some(key) = supplied {
            return Ok(Some(key.trim().to_string()));
        }
        if let Some(record) = existing {
            if !record.secret_ref.is_empty() {
                return self.secrets()?.get(&record.secret_ref).map(Some);
            }
        }
        Ok(None)
    }

    fn secrets(&self) -> Result<&dyn crate::secrets::SecretStore, AppError> {
        self.secrets.as_deref().ok_or_else(|| AppError::SecretStore("Secret store is not configured".into()))
    }

    fn catalog(&self) -> Result<&dyn ProviderCatalog, AppError> {
        self.catalog.as_deref().ok_or_else(|| AppError::Network("AI provider is not configured".into()))
    }
}

fn validate_provider_url(provider: Provider, value: &str) -> Result<(), AppError> {
    let url = Url::parse(value).map_err(|_| AppError::Validation("Invalid provider URL".into()))?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err(AppError::Validation("Provider URL must not contain credentials".into()));
    }
    let host = url.host_str().ok_or_else(|| AppError::Validation("Provider URL has no host".into()))?;
    let loopback = matches!(host, "localhost" | "127.0.0.1" | "::1");
    match provider {
        Provider::MiniMax if url.scheme() == "https" => {
            if matches!(host, "api.minimax.cn" | "api.minimax.io" | "api.minimaxi.com") {
                Ok(())
            } else {
                Err(AppError::Validation("MiniMax provider host is not allowed".into()))
            }
        }
        Provider::MiniMax if cfg!(debug_assertions) && url.scheme() == "http" && loopback => Ok(()),
        Provider::Kimi if url.scheme() == "https" => Ok(()),
        Provider::Kimi if cfg!(debug_assertions) && url.scheme() == "http" && loopback => Ok(()),
        _ => Err(AppError::Validation("Provider URL scheme is not allowed".into())),
    }
}
