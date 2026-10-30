use directories::ProjectDirs;
use kempt_core::{ai::ReqwestAiTransport, dispatch::dispatch, error::{AppError, ErrorBody}, service::AppService};
use kempt_storage::{Database, KeyringSecretStore, SqliteRepository};
use std::{path::PathBuf, sync::Arc};

pub struct AppState {
    pub service: Arc<AppService<SqliteRepository>>,
}

pub async fn rpc_inner(
    service: &AppService<SqliteRepository>,
    method: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value, ErrorBody> {
    dispatch(service, method, payload).await.map_err(|error| error.body())
}

#[tauri::command]
async fn rpc(
    method: String,
    payload: serde_json::Value,
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, ErrorBody> {
    rpc_inner(&state.service, &method, payload).await
}

fn data_dir() -> Result<PathBuf, AppError> {
    ProjectDirs::from("com", "nohea", "kempt")
        .map(|dirs| dirs.data_dir().to_path_buf())
        .ok_or_else(|| AppError::Storage("Cannot resolve application data directory".into()))
}

fn build_service() -> Result<AppService<SqliteRepository>, AppError> {
    let database = Database::open(&data_dir()?.join("kempt.db"))?;
    database.migrate()?;
    Ok(AppService::with_assistant(
        SqliteRepository::new(database),
        Arc::new(KeyringSecretStore),
        Arc::new(ReqwestAiTransport::new()?),
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let service = build_service().unwrap_or_else(|error| panic!("Failed to initialize application: {error}"));
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState { service: Arc::new(service) })
        .invoke_handler(tauri::generate_handler![rpc])
        .run(tauri::generate_context!())
        .expect("error while running Hea Workflow");
}

#[cfg(test)]
mod tests {
    use super::*;
    use kempt_core::dispatch::dispatch;
    use kempt_storage::{Database, SqliteRepository};

    #[tokio::test]
    async fn tauri_adapter_matches_direct_dispatch() {
        let dir = tempfile::tempdir().unwrap();
        let database = Database::open(&dir.path().join("desktop.db")).unwrap();
        database.migrate().unwrap();
        let service = AppService::new(SqliteRepository::new(database));
        let payload = serde_json::json!({"userId":"shella"});
        let expected = dispatch(&service, "task.list", payload.clone()).await.unwrap();
        let actual = rpc_inner(&service, "task.list", payload).await.unwrap();
        assert_eq!(actual, expected);
    }
}
