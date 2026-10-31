use crate::{
    assistant::{AssistantModel, AvailableModel, AvailableModelsResult, Provider, ProviderCatalog},
    chat::{ChatContext, ChatResult},
    error::AppError,
};
use serde_json::{json, Value};
use std::time::Duration;

pub struct ReqwestAiTransport {
    client: reqwest::Client,
}

impl ReqwestAiTransport {
    pub fn new() -> Result<Self, AppError> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| AppError::Network(e.to_string()))?;
        Ok(Self { client })
    }
}

#[async_trait::async_trait]
impl ProviderCatalog for ReqwestAiTransport {
    async fn available_models(
        &self,
        config: &AssistantModel,
        api_key: Option<&str>,
    ) -> Result<AvailableModelsResult, AppError> {
        let (base_url, key) = effective_credentials(config, api_key)?;
        let response = self
            .client
            .get(endpoint(&base_url, "models"))
            .bearer_auth(key.unwrap_or_default())
            .send()
            .await
            .map_err(network_error)?;
        if !response.status().is_success() {
            return Err(AppError::Network(format!(
                "Model listing failed with HTTP {}",
                response.status()
            )));
        }
        let payload: Value = response.json().await.map_err(network_error)?;
        let entries = payload
            .get("data")
            .or_else(|| payload.get("models"))
            .and_then(Value::as_array)
            .ok_or_else(|| AppError::Network("Provider returned an invalid model list".into()))?;
        let models = entries
            .iter()
            .filter_map(|entry| {
                entry
                    .get("id")
                    .and_then(Value::as_str)
                    .map(|id| AvailableModel {
                        id: id.into(),
                        display_name: entry
                            .get("displayName")
                            .or_else(|| entry.get("display_name"))
                            .and_then(Value::as_str)
                            .map(str::to_string),
                    })
            })
            .collect::<Vec<_>>();
        let default_model_id = payload
            .get("defaultModelId")
            .or_else(|| payload.get("default_model_id"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| models.first().map(|model| model.id.clone()));
        Ok(AvailableModelsResult {
            models,
            default_model_id,
        })
    }

    async fn chat(
        &self,
        config: &AssistantModel,
        api_key: Option<&str>,
        context: ChatContext,
    ) -> Result<ChatResult, AppError> {
        let (base_url, key) = effective_credentials(config, api_key)?;
        let mut messages = vec![json!({"role":"system","content":system_prompt(&context)?})];
        messages.extend(
            context
                .messages
                .iter()
                .map(|message| json!({"role":message.role,"content":message.content})),
        );
        let response = self.client.post(endpoint(&base_url, "chat/completions"))
            .bearer_auth(key.unwrap_or_default())
            .json(&json!({"model":config.model,"messages":messages,"max_tokens":1800,"response_format":{"type":"json_object"}}))
            .send().await.map_err(network_error)?;
        if !response.status().is_success() {
            return Err(AppError::Network(format!(
                "Chat failed with HTTP {}",
                response.status()
            )));
        }
        let payload: Value = response.json().await.map_err(network_error)?;
        let content = payload
            .pointer("/choices/0/message/content")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Network("Provider returned no chat content".into()))?;
        parse_chat_content(content)
    }
}

fn effective_credentials(
    config: &AssistantModel,
    api_key: Option<&str>,
) -> Result<(String, Option<String>), AppError> {
    if config.provider == Provider::Kimi {
        let base_url = std::env::var("KIMI_AGENTGW_BASE_URL")
            .map_err(|_| AppError::SecretStore("KIMI_AGENTGW_BASE_URL is not configured".into()))?;
        let key = std::env::var("KIMI_AGENTGW_API_KEY")
            .map_err(|_| AppError::SecretStore("KIMI_AGENTGW_API_KEY is not configured".into()))?;
        Ok((base_url, Some(key)))
    } else {
        let key = api_key
            .map(str::to_string)
            .filter(|key| !key.is_empty())
            .ok_or_else(|| AppError::SecretStore("MiniMax API key is required".into()))?;
        Ok((config.base_url.clone(), Some(key)))
    }
}

fn endpoint(base_url: &str, path: &str) -> String {
    format!("{}/{}", base_url.trim_end_matches('/'), path)
}

fn system_prompt(context: &ChatContext) -> Result<String, AppError> {
    let tasks =
        serde_json::to_string(&context.tasks).map_err(|e| AppError::Validation(e.to_string()))?;
    Ok(format!(
        "You manage only workspace {}. Current tasks: {}. Return JSON with text and actions. actions is an array of {{action,payload,summary}}. Supported actions: create_task, update_task_status, add_progress_log, move_task_to_recycle_bin, reorder_tasks. Every payload must include workspaceId. Never execute writes without a proposal.",
        context.workspace_id, tasks
    ))
}

fn parse_chat_content(content: &str) -> Result<ChatResult, AppError> {
    let value: Value =
        serde_json::from_str(content).unwrap_or_else(|_| json!({"text":content,"actions":[]}));
    if value.get("text").is_none() {
        return Err(AppError::Network("Provider JSON has no text field".into()));
    }
    let text = value
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let actions =
        serde_json::from_value(value.get("actions").cloned().unwrap_or_else(|| json!([])))
            .map_err(|_| AppError::Network("Provider returned invalid actions".into()))?;
    Ok(ChatResult { text, actions })
}

fn network_error(error: reqwest::Error) -> AppError {
    AppError::Network(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_provider_text_and_actions() {
        let result = parse_chat_content(r#"{"text":"Done","actions":[{"action":"create_task","payload":{"workspaceId":"admin"},"summary":"Create"}]}"#).unwrap();
        assert_eq!(result.text, "Done");
        assert_eq!(result.actions.len(), 1);
    }

    #[test]
    fn plain_text_has_no_actions() {
        let result = parse_chat_content("Hello").unwrap();
        assert_eq!(result.text, "Hello");
        assert!(result.actions.is_empty());
    }
}
