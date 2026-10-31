#![allow(dead_code)]

pub mod assistant;

use kempt_core::model::{ChecklistItem, Status, Task, WorkLog};
use kempt_core::service::AppService;
use kempt_storage::{Database, SqliteRepository};

pub struct Fixture {
    pub _dir: tempfile::TempDir,
    pub service: AppService<SqliteRepository>,
}

impl Fixture {
    pub fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("test.db")).unwrap();
        db.migrate().unwrap();
        Self {
            _dir: dir,
            service: AppService::new(SqliteRepository::new(db)),
        }
    }

    pub fn with_tasks(ids: &[&str]) -> Self {
        let fixture = Self::new();
        for id in ids {
            fixture
                .service
                .upsert_task("admin", sample_task(id))
                .unwrap();
        }
        fixture
    }
}

pub fn sample_task(id: &str) -> Task {
    let mut task = Task::new(id, "Task");
    task.project = "Project".into();
    task.start_date = "2026-01-01".into();
    task.due_date = "2026-01-02".into();
    task.created_at = 1;
    task
}

pub fn sample_log(id: &str) -> WorkLog {
    WorkLog {
        id: id.into(),
        date: "2026-01-01".into(),
        content: "Log".into(),
        progress: 0,
        status: Status::Todo,
        created_at: 1,
    }
}

pub fn sample_checklist(id: &str) -> ChecklistItem {
    ChecklistItem {
        id: id.into(),
        content: "Item".into(),
        completed: false,
        position: 0,
        created_at: 1,
    }
}
