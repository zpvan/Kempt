pub mod assets;
pub mod http;

use directories::ProjectDirs;
use kempt_core::{ai::ReqwestAiTransport, error::AppError, service::AppService};
use kempt_storage::{Database, KeyringSecretStore, SqliteRepository};
use http::ServerService;
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

#[derive(Debug, Clone)]
pub struct ServeOptions {
    pub host: String,
    pub port: u16,
    pub data_dir: Option<PathBuf>,
    pub session_secrets: bool,
}

impl ServeOptions {
    pub fn validate(&self) -> Result<(), AppError> {
        if matches!(self.host.as_str(), "127.0.0.1" | "::1" | "localhost") {
            Ok(())
        } else {
            Err(AppError::Validation(
                "Only loopback listen addresses are allowed".into(),
            ))
        }
    }

    pub fn data_dir(&self) -> PathBuf {
        self.data_dir.clone().unwrap_or_else(default_data_dir)
    }
}

pub fn build_router(service: ServerService) -> axum::Router {
    http::router(service)
}

pub async fn serve(options: ServeOptions) -> Result<(), AppError> {
    options.validate()?;
    let data_dir = options.data_dir();
    let service = build_service(&data_dir, options.session_secrets)?;
    let _log_guard = init_logging(&data_dir)?;
    let address = format!("{}:{}", options.host, options.port);
    let listener = tokio::net::TcpListener::bind(&address)
        .await
        .map_err(|e| AppError::Network(e.to_string()))?;
    tracing::info!(%address, "server listening");
    axum::serve(listener, build_router(service))
        .await
        .map_err(|e| AppError::Network(e.to_string()))
}

pub fn build_service(data_dir: &Path, session_secrets: bool) -> Result<ServerService, AppError> {
    let database = Database::open(&data_dir.join("kempt.db"))?;
    database.migrate()?;
    let secrets: Arc<dyn kempt_core::secrets::SecretStore> = if session_secrets {
        Arc::new(kempt_core::secrets::MemorySecretStore::default())
    } else {
        Arc::new(KeyringSecretStore)
    };
    Ok(AppService::with_assistant(
        SqliteRepository::new(database),
        secrets,
        Arc::new(ReqwestAiTransport::new()?),
    ))
}

#[doc(hidden)]
pub fn test_service(data_dir: &Path) -> ServerService {
    build_service(data_dir, false).unwrap()
}

fn default_data_dir() -> PathBuf {
    ProjectDirs::from("com", "nohea", "kempt")
        .map(|dirs| dirs.data_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

fn init_logging(data_dir: &Path) -> Result<tracing_appender::non_blocking::WorkerGuard, AppError> {
    let logs = data_dir.join("logs");
    std::fs::create_dir_all(&logs).map_err(|e| AppError::Storage(e.to_string()))?;
    let appender = tracing_appender::rolling::daily(logs, "app.log");
    let (writer, guard) = tracing_appender::non_blocking(appender);
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .with_writer(writer)
        .try_init()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(guard)
}
