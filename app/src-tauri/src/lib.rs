use directories::ProjectDirs;
use kempt_core::{
    ai::ReqwestAiTransport,
    dispatch::dispatch,
    error::{AppError, ErrorBody},
    service::AppService,
};
use kempt_storage::{open_kempt_database, KeyringSecretStore, SqliteRepository};
use std::{path::PathBuf, sync::Arc};

pub struct AppState {
    pub service: Arc<AppService<SqliteRepository>>,
}

pub async fn rpc_inner(
    service: &AppService<SqliteRepository>,
    method: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value, ErrorBody> {
    dispatch(service, method, payload)
        .await
        .map_err(|error| error.body())
}

#[tauri::command]
async fn rpc(
    method: String,
    payload: serde_json::Value,
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, ErrorBody> {
    rpc_inner(&state.service, &method, payload).await
}

fn validate_backup_path(path: &std::path::Path) -> Result<(), AppError> {
    if path
        .extension()
        .is_some_and(|extension| extension == "json")
    {
        Ok(())
    } else {
        Err(AppError::Validation(
            "Backup files must use the .json extension".into(),
        ))
    }
}

#[tauri::command]
fn read_backup(path: String) -> Result<String, ErrorBody> {
    let path = std::path::Path::new(&path);
    validate_backup_path(path).map_err(|error| error.body())?;
    let metadata =
        std::fs::metadata(path).map_err(|error| AppError::Storage(error.to_string()).body())?;
    if metadata.len() > 50 * 1024 * 1024 {
        return Err(AppError::Validation("Backup file exceeds 50 MiB".into()).body());
    }
    std::fs::read_to_string(path).map_err(|error| AppError::Storage(error.to_string()).body())
}

#[tauri::command]
fn write_backup(path: String, contents: String) -> Result<(), ErrorBody> {
    let path = std::path::Path::new(&path);
    validate_backup_path(path).map_err(|error| error.body())?;
    if contents.len() > 50 * 1024 * 1024 {
        return Err(AppError::Validation("Backup file exceeds 50 MiB".into()).body());
    }
    std::fs::write(path, contents).map_err(|error| AppError::Storage(error.to_string()).body())
}

fn data_dirs() -> Result<(PathBuf, PathBuf), AppError> {
    let new_dir = ProjectDirs::from("com", "kempt", "Kempt")
        .map(|dirs| dirs.data_dir().to_path_buf())
        .ok_or_else(|| AppError::Storage("Cannot resolve application data directory".into()))?;
    let legacy_dir = ProjectDirs::from("com", "nohea", "kempt")
        .map(|dirs| dirs.data_dir().to_path_buf())
        .ok_or_else(|| AppError::Storage("Cannot resolve legacy data directory".into()))?;
    Ok((new_dir, legacy_dir))
}

fn build_service() -> Result<AppService<SqliteRepository>, AppError> {
    let (new_dir, legacy_dir) = data_dirs()?;
    let database = open_kempt_database(&new_dir, &legacy_dir)?;
    database.migrate()?;
    let secrets: Arc<dyn kempt_core::secrets::SecretStore> =
        if std::env::var("HEA_SESSION_SECRETS").as_deref() == Ok("1") {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let service =
        build_service().unwrap_or_else(|error| panic!("Failed to initialize application: {error}"));
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState {
            service: Arc::new(service),
        })
        .invoke_handler(tauri::generate_handler![rpc, read_backup, write_backup])
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
        let expected = dispatch(&service, "task.list", payload.clone())
            .await
            .unwrap();
        let actual = rpc_inner(&service, "task.list", payload).await.unwrap();
        assert_eq!(actual, expected);
    }
}
