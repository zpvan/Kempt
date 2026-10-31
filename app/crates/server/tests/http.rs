use http_body_util::BodyExt;
use kempt_server::{build_router, ServeOptions};
use tower::ServiceExt;

#[tokio::test]
async fn rejects_non_loopback_bind() {
    let error = ServeOptions {
        host: "0.0.0.0".into(),
        port: 3000,
        data_dir: None,
        session_secrets: false,
    }
    .validate()
    .unwrap_err();
    assert_eq!(error.code(), "VALIDATION");
}

#[tokio::test]
async fn serves_health_rpc_and_spa_fallback() {
    let dir = tempfile::tempdir().unwrap();
    let service = kempt_server::test_service(dir.path());
    let app = build_router(service);
    let health = app
        .clone()
        .oneshot(
            axum::http::Request::get("/api/health")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(health.status(), 200);
    let rpc = app
        .clone()
        .oneshot(
            axum::http::Request::post("/api/rpc/task.list")
                .header("content-type", "application/json")
                .body(axum::body::Body::from(r#"{"userId":"admin"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(rpc.status(), 200);
    assert!(rpc.headers().contains_key("x-request-id"));
    let body = rpc.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&body).unwrap(),
        serde_json::json!([])
    );
    let page = app
        .oneshot(
            axum::http::Request::get("/board")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(page.status(), 200);
    let body = page.into_body().collect().await.unwrap().to_bytes();
    assert!(String::from_utf8_lossy(&body).contains("root"));
}
