#![allow(dead_code)]

use kempt_core::{
    assistant::{
        AssistantModel, AssistantModelDraft, AvailableModel, AvailableModelsResult, Provider,
        ProviderCatalog,
    },
    chat::{AssistantAction, AssistantActionDraft, ChatContext, ChatRequest, ChatResult},
    error::AppError,
    secrets::MemorySecretStore,
    service::AppService,
};
use kempt_storage::SqliteRepository;
use std::sync::{Arc, Mutex};

pub struct AssistantFixture {
    pub _dir: tempfile::TempDir,
    pub service: AppService<SqliteRepository>,
    pub secrets: Arc<MemorySecretStore>,
    pub provider: Arc<MockProviderCatalog>,
}

impl AssistantFixture {
    pub fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let db = kempt_storage::Database::open(&dir.path().join("assistant.db")).unwrap();
        db.migrate().unwrap();
        let secrets = Arc::new(MemorySecretStore::default());
        let provider = Arc::new(MockProviderCatalog::default());
        let service = AppService::with_assistant(
            SqliteRepository::new(db),
            secrets.clone(),
            provider.clone(),
        );
        Self {
            _dir: dir,
            service,
            secrets,
            provider,
        }
    }

    pub async fn insert_action(&self, action: &str) -> AssistantAction {
        self.service
            .save_model(sample_model(), Some("secret-value".into()))
            .await
            .unwrap();
        self.provider.push_chat(ChatResult {
            text: "Proposal".into(),
            actions: vec![AssistantActionDraft {
                action: action.into(),
                payload: serde_json::json!({"workspaceId":"admin","title":"Created","dueDate":"2026-01-02"}),
                summary: "Create a task".into(),
            }],
        });
        self.service
            .chat(ChatRequest {
                workspace_id: "admin".into(),
                model_id: None,
                message: "Create".into(),
            })
            .await
            .unwrap();
        self.service.list_actions("admin").unwrap().remove(0)
    }
}

pub fn sample_model() -> AssistantModelDraft {
    AssistantModelDraft {
        id: None,
        provider: Provider::MiniMax,
        name: "MiniMax".into(),
        base_url: "https://api.minimax.io".into(),
        model: "MiniMax-Text-01".into(),
    }
}

#[derive(Default)]
pub struct MockProviderCatalog {
    chats: Mutex<Vec<ChatResult>>,
}

impl MockProviderCatalog {
    pub fn push_chat(&self, result: ChatResult) {
        self.chats.lock().unwrap().push(result);
    }
}

#[async_trait::async_trait]
impl ProviderCatalog for MockProviderCatalog {
    async fn available_models(
        &self,
        _config: &AssistantModel,
        _api_key: Option<&str>,
    ) -> Result<AvailableModelsResult, AppError> {
        Ok(AvailableModelsResult {
            models: vec![AvailableModel {
                id: "MiniMax-Text-01".into(),
                display_name: None,
            }],
            default_model_id: Some("MiniMax-Text-01".into()),
        })
    }

    async fn chat(
        &self,
        _config: &AssistantModel,
        _api_key: Option<&str>,
        _context: ChatContext,
    ) -> Result<ChatResult, AppError> {
        self.chats
            .lock()
            .unwrap()
            .pop()
            .ok_or_else(|| AppError::Network("Mock provider failure".into()))
    }
}
