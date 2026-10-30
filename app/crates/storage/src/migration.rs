use crate::Database;
use kempt_core::{
    branding::{DATABASE_FILE, LEGACY_DATABASE_FILE},
    error::AppError,
    secrets::SecretStore,
};
use rusqlite::{Connection, OpenFlags};
use std::path::Path;

pub fn open_kempt_database(new_dir: &Path, legacy_dir: &Path) -> Result<Database, AppError> {
    let new_path = new_dir.join(DATABASE_FILE);
    if new_path.exists() {
        return Database::open(&new_path);
    }
    let legacy_path = legacy_dir.join(LEGACY_DATABASE_FILE);
    if legacy_path.exists() {
        std::fs::create_dir_all(new_dir).map_err(io_error)?;
        let temporary = new_dir.join("kempt-migration.tmp.db");
        if temporary.is_file() {
            std::fs::remove_file(&temporary).map_err(io_error)?;
        }
        let legacy = Connection::open_with_flags(&legacy_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(storage_error)?;
        legacy
            .execute("VACUUM INTO ?1", [temporary.to_string_lossy().to_string()])
            .map_err(storage_error)?;
        drop(legacy);
        let check = Connection::open(&temporary).map_err(storage_error)?;
        let result: String = check
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(storage_error)?;
        if result != "ok" {
            return Err(AppError::Storage(
                "Legacy database integrity check failed".into(),
            ));
        }
        drop(check);
        std::fs::rename(&temporary, &new_path).map_err(io_error)?;
    }
    Database::open(&new_path)
}

pub fn migrate_credentials(
    references: &[String],
    legacy: &dyn SecretStore,
    current: &dyn SecretStore,
) -> Result<(), AppError> {
    for reference in references {
        let value = legacy.get(reference)?;
        current.set(reference, &value)?;
        if current.get(reference)? != value {
            return Err(AppError::SecretStore(
                "Credential verification failed".into(),
            ));
        }
    }
    Ok(())
}

fn storage_error(error: rusqlite::Error) -> AppError {
    AppError::Storage(error.to_string())
}

fn io_error(error: std::io::Error) -> AppError {
    AppError::Storage(error.to_string())
}
