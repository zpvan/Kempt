mod common;

use common::assistant::*;

#[tokio::test]
async fn rejected_action_does_not_modify_tasks() {
    let fixture = AssistantFixture::new();
    let pending = fixture.insert_action("create_task").await;
    fixture.service.reject_action(&pending.id).unwrap();
    assert!(fixture.service.list_tasks("admin").unwrap().is_empty());
    assert_eq!(
        fixture.service.list_actions("admin").unwrap()[0].status,
        "rejected"
    );
}

#[tokio::test]
async fn executed_action_is_atomic_and_cannot_run_twice() {
    let fixture = AssistantFixture::new();
    let pending = fixture.insert_action("create_task").await;
    let tasks = fixture.service.execute_action(&pending.id).unwrap();
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].title, "Created");
    assert_eq!(
        fixture.service.list_actions("admin").unwrap()[0].status,
        "executed"
    );
    assert!(fixture.service.execute_action(&pending.id).is_err());
}

#[tokio::test]
async fn provider_failure_preserves_tasks_and_user_history() {
    let fixture = AssistantFixture::new();
    fixture
        .service
        .save_model(sample_model(), Some("secret-value".into()))
        .await
        .unwrap();
    assert!(fixture
        .service
        .chat(kempt_core::chat::ChatRequest {
            workspace_id: "admin".into(),
            model_id: None,
            message: "Hello".into(),
        })
        .await
        .is_err());
    assert!(fixture.service.list_tasks("admin").unwrap().is_empty());
    let history = fixture.service.list_messages("admin").unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].content, "Hello");
}
