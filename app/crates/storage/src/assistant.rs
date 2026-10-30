use crate::{repository::iso_timestamp, SqliteRepository};
use chrono::{DateTime, Utc};
use kempt_core::{
    assistant::{AssistantModel, AssistantModelRecord, AssistantRepository, Provider},
    error::AppError,
};
use rusqlite::{params, OptionalExtension, Row};

impl AssistantRepository for SqliteRepository {
    fn list_models(&self) -> Result<Vec<AssistantModel>, AppError> {
        let conn = self.database().conn();
        let mut stmt = conn.prepare(
            "SELECT id, provider, name, base_url, model, secret_ref, is_default, created_at FROM assistant_models ORDER BY is_default DESC, created_at ASC",
        ).map_err(storage_error)?;
        let rows = stmt
            .query_map([], row_to_model_record)
            .map_err(storage_error)?;
        let mut models = Vec::new();
        for row in rows {
            models.push(row.map_err(storage_error)?.model);
        }
        Ok(models)
    }

    fn get_model_record(&self, id: &str) -> Result<AssistantModelRecord, AppError> {
        let conn = self.database().conn();
        conn.query_row(
            "SELECT id, provider, name, base_url, model, secret_ref, is_default, created_at FROM assistant_models WHERE id = ?1",
            [id],
            row_to_model_record,
        ).optional().map_err(storage_error)?.ok_or_else(|| AppError::NotFound("Assistant model not found".into()))
    }

    fn save_model_record(
        &self,
        record: &AssistantModelRecord,
    ) -> Result<Vec<AssistantModel>, AppError> {
        let model = &record.model;
        let created_at = DateTime::parse_from_rfc3339(&model.created_at)
            .map(|date| date.timestamp_millis())
            .unwrap_or_else(|_| Utc::now().timestamp_millis());
        self.database().conn().execute(
            "INSERT INTO assistant_models (id, provider, name, base_url, model, secret_ref, is_default, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET provider=excluded.provider, name=excluded.name, base_url=excluded.base_url,
             model=excluded.model, secret_ref=excluded.secret_ref, is_default=excluded.is_default",
            params![model.id, provider_str(model.provider), model.name, model.base_url, model.model,
                record.secret_ref, model.is_default, created_at],
        ).map_err(storage_error)?;
        self.list_models()
    }

    fn set_default_model(&self, id: &str) -> Result<Vec<AssistantModel>, AppError> {
        {
            let mut conn = self.database().conn();
            let tx = conn.transaction().map_err(storage_error)?;
            tx.execute("UPDATE assistant_models SET is_default = 0", [])
                .map_err(storage_error)?;
            let changed = tx
                .execute(
                    "UPDATE assistant_models SET is_default = 1 WHERE id = ?1",
                    [id],
                )
                .map_err(storage_error)?;
            if changed == 0 {
                return Err(AppError::NotFound("Assistant model not found".into()));
            }
            tx.commit().map_err(storage_error)?;
        }
        self.list_models()
    }

    fn delete_model(&self, id: &str) -> Result<Vec<AssistantModel>, AppError> {
        {
            let mut conn = self.database().conn();
            let tx = conn.transaction().map_err(storage_error)?;
            let was_default = tx
                .query_row(
                    "SELECT is_default FROM assistant_models WHERE id = ?1",
                    [id],
                    |row| row.get::<_, bool>(0),
                )
                .optional()
                .map_err(storage_error)?
                .ok_or_else(|| AppError::NotFound("Assistant model not found".into()))?;
            tx.execute("DELETE FROM assistant_models WHERE id = ?1", [id])
                .map_err(storage_error)?;
            if was_default {
                tx.execute(
                    "UPDATE assistant_models SET is_default = 1 WHERE id = (SELECT id FROM assistant_models ORDER BY created_at ASC LIMIT 1)",
                    [],
                ).map_err(storage_error)?;
            }
            tx.commit().map_err(storage_error)?;
        }
        self.list_models()
    }
}

pub(crate) fn row_to_model_record(row: &Row<'_>) -> rusqlite::Result<AssistantModelRecord> {
    let provider: String = row.get(1)?;
    let created_at: i64 = row.get(7)?;
    Ok(AssistantModelRecord {
        model: AssistantModel {
            id: row.get(0)?,
            provider: match provider.as_str() {
                "kimi" => Provider::Kimi,
                "minimax" => Provider::MiniMax,
                _ => return Err(rusqlite::Error::InvalidQuery),
            },
            name: row.get(2)?,
            base_url: row.get(3)?,
            model: row.get(4)?,
            is_default: row.get(6)?,
            created_at: iso_timestamp(created_at),
        },
        secret_ref: row.get(5)?,
    })
}

fn provider_str(provider: Provider) -> &'static str {
    match provider {
        Provider::Kimi => "kimi",
        Provider::MiniMax => "minimax",
    }
}

fn storage_error(error: rusqlite::Error) -> AppError {
    AppError::Storage(error.to_string())
}
