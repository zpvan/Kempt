use crate::{assistant::row_to_model_record, repository::{priority_str, status_str}, SqliteRepository};
use chrono::Utc;
use kempt_core::{
    assistant::{AssistantModelRecord, AssistantRepository},
    chat::{ActionEffect, AssistantAction, AssistantActionDraft, AssistantMessage, ChatRepository},
    error::AppError,
    model::{Task, WorkLog},
    repository::TaskRepository,
};
use rusqlite::{params, OptionalExtension, Row, Transaction};
use serde_json::Value;
use uuid::Uuid;

impl ChatRepository for SqliteRepository {
    fn resolve_model_record(&self, id: Option<&str>) -> Result<AssistantModelRecord, AppError> {
        if let Some(id) = id {
            return self.get_model_record(id);
        }
        let conn = self.database().conn();
        conn.query_row(
            "SELECT id, provider, name, base_url, model, secret_ref, is_default, created_at FROM assistant_models WHERE is_default = 1 ORDER BY created_at ASC LIMIT 1",
            [], row_to_model_record,
        ).optional().map_err(storage_error)?.ok_or_else(|| AppError::NotFound("No assistant model is configured".into()))
    }

    fn insert_message(&self, message: &AssistantMessage) -> Result<(), AppError> {
        self.database().conn().execute(
            "INSERT INTO assistant_messages (id, workspace_id, model_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![message.id, message.workspace_id, message.model_id, message.role, message.content, message.created_at],
        ).map_err(storage_error)?;
        Ok(())
    }

    fn list_messages(&self, workspace_id: &str) -> Result<Vec<AssistantMessage>, AppError> {
        let conn = self.database().conn();
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, model_id, role, content, created_at FROM assistant_messages WHERE workspace_id = ?1 ORDER BY created_at DESC LIMIT 50",
        ).map_err(storage_error)?;
        let mut messages = stmt.query_map([workspace_id], |row| Ok(AssistantMessage {
            id: row.get(0)?, workspace_id: row.get(1)?, model_id: row.get(2)?, role: row.get(3)?,
            content: row.get(4)?, created_at: row.get(5)?,
        })).map_err(storage_error)?.collect::<Result<Vec<_>, _>>().map_err(storage_error)?;
        messages.reverse();
        Ok(messages)
    }

    fn save_assistant_response(&self, message: &AssistantMessage, actions: &[AssistantActionDraft]) -> Result<Vec<AssistantAction>, AppError> {
        let mut saved = Vec::new();
        {
            let mut conn = self.database().conn();
            let tx = conn.transaction().map_err(storage_error)?;
            tx.execute(
                "INSERT INTO assistant_messages (id, workspace_id, model_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![message.id, message.workspace_id, message.model_id, message.role, message.content, message.created_at],
            ).map_err(storage_error)?;
            for draft in actions {
                let action = AssistantAction {
                    id: Uuid::new_v4().to_string(), message_id: Some(message.id.clone()),
                    workspace_id: message.workspace_id.clone(), action: draft.action.clone(),
                    payload: draft.payload.clone(), summary: draft.summary.clone(), status: "pending".into(),
                    created_at: Utc::now().timestamp_millis(), decided_at: None,
                };
                tx.execute(
                    "INSERT INTO assistant_actions (id, message_id, workspace_id, action, payload, summary, status, created_at, decided_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, NULL)",
                    params![action.id, action.message_id, action.workspace_id, action.action, action.payload.to_string(), action.summary, action.created_at],
                ).map_err(storage_error)?;
                saved.push(action);
            }
            tx.commit().map_err(storage_error)?;
        }
        Ok(saved)
    }

    fn list_actions(&self, workspace_id: &str) -> Result<Vec<AssistantAction>, AppError> {
        let conn = self.database().conn();
        let mut stmt = conn.prepare(
            "SELECT id, message_id, workspace_id, action, payload, summary, status, created_at, decided_at FROM assistant_actions WHERE workspace_id = ?1 ORDER BY created_at DESC LIMIT 50",
        ).map_err(storage_error)?;
        let actions = stmt.query_map([workspace_id], row_to_action).map_err(storage_error)?
            .collect::<Result<Vec<_>, _>>().map_err(storage_error)?;
        Ok(actions)
    }

    fn get_action(&self, id: &str) -> Result<AssistantAction, AppError> {
        let conn = self.database().conn();
        conn.query_row(
            "SELECT id, message_id, workspace_id, action, payload, summary, status, created_at, decided_at FROM assistant_actions WHERE id = ?1",
            [id], row_to_action,
        ).optional().map_err(storage_error)?.ok_or_else(|| AppError::NotFound("Assistant action not found".into()))
    }

    fn reject_pending_action(&self, id: &str) -> Result<(), AppError> {
        let changed = self.database().conn().execute(
            "UPDATE assistant_actions SET status = 'rejected', decided_at = ?2 WHERE id = ?1 AND status = 'pending'",
            params![id, Utc::now().timestamp_millis()],
        ).map_err(storage_error)?;
        if changed == 0 {
            return Err(AppError::Conflict("Assistant action was already decided".into()));
        }
        Ok(())
    }

    fn execute_pending_action(&self, id: &str, effect: ActionEffect) -> Result<Vec<Task>, AppError> {
        let workspace_id = effect_workspace(&effect).to_string();
        {
            let mut conn = self.database().conn();
            let tx = conn.transaction().map_err(storage_error)?;
            let status: String = tx.query_row("SELECT status FROM assistant_actions WHERE id = ?1", [id], |row| row.get(0))
                .optional().map_err(storage_error)?.ok_or_else(|| AppError::NotFound("Assistant action not found".into()))?;
            if status != "pending" {
                return Err(AppError::Conflict("Assistant action was already decided".into()));
            }
            apply_effect(&tx, effect)?;
            tx.execute(
                "UPDATE assistant_actions SET status = 'executed', decided_at = ?2 WHERE id = ?1 AND status = 'pending'",
                params![id, Utc::now().timestamp_millis()],
            ).map_err(storage_error)?;
            tx.commit().map_err(storage_error)?;
        }
        self.list_tasks(&workspace_id, false)
    }

    fn clear_messages(&self, workspace_id: &str) -> Result<(), AppError> {
        self.database().conn().execute("DELETE FROM assistant_messages WHERE workspace_id = ?1", [workspace_id]).map_err(storage_error)?;
        Ok(())
    }
}

