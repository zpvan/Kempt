mod common;

use common::*;

#[test]
fn rejects_legacy_v2_backup() {
    let fixture = Fixture::new();
    let mut backup = fixture.service.export_backup().unwrap();
    backup.format = "kempt-full-backup".into();
    backup.version = 2;
    assert_eq!(fixture.service.import_backup(backup).unwrap_err().code(), "VALIDATION");
}

#[test]
fn new_export_uses_kempt_v3() {
    let fixture = Fixture::new();
    let backup = fixture.service.export_backup().unwrap();
    assert_eq!(backup.app, "Kempt");
    assert_eq!(backup.format, "kempt-full-backup");
    assert_eq!(backup.version, 3);
}

#[test]
fn backup_round_trip_preserves_tasks_logs_checklist_and_trash() {
    let fixture = Fixture::new();
    let mut task = sample_task("active");
    task.checklist.push(sample_checklist("item"));
    fixture.service.upsert_task("shella", task).unwrap();
    fixture
        .service
        .add_log("shella", "active", &sample_log("log"))
        .unwrap();
    fixture
        .service
        .upsert_task("shella", sample_task("deleted"))
        .unwrap();
    fixture
        .service
        .set_deleted("shella", "deleted", true)
        .unwrap();
    let backup = fixture.service.export_backup().unwrap();

    fixture.service.purge_task("shella", "deleted").unwrap();
    fixture
        .service
        .set_deleted("shella", "active", true)
        .unwrap();
    let summary = fixture.service.import_backup(backup).unwrap();
    assert_eq!(summary.tasks, 2);
    assert_eq!(summary.logs, 1);
    assert_eq!(summary.checklist, 1);
    assert_eq!(summary.deleted_tasks, 1);
    assert_eq!(
        fixture.service.list_tasks("shella").unwrap()[0].logs.len(),
        1
    );
    assert_eq!(fixture.service.trash("shella").unwrap()[0].id, "deleted");
    assert!(
        fixture
            ._dir
            .path()
            .join("backups")
            .read_dir()
            .unwrap()
            .count()
            >= 1
    );
}

#[test]
fn rejects_more_than_twenty_thousand_tasks() {
    let fixture = Fixture::with_tasks(&["existing"]);
    let mut backup = fixture.service.export_backup().unwrap();
    let task = backup.tasks[0].clone();
    backup.tasks = vec![task; 20_001];
    assert!(fixture.service.import_backup(backup).is_err());
}

#[test]
fn failed_restore_preserves_existing_tasks() {
    let fixture = Fixture::with_tasks(&["existing"]);
    let mut backup = fixture.service.export_backup().unwrap();
    backup.tasks[0].user_id = "unknown".into();
    assert!(fixture.service.import_backup(backup).is_err());
    assert_eq!(
        fixture.service.list_tasks("shella").unwrap()[0].id,
        "existing"
    );
}

#[test]
fn restore_ignores_legacy_owner_and_rejects_invalid_version() {
    let fixture = Fixture::with_tasks(&["existing"]);
    let mut backup = fixture.service.export_backup().unwrap();
    backup.users[0].owner_union_id = Some("another-account".into());
    assert!(fixture.service.import_backup(backup.clone()).is_ok());
    backup.version = 2;
    assert!(fixture.service.import_backup(backup).is_err());
}
