use kempt_core::error::AppError;
use rusqlite::Connection;
use std::{
    path::Path,
    sync::{Mutex, MutexGuard},
    time::Duration,
};

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, AppError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| AppError::Storage(e.to_string()))?;
        }
        let conn = Connection::open(path).map_err(|e| AppError::Storage(e.to_string()))?;
        conn.busy_timeout(Duration::from_secs(5))
            .map_err(|e| AppError::Storage(e.to_string()))?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| AppError::Storage(e.to_string()))?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn migrate(&self) -> Result<(), AppError> {
        let mut conn = self.conn();
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(|e| AppError::Storage(e.to_string()))?;
        if version == 0 {
            let tx = conn
                .transaction()
                .map_err(|e| AppError::Storage(e.to_string()))?;
            tx.execute_batch(include_str!("../../../migrations/0001_init.sql"))
                .map_err(|e| AppError::Storage(e.to_string()))?;
            tx.pragma_update(None, "user_version", 1)
                .map_err(|e| AppError::Storage(e.to_string()))?;
            tx.commit().map_err(|e| AppError::Storage(e.to_string()))?;
        } else if version != 1 {
            return Err(AppError::Storage(format!(
                "Unsupported database schema version: {version}"
            )));
        }
        Ok(())
    }

    pub fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().expect("database mutex poisoned")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_twice_without_losing_data() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("kempt.db");
        let first = Database::open(&path).unwrap();
        first.migrate().unwrap();
        first.conn().execute("INSERT INTO app_users (id, name, is_default, created_at) VALUES ('local', 'Local', 1, 0)", []).unwrap();
        drop(first);
        let second = Database::open(&path).unwrap();
        second.migrate().unwrap();
        assert_eq!(second.conn().query_row("SELECT COUNT(*) FROM app_users", [], |r| r.get::<_, i64>(0)).unwrap(), 2);
        assert_eq!(second.conn().query_row("PRAGMA foreign_keys", [], |r| r.get::<_, i64>(0)).unwrap(), 1);
        assert_eq!(second.conn().query_row("PRAGMA journal_mode", [], |r| r.get::<_, String>(0)).unwrap(), "wal");
        for table in ["app_users", "work_tasks", "task_work_logs", "task_checklist_items", "assistant_models", "assistant_messages", "assistant_actions"] {
            let exists: i64 = second.conn().query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1", [table], |r| r.get(0)).unwrap();
            assert_eq!(exists, 1, "missing table {table}");
        }
    }
}
