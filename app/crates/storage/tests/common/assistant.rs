use kempt_core::{
    assistant::{AssistantModel, AssistantModelDraft, AvailableModel, AvailableModelsResult, Provider, ProviderCatalog},
    error::AppError,
    secrets::MemorySecretStore,
    service::AppService,
};
use kempt_storage::SqliteRepository;
use std::sync::Arc;

pub struct AssistantFixture {
    pub _dir: tempfile::TempDir,
    pub service: AppService<SqliteRepository>,
    pub secrets: Arc<MemorySecretStore>,
}

impl AssistantFixture {
    pub fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let db = kempt_storage::Database::open(&dir.path().join("assistant.db")).unwrap();
        db.migrate().unwrap();
        let secrets = Arc::new(MemorySecretStore::default());
        let service = AppService::with_assistant(
            SqliteRepository::new(db),
            secrets.clone(),
            Arc::new(MockProviderCatalog),
        );
        Self { _dir: dir, service, secrets }
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

struct MockProviderCatalog;

#[async_trait::async_trait]
impl ProviderCatalog for MockProviderCatalog {
    async fn available_models(&self, _config: &AssistantModel, _api_key: Option<&str>) -> Result<AvailableModelsResult, AppError> {
        Ok(AvailableModelsResult {
            models: vec![AvailableModel { id: "MiniMax-Text-01".into(), display_name: None }],
            default_model_id: Some("MiniMax-Text-01".into()),
        })
    }
}
