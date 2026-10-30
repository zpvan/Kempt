use kempt_core::model::Task;
use kempt_core::repository::TaskRepository;
use kempt_core::service::AppService;
use kempt_storage::{open_kempt_database, Database, SqliteRepository};
use std::path::{Path, PathBuf};

struct MigrationDirs {
    _root: tempfile::TempDir,
    old_dir: PathBuf,
    new_dir: PathBuf,
}

impl MigrationDirs {
    fn new() -> Self {
        let root = tempfile::tempdir().unwrap();
        let old_dir = root.path().join("old");
        let new_dir = root.path().join("new");
        std::fs::create_dir_all(&old_dir).unwrap();
        std::fs::create_dir_all(&new_dir).unwrap();
        Self { _root: root, old_dir, new_dir }
    }

    fn create_legacy_with_task(&self, title: &str) {
        create_with_task(&self.old_dir, "kempt.db", title);
    }

    fn create_new_with_task(&self, title: &str) {
        create_with_task(&self.new_dir, "kempt.db", title);
    }
}

fn create_with_task(dir: &Path, file: &str, title: &str) {
    let database = Database::open(&dir.join(file)).unwrap();
    database.migrate().unwrap();
    let service = AppService::new(SqliteRepository::new(database));
    let mut task = Task::new("task", title);
    task.project = "Project".into();
    task.start_date = "2026-01-01".into();
    task.due_date = "2026-01-02".into();
    service.upsert_task("shella", task).unwrap();
}

#[test]
fn migrates_legacy_snapshot() {
    let dirs = MigrationDirs::new();
    dirs.create_legacy_with_task("legacy-task");
    let database = open_kempt_database(&dirs.new_dir, &dirs.old_dir).unwrap();
    let repo = SqliteRepository::new(database);
    assert_eq!(repo.list_tasks("shella", false).unwrap()[0].title, "legacy-task");
    assert!(dirs.old_dir.join("kempt.db").exists());
}

#[test]
fn never_overwrites_existing_new_database() {
    let dirs = MigrationDirs::new();
    dirs.create_legacy_with_task("legacy-task");
    dirs.create_new_with_task("new-task");
    let database = open_kempt_database(&dirs.new_dir, &dirs.old_dir).unwrap();
    let repo = SqliteRepository::new(database);
    assert_eq!(repo.list_tasks("shella", false).unwrap()[0].title, "new-task");
}

#[test]
fn starts_empty_without_legacy_database() {
    let dirs = MigrationDirs::new();
    let database = open_kempt_database(&dirs.new_dir, &dirs.old_dir).unwrap();
    database.migrate().unwrap();
    let repo = SqliteRepository::new(database);
    assert!(repo.list_tasks("shella", false).unwrap().is_empty());
}

#[test]
fn corrupt_legacy_does_not_create_new_database() {
    let dirs = MigrationDirs::new();
    std::fs::write(dirs.old_dir.join("kempt.db"), b"not a sqlite database").unwrap();
    assert!(open_kempt_database(&dirs.new_dir, &dirs.old_dir).is_err());
    assert!(!dirs.new_dir.join("kempt.db").exists());
}
