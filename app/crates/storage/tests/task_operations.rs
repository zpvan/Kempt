mod common;

use common::*;
use kempt_core::model::Status;

#[test]
fn recycle_bin_handles_direct_children_and_purges_only_target() {
    let fixture = Fixture::with_tasks(&["parent", "child"]);
    let mut child = fixture
        .service
        .list_tasks("shella")
        .unwrap()
        .into_iter()
        .find(|task| task.id == "child")
        .unwrap();
    child.parent_id = Some("parent".into());
    fixture.service.upsert_task("shella", child).unwrap();

    assert!(fixture
        .service
        .set_deleted("shella", "parent", true)
        .unwrap()
        .is_empty());
    assert_eq!(fixture.service.trash("shella").unwrap().len(), 2);
    assert_eq!(
        fixture
            .service
            .set_deleted("shella", "parent", false)
            .unwrap()
            .len(),
        2
    );

    fixture
        .service
        .set_deleted("shella", "parent", true)
        .unwrap();
    let remaining = fixture.service.purge_task("shella", "parent").unwrap();
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].id, "child");
}

#[test]
fn log_updates_are_atomic_and_edits_do_not_recompute_task() {
    let fixture = Fixture::with_tasks(&["task"]);
    let mut log = sample_log("log");
    log.status = Status::Doing;
    log.progress = 40;
    fixture.service.add_log("shella", "task", &log).unwrap();
    let task = fixture.service.list_tasks("shella").unwrap().remove(0);
    assert_eq!(task.status, Status::Doing);
    assert_eq!(task.progress, 40);
    assert_eq!(task.logs.len(), 1);

    log.content = "Edited".into();
    log.status = Status::Done;
    log.progress = 100;
    fixture.service.update_log("shella", &log).unwrap();
    let task = fixture.service.list_tasks("shella").unwrap().remove(0);
    assert_eq!(task.logs[0].content, "Edited");
    assert_eq!(task.status, Status::Doing);
    assert_eq!(task.progress, 40);

    fixture.service.delete_log("shella", "log").unwrap();
    assert!(fixture.service.list_tasks("shella").unwrap()[0]
        .logs
        .is_empty());
}

#[test]
fn checklist_drives_progress_and_status_transitions() {
    let fixture = Fixture::new();
    let mut task = sample_task("task");
    task.checklist = vec![sample_checklist("one"), sample_checklist("two")];
    task.checklist[0].completed = true;
    let listed = fixture.service.upsert_task("shella", task).unwrap();
    assert_eq!(listed[0].progress, 50);

    let done = fixture
        .service
        .set_status("shella", "task", Status::Done)
        .unwrap();
    assert_eq!(done[0].progress, 100);
    assert!(done[0].checklist.iter().all(|item| item.completed));

    let doing = fixture
        .service
        .set_status("shella", "task", Status::Doing)
        .unwrap();
    assert_eq!(doing[0].status, Status::Doing);
    assert_eq!(doing[0].progress, 100);
    assert!(doing[0].checklist.iter().all(|item| item.completed));
}

#[test]
fn reorder_preserves_unlisted_tasks() {
    let fixture = Fixture::with_tasks(&["a", "b", "c"]);
    let listed = fixture
        .service
        .reorder("shella", &["b".into(), "a".into()])
        .unwrap();
    assert_eq!(
        listed.iter().find(|task| task.id == "b").unwrap().position,
        100
    );
    assert_eq!(
        listed.iter().find(|task| task.id == "a").unwrap().position,
        200
    );
    assert!(listed.iter().any(|task| task.id == "c"));
}

#[test]
fn upsert_preserves_created_at_and_rejects_cross_workspace_ids() {
    let fixture = Fixture::new();
    fixture
        .service
        .upsert_task("shella", sample_task("shared"))
        .unwrap();
    let mut edited = fixture.service.list_tasks("shella").unwrap().remove(0);
    edited.created_at = 999;
    edited.title = "Edited".into();
    let listed = fixture.service.upsert_task("shella", edited).unwrap();
    assert_eq!(listed[0].created_at, 1);

    let alice = fixture.service.create_user("Alice").unwrap().user;
    assert!(fixture
        .service
        .upsert_task(&alice.id, sample_task("shared"))
        .is_err());
}
