mod common;

use common::*;

#[test]
fn fresh_database_seeds_admin_workspace() {
    let fixture = Fixture::new();
    let users = fixture.service.list_users().unwrap();
    assert_eq!(users.len(), 1);
    assert_eq!(users[0].id, "admin");
    assert_eq!(users[0].name, "admin");
    assert!(users[0].is_default);
}

#[test]
fn creates_members_and_rejects_invalid_names() {
    let fixture = Fixture::new();
    assert_eq!(fixture.service.list_users().unwrap().len(), 1);
    let created = fixture.service.create_user("  Alice  ").unwrap();
    assert_eq!(created.user.name, "Alice");
    assert_eq!(created.users.len(), 2);
    assert!(fixture.service.create_user("Alice").is_err());
    assert!(fixture.service.create_user("   ").is_err());
    assert!(fixture.service.delete_user("admin").is_err());
}

#[test]
fn upsert_replaces_checklist_but_preserves_logs() {
    let fixture = Fixture::new();
    let mut task = sample_task("task-1");
    task.checklist.push(sample_checklist("item-1"));
    fixture.service.upsert_task("admin", task).unwrap();
    fixture
        .service
        .add_log("admin", "task-1", &sample_log("log-1"))
        .unwrap();
    let mut edited = fixture.service.list_tasks("admin").unwrap().remove(0);
    edited.checklist.clear();
    edited.logs.clear();
    fixture.service.upsert_task("admin", edited).unwrap();
    let listed = fixture.service.list_tasks("admin").unwrap();
    assert!(listed[0].checklist.is_empty());
    assert_eq!(listed[0].logs.len(), 1);
}

#[test]
fn rejects_invalid_progress_and_unknown_workspace() {
    let fixture = Fixture::new();
    let mut task = sample_task("task-1");
    task.progress = 101;
    assert!(fixture.service.upsert_task("admin", task.clone()).is_err());
    assert!(fixture.service.upsert_task("missing", task).is_err());
}
