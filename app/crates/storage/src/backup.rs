use crate::{repository::{priority_str, status_str}, SqliteRepository};
use chrono::{DateTime, Utc};
use kempt_core::{
    backup::{BackupRepository, BackupTask, BackupUser, FullBackup, RestoreSummary},
    error::AppError,
    repository::TaskRepository,
};
use rusqlite::params;

impl BackupRepository for SqliteRepository {
    fn export_snapshot(&self) -> Result<FullBackup, AppError> {
        let users = self.list_users()?;
        let mut tasks = Vec::new();
        for user in &users {
            for deleted in [false, true] {
                tasks.extend(self.list_tasks(&user.id, deleted)?.into_iter().map(|task| BackupTask {
                    task,
                    user_id: user.id.clone(),
                }));
            }
        }
        tasks.sort_by(|a, b| b.task.created_at.cmp(&a.task.created_at));
        Ok(FullBackup {
            app: "Kempt".into(),
            format: "kempt-full-backup".into(),
            version: 2,
            exported_at: Utc::now().to_rfc3339(),
            users: users.into_iter().map(|user| BackupUser {
                id: user.id,
                owner_union_id: None,
                name: user.name,
                is_default: user.is_default,
                created_at: Some(user.created_at),
            }).collect(),
            tasks,
            preferences: None,
        })
    }

    fn replace_snapshot(&self, backup: &FullBackup) -> Result<RestoreSummary, AppError> {
        self.database().backup_to()?;
        let logs = backup.tasks.iter().map(|task| task.task.logs.len()).sum();
        let checklist = backup.tasks.iter().map(|task| task.task.checklist.len()).sum();
        let deleted_tasks = backup.tasks.iter().filter(|task| task.task.deleted_at.is_some()).count();
        {
            let mut conn = self.database().conn();
            let tx = conn.transaction().map_err(|e| AppError::Storage(e.to_string()))?;
            tx.execute("DELETE FROM work_tasks", []).map_err(|e| AppError::Storage(e.to_string()))?;
            tx.execute("DELETE FROM app_users", []).map_err(|e| AppError::Storage(e.to_string()))?;
            for user in &backup.users {
                let created_at = user.created_at.as_deref().and_then(|value| {
                    DateTime::parse_from_rfc3339(value).ok().map(|date| date.timestamp_millis())
                }).unwrap_or_else(|| Utc::now().timestamp_millis());
                tx.execute(
                    "INSERT INTO app_users (id, name, is_default, created_at) VALUES (?1, ?2, ?3, ?4)",
                    params![user.id, user.name, user.is_default, created_at],
                ).map_err(|e| AppError::Storage(e.to_string()))?;
            }
            for backup_task in &backup.tasks {
                let task = &backup_task.task;
                tx.execute(
                    "INSERT INTO work_tasks (id, user_id, title, description, project, status, priority, start_date, due_date, progress, position, parent_id, source_url, created_at, updated_at, deleted_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
                    params![task.id, backup_task.user_id, task.title, task.description, task.project,
                        status_str(task.status), priority_str(task.priority), task.start_date,
                        task.due_date, task.progress, task.position, task.parent_id, task.source_url,
                        task.created_at, Utc::now().timestamp_millis(), task.deleted_at],
                ).map_err(|e| AppError::Storage(e.to_string()))?;
                for log in &task.logs {
                    tx.execute(
                        "INSERT INTO task_work_logs (id, task_id, date, content, progress, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        params![log.id, task.id, log.date, log.content, log.progress, status_str(log.status), log.created_at],
                    ).map_err(|e| AppError::Storage(e.to_string()))?;
                }
                for item in &task.checklist {
                    tx.execute(
                        "INSERT INTO task_checklist_items (id, task_id, content, completed, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        params![item.id, task.id, item.content, item.completed, item.position, item.created_at],
                    ).map_err(|e| AppError::Storage(e.to_string()))?;
                }
            }
            tx.commit().map_err(|e| AppError::Storage(e.to_string()))?;
        }
        Ok(RestoreSummary {
            users: self.list_users()?,
            tasks: backup.tasks.len(),
            logs,
            checklist,
            deleted_tasks,
        })
    }

    fn has_tasks(&self) -> Result<bool, AppError> {
        let count: i64 = self.database().conn().query_row("SELECT COUNT(*) FROM work_tasks", [], |row| row.get(0))
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(count > 0)
    }
}
