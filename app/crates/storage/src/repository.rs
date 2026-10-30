use crate::Database;
use chrono::{DateTime, Utc};
use kempt_core::{
    error::AppError,
    model::{ChecklistItem, Priority, Status, Task, WorkLog},
    repository::{AppUser, CreateUserResult, TaskRepository},
};
use rusqlite::{params, Connection, OptionalExtension, Row};
use std::collections::HashMap;
use uuid::Uuid;

pub struct SqliteRepository {
    database: Database,
}

impl SqliteRepository {
    pub fn new(database: Database) -> Self {
        Self { database }
    }

    pub fn database(&self) -> &Database {
        &self.database
    }
}

const TASK_COLUMNS: &str = "id, title, description, project, status, priority, start_date, due_date, progress, position, parent_id, source_url, created_at, deleted_at";

impl TaskRepository for SqliteRepository {
    fn list_users(&self) -> Result<Vec<AppUser>, AppError> {
        let conn = self.database.conn();
        let mut stmt = conn
            .prepare("SELECT id, name, is_default, created_at FROM app_users ORDER BY is_default DESC, created_at ASC")
            .map_err(storage_error)?;
        let users = stmt
            .query_map([], |row| {
                let created_at: i64 = row.get(3)?;
                Ok(AppUser {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    is_default: row.get(2)?,
                    created_at: iso_timestamp(created_at),
                })
            })
            .map_err(storage_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(storage_error)?;
        Ok(users)
    }

    fn create_user(&self, name: &str) -> Result<CreateUserResult, AppError> {
        let id = Uuid::new_v4().to_string();
        let created_at = Utc::now().timestamp_millis();
        self.database
            .conn()
            .execute(
                "INSERT INTO app_users (id, name, is_default, created_at) VALUES (?1, ?2, 0, ?3)",
                params![id, name, created_at],
            )
            .map_err(storage_error)?;
        let user = AppUser {
            id,
            name: name.into(),
            is_default: false,
            created_at: iso_timestamp(created_at),
        };
        Ok(CreateUserResult {
            user,
            users: self.list_users()?,
        })
    }

    fn delete_user(&self, id: &str) -> Result<Vec<AppUser>, AppError> {
        self.database
            .conn()
            .execute("DELETE FROM app_users WHERE id = ?1", [id])
            .map_err(storage_error)?;
        self.list_users()
    }

    fn list_tasks(&self, user_id: &str, deleted: bool) -> Result<Vec<Task>, AppError> {
        let conn = self.database.conn();
        query_tasks(&conn, user_id, deleted)
    }

    fn get_task(&self, user_id: &str, id: &str) -> Result<Task, AppError> {
        self.list_tasks(user_id, false)?
            .into_iter()
            .chain(self.list_tasks(user_id, true)?)
            .find(|task| task.id == id)
            .ok_or_else(|| AppError::NotFound("Task not found".into()))
    }

    fn upsert_task(&self, user_id: &str, task: &Task) -> Result<Vec<Task>, AppError> {
        {
            let mut conn = self.database.conn();
            let tx = conn.transaction().map_err(storage_error)?;
            let workspace_exists: i64 = tx
                .query_row("SELECT COUNT(*) FROM app_users WHERE id = ?1", [user_id], |row| row.get(0))
                .map_err(storage_error)?;
            if workspace_exists == 0 {
                return Err(AppError::NotFound("Workspace not found".into()));
            }
            let existing = tx
                .query_row(
                    "SELECT user_id, created_at FROM work_tasks WHERE id = ?1",
                    [&task.id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
                )
                .optional()
                .map_err(storage_error)?;
            if let Some((owner, _)) = &existing {
                if owner != user_id {
                    return Err(AppError::Conflict(
                        "Task ID belongs to another workspace".into(),
                    ));
                }
            }
            let created_at = existing.map_or(task.created_at, |(_, created_at)| created_at);
            tx.execute(
                "INSERT INTO work_tasks (id, user_id, title, description, project, status, priority, start_date, due_date, progress, position, parent_id, source_url, created_at, updated_at, deleted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, NULL)
                 ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, title=excluded.title, description=excluded.description,
                 project=excluded.project, status=excluded.status, priority=excluded.priority, start_date=excluded.start_date,
                 due_date=excluded.due_date, progress=excluded.progress, position=excluded.position, parent_id=excluded.parent_id,
                 source_url=excluded.source_url, created_at=excluded.created_at, updated_at=excluded.updated_at, deleted_at=NULL",
                params![
                    task.id, user_id, task.title, task.description, task.project, status_str(task.status),
                    priority_str(task.priority), task.start_date, task.due_date, task.progress, task.position,
                    task.parent_id, task.source_url, created_at, Utc::now().timestamp_millis()
                ],
            )
            .map_err(storage_error)?;
            tx.execute("DELETE FROM task_checklist_items WHERE task_id = ?1", [&task.id])
                .map_err(storage_error)?;
            for item in &task.checklist {
                tx.execute(
                    "INSERT INTO task_checklist_items (id, task_id, content, completed, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![item.id, task.id, item.content, item.completed, item.position, item.created_at],
                )
                .map_err(storage_error)?;
            }
            tx.commit().map_err(storage_error)?;
        }
        self.list_tasks(user_id, false)
    }

    fn set_deleted(&self, user_id: &str, id: &str, deleted: bool) -> Result<Vec<Task>, AppError> {
        let deleted_at = deleted.then(|| Utc::now().to_rfc3339());
        self.database
            .conn()
            .execute(
                "UPDATE work_tasks SET deleted_at = ?3, updated_at = ?4 WHERE user_id = ?1 AND (id = ?2 OR parent_id = ?2)",
                params![user_id, id, deleted_at, Utc::now().timestamp_millis()],
            )
            .map_err(storage_error)?;
        self.list_tasks(user_id, false)
    }

    fn purge_task(&self, user_id: &str, id: &str) -> Result<Vec<Task>, AppError> {
        self.database
            .conn()
            .execute("DELETE FROM work_tasks WHERE user_id = ?1 AND id = ?2", params![user_id, id])
            .map_err(storage_error)?;
        self.list_tasks(user_id, true)
    }

    fn reorder(&self, user_id: &str, ordered_ids: &[String]) -> Result<Vec<Task>, AppError> {
        {
            let mut conn = self.database.conn();
            let tx = conn.transaction().map_err(storage_error)?;
            for (index, id) in ordered_ids.iter().enumerate() {
                tx.execute(
                    "UPDATE work_tasks SET position = ?3, updated_at = ?4 WHERE user_id = ?1 AND id = ?2",
                    params![user_id, id, ((index + 1) * 100) as i64, Utc::now().timestamp_millis()],
                )
                .map_err(storage_error)?;
            }
            tx.commit().map_err(storage_error)?;
        }
        self.list_tasks(user_id, false)
    }

    fn add_log(&self, user_id: &str, task: &Task, log: &WorkLog) -> Result<Vec<Task>, AppError> {
        {
            let mut conn = self.database.conn();
            let tx = conn.transaction().map_err(storage_error)?;
            tx.execute(
                "INSERT INTO task_work_logs (id, task_id, date, content, progress, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![log.id, task.id, log.date, log.content, log.progress, status_str(log.status), log.created_at],
            )
            .map_err(storage_error)?;
            tx.execute(
                "UPDATE work_tasks SET status = ?3, progress = ?4, updated_at = ?5 WHERE user_id = ?1 AND id = ?2",
                params![user_id, task.id, status_str(task.status), task.progress, Utc::now().timestamp_millis()],
            )
            .map_err(storage_error)?;
            for item in &task.checklist {
                tx.execute(
                    "UPDATE task_checklist_items SET completed = ?2 WHERE id = ?1",
                    params![item.id, item.completed],
                )
                .map_err(storage_error)?;
            }
            tx.commit().map_err(storage_error)?;
        }
        self.list_tasks(user_id, false)
    }

    fn update_log(&self, user_id: &str, log: &WorkLog) -> Result<Vec<Task>, AppError> {
        let changed = self.database.conn().execute(
            "UPDATE task_work_logs SET date = ?3, content = ?4, progress = ?5, status = ?6
             WHERE id = ?1 AND task_id IN (SELECT id FROM work_tasks WHERE user_id = ?2)",
            params![log.id, user_id, log.date, log.content, log.progress, status_str(log.status)],
        ).map_err(storage_error)?;
        if changed == 0 {
            return Err(AppError::NotFound("Work log not found".into()));
        }
        let task_id: String = self.database.conn().query_row(
            "SELECT task_id FROM task_work_logs WHERE id = ?1", [&log.id], |row| row.get(0),
        ).map_err(storage_error)?;
        let _ = task_id;
        self.list_tasks(user_id, false)
    }

    fn delete_log(&self, user_id: &str, id: &str) -> Result<Vec<Task>, AppError> {
        let changed = self.database.conn().execute(
            "DELETE FROM task_work_logs WHERE id = ?1 AND task_id IN (SELECT id FROM work_tasks WHERE user_id = ?2)",
            params![id, user_id],
        ).map_err(storage_error)?;
        if changed == 0 {
            return Err(AppError::NotFound("Work log not found".into()));
        }
        self.list_tasks(user_id, false)
    }
}

fn query_tasks(conn: &Connection, user_id: &str, deleted: bool) -> Result<Vec<Task>, AppError> {
    let sql = format!(
        "SELECT {TASK_COLUMNS} FROM work_tasks WHERE user_id = ?1 AND deleted_at IS {} ORDER BY position ASC, created_at DESC",
        if deleted { "NOT NULL" } else { "NULL" }
    );
    let mut stmt = conn.prepare(&sql).map_err(storage_error)?;
    let mut tasks = stmt
        .query_map([user_id], row_to_task)
        .map_err(storage_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(storage_error)?;
    if tasks.is_empty() {
        return Ok(tasks);
    }

    let mut logs: HashMap<String, Vec<WorkLog>> = HashMap::new();
    let mut stmt = conn.prepare(
        "SELECT l.id, l.date, l.content, l.progress, l.status, l.created_at, l.task_id
         FROM task_work_logs l JOIN work_tasks t ON t.id = l.task_id
         WHERE t.user_id = ?1 ORDER BY l.created_at DESC",
    ).map_err(storage_error)?;
    let rows = stmt.query_map([user_id], |row| {
        let task_id: String = row.get(6)?;
        let status: String = row.get(4)?;
        Ok((task_id, WorkLog {
            id: row.get(0)?, date: row.get(1)?, content: row.get(2)?, progress: row.get(3)?,
            status: parse_status(&status).map_err(|_| rusqlite::Error::InvalidQuery)?, created_at: row.get(5)?,
        }))
    }).map_err(storage_error)?;
    for row in rows {
        let (task_id, log) = row.map_err(storage_error)?;
        logs.entry(task_id).or_default().push(log);
    }

    let mut checklist: HashMap<String, Vec<ChecklistItem>> = HashMap::new();
    let mut stmt = conn.prepare(
        "SELECT c.id, c.content, c.completed, c.position, c.created_at, c.task_id
         FROM task_checklist_items c JOIN work_tasks t ON t.id = c.task_id
         WHERE t.user_id = ?1 ORDER BY c.position ASC, c.created_at ASC",
    ).map_err(storage_error)?;
    let rows = stmt.query_map([user_id], |row| {
        Ok((row.get::<_, String>(5)?, ChecklistItem {
            id: row.get(0)?, content: row.get(1)?, completed: row.get(2)?,
            position: row.get(3)?, created_at: row.get(4)?,
        }))
    }).map_err(storage_error)?;
    for row in rows {
        let (task_id, item) = row.map_err(storage_error)?;
        checklist.entry(task_id).or_default().push(item);
    }

    for task in &mut tasks {
        task.logs = logs.remove(&task.id).unwrap_or_default();
        task.checklist = checklist.remove(&task.id).unwrap_or_default();
    }
    Ok(tasks)
}

fn row_to_task(row: &Row<'_>) -> rusqlite::Result<Task> {
    let status: String = row.get(4)?;
    let priority: String = row.get(5)?;
    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        project: row.get(3)?,
        status: parse_status(&status).map_err(|_| rusqlite::Error::InvalidQuery)?,
        priority: parse_priority(&priority).map_err(|_| rusqlite::Error::InvalidQuery)?,
        start_date: row.get(6)?,
        due_date: row.get(7)?,
        progress: row.get(8)?,
        position: row.get(9)?,
        parent_id: row.get(10)?,
        source_url: row.get(11)?,
        created_at: row.get(12)?,
        deleted_at: row.get(13)?,
        logs: vec![],
        checklist: vec![],
    })
}

fn storage_error(error: rusqlite::Error) -> AppError {
    AppError::Storage(error.to_string())
}

fn status_str(status: Status) -> &'static str {
    match status {
        Status::Todo => "todo",
        Status::Doing => "doing",
        Status::Done => "done",
    }
}

fn priority_str(priority: Priority) -> &'static str {
    match priority {
        Priority::Low => "low",
        Priority::Medium => "medium",
        Priority::High => "high",
    }
}

fn parse_status(value: &str) -> Result<Status, ()> {
    match value {
        "todo" => Ok(Status::Todo),
        "doing" => Ok(Status::Doing),
        "done" => Ok(Status::Done),
        _ => Err(()),
    }
}

fn parse_priority(value: &str) -> Result<Priority, ()> {
    match value {
        "low" => Ok(Priority::Low),
        "medium" => Ok(Priority::Medium),
        "high" => Ok(Priority::High),
        _ => Err(()),
    }
}

fn iso_timestamp(milliseconds: i64) -> String {
    DateTime::from_timestamp_millis(milliseconds)
        .unwrap_or_else(|| DateTime::from_timestamp(0, 0).unwrap())
        .to_rfc3339()
}
