mod common;

use common::*;
use kempt_core::dispatch::dispatch;
use serde_json::json;

#[tokio::test]
async fn dispatch_uses_public_method_names() {
    let fixture = Fixture::new();
    let result = dispatch(&fixture.service, "task.list", json!({"userId":"shella"})).await.unwrap();
    assert_eq!(result, json!([]));
    let error = dispatch(&fixture.service, "task.unknown", json!({})).await.unwrap_err();
    assert_eq!(error.code(), "NOT_FOUND");
}

#[tokio::test]
async fn dispatch_validates_payload_and_returns_camel_case_tasks() {
    let fixture = Fixture::new();
    let error = dispatch(&fixture.service, "task.upsert", json!({"userId":"shella"})).await.unwrap_err();
    assert_eq!(error.code(), "VALIDATION");
    let result = dispatch(&fixture.service, "task.upsert", json!({
        "userId":"shella",
        "task": {
            "id":"task-1","title":"Task","description":"","project":"Project","status":"todo","priority":"medium",
            "startDate":"2026-01-01","dueDate":"2026-01-02","progress":0,"position":0,"createdAt":1,"logs":[],"checklist":[]
        }
    })).await.unwrap();
    assert_eq!(result[0]["createdAt"], 1);
    assert!(result[0].get("created_at").is_none());
}