fn apply_effect(tx: &Transaction<'_>, effect: ActionEffect) -> Result<(), AppError> {
    match effect {
        ActionEffect::UpsertTask { workspace_id, task } => upsert_effect(tx, &workspace_id, &task),
        ActionEffect::AddLog { workspace_id, task, log } => add_log_effect(tx, &workspace_id, &task, &log),
        ActionEffect::SetDeleted { workspace_id, task_id, deleted } => {
            let deleted_at = deleted.then(|| Utc::now().to_rfc3339());
            tx.execute(
                "UPDATE work_tasks SET deleted_at = ?3, updated_at = ?4 WHERE user_id = ?1 AND (id = ?2 OR parent_id = ?2)",
                params![workspace_id, task_id, deleted_at, Utc::now().timestamp_millis()],
            ).map_err(storage_error)?;
            Ok(())
        }
        ActionEffect::Reorder { workspace_id, ordered_ids } => {
            for (index, task_id) in ordered_ids.iter().enumerate() {
                tx.execute(
                    "UPDATE work_tasks SET position = ?3, updated_at = ?4 WHERE user_id = ?1 AND id = ?2",
                    params![workspace_id, task_id, ((index + 1) * 100) as i64, Utc::now().timestamp_millis()],
                ).map_err(storage_error)?;
            }
            Ok(())
        }
    }
}

fn upsert_effect(tx: &Transaction<'_>, workspace_id: &str, task: &Task) -> Result<(), AppError> {
    let existing = tx.query_row("SELECT user_id, created_at FROM work_tasks WHERE id = ?1", [&task.id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    }).optional().map_err(storage_error)?;
    if existing.as_ref().is_some_and(|(owner, _)| owner != workspace_id) {
        return Err(AppError::Conflict("Task ID belongs to another workspace".into()));
    }
    let created_at = existing.map_or(task.created_at, |(_, created_at)| created_at);
    tx.execute(
        "INSERT INTO work_tasks (id, user_id, title, description, project, status, priority, start_date, due_date, progress, position, parent_id, source_url, created_at, updated_at, deleted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, NULL)
         ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, title=excluded.title, description=excluded.description,
         project=excluded.project, status=excluded.status, priority=excluded.priority, start_date=excluded.start_date,
         due_date=excluded.due_date, progress=excluded.progress, position=excluded.position, parent_id=excluded.parent_id,
         source_url=excluded.source_url, created_at=excluded.created_at, updated_at=excluded.updated_at, deleted_at=NULL",
        params![task.id, workspace_id, task.title, task.description, task.project, status_str(task.status), priority_str(task.priority),
            task.start_date, task.due_date, task.progress, task.position, task.parent_id, task.source_url, created_at, Utc::now().timestamp_millis()],
    ).map_err(storage_error)?;
    tx.execute("DELETE FROM task_checklist_items WHERE task_id = ?1", [&task.id]).map_err(storage_error)?;
    for item in &task.checklist {
        tx.execute(
            "INSERT INTO task_checklist_items (id, task_id, content, completed, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![item.id, task.id, item.content, item.completed, item.position, item.created_at],
        ).map_err(storage_error)?;
    }
    Ok(())
}

fn add_log_effect(tx: &Transaction<'_>, workspace_id: &str, task: &Task, log: &WorkLog) -> Result<(), AppError> {
    tx.execute(
        "INSERT INTO task_work_logs (id, task_id, date, content, progress, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![log.id, task.id, log.date, log.content, log.progress, status_str(log.status), log.created_at],
    ).map_err(storage_error)?;
    tx.execute(
        "UPDATE work_tasks SET status = ?3, progress = ?4, updated_at = ?5 WHERE user_id = ?1 AND id = ?2",
        params![workspace_id, task.id, status_str(task.status), task.progress, Utc::now().timestamp_millis()],
    ).map_err(storage_error)?;
    for item in &task.checklist {
        tx.execute("UPDATE task_checklist_items SET completed = ?2 WHERE id = ?1", params![item.id, item.completed]).map_err(storage_error)?;
    }
    Ok(())
}

fn row_to_action(row: &Row<'_>) -> rusqlite::Result<AssistantAction> {
    let payload: String = row.get(4)?;
    let payload: Value = serde_json::from_str(&payload).map_err(|_| rusqlite::Error::InvalidQuery)?;
    Ok(AssistantAction {
        id: row.get(0)?, message_id: row.get(1)?, workspace_id: row.get(2)?, action: row.get(3)?,
        payload, summary: row.get(5)?, status: row.get(6)?, created_at: row.get(7)?, decided_at: row.get(8)?,
    })
}

fn effect_workspace(effect: &ActionEffect) -> &str {
    match effect {
        ActionEffect::UpsertTask { workspace_id, .. }
        | ActionEffect::AddLog { workspace_id, .. }
        | ActionEffect::SetDeleted { workspace_id, .. }
        | ActionEffect::Reorder { workspace_id, .. } => workspace_id,
    }
}

fn storage_error(error: rusqlite::Error) -> AppError {
    AppError::Storage(error.to_string())
}
