use crate::assets;
use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Path, State},
    http::{HeaderValue, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use kempt_core::{dispatch::dispatch, error::AppError, service::AppService};
use kempt_storage::SqliteRepository;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{sync::Arc, time::Instant};
use uuid::Uuid;

pub type ServerService = AppService<SqliteRepository>;
pub type ServerState = Arc<ServerService>;

pub fn router(service: ServerService) -> Router {
    let state = Arc::new(service);
    Router::new()
        .route("/api/health", get(health))
        .route(
            "/api/rpc/{method}",
            post(rpc).layer(DefaultBodyLimit::max(50 * 1024 * 1024)),
        )
        .route(
            "/api/log",
            post(client_log).layer(DefaultBodyLimit::max(64 * 1024)),
        )
        .fallback(fallback)
        .layer(middleware::from_fn(observability))
        .with_state(state)
}

async fn health() -> Json<Value> {
    Json(json!({"ok":true}))
}

async fn rpc(
    State(service): State<ServerState>,
    Path(method): Path<String>,
    payload: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let payload = match payload {
        Ok(Json(value)) => value,
        Err(error) => return error_response(&AppError::Validation(error.to_string())),
    };
    match dispatch(&service, &method, payload).await {
        Ok(value) => Json(value).into_response(),
        Err(error) => error_response(&error),
    }
}

#[derive(Deserialize)]
struct ClientLog {
    level: String,
    msg: String,
}

async fn client_log(
    payload: Result<Json<Vec<ClientLog>>, axum::extract::rejection::JsonRejection>,
) -> Response {
    match payload {
        Ok(Json(entries)) if entries.len() <= 50 => {
            for entry in entries {
                match entry.level.as_str() {
                    "error" => tracing::error!(target: "browser", "{}", entry.msg),
                    "warn" => tracing::warn!(target: "browser", "{}", entry.msg),
                    _ => tracing::info!(target: "browser", "{}", entry.msg),
                }
            }
            StatusCode::NO_CONTENT.into_response()
        }
        Ok(_) => error_response(&AppError::Validation(
            "At most 50 log entries are allowed".into(),
        )),
        Err(error) => error_response(&AppError::Validation(error.to_string())),
    }
}

async fn fallback(uri: axum::http::Uri) -> Response {
    if uri.path().starts_with("/api/") {
        return error_response(&AppError::NotFound("API route not found".into()));
    }
    assets::response(uri.path())
}

fn error_response(error: &AppError) -> Response {
    let status = match error {
        AppError::Validation(_) => StatusCode::BAD_REQUEST,
        AppError::NotFound(_) => StatusCode::NOT_FOUND,
        AppError::Conflict(_) => StatusCode::CONFLICT,
        AppError::Network(_) => StatusCode::BAD_GATEWAY,
        AppError::Storage(_) | AppError::SecretStore(_) => StatusCode::INTERNAL_SERVER_ERROR,
    };
    (status, Json(error.body())).into_response()
}

async fn observability(request: Request<Body>, next: Next) -> Response {
    let request_id = Uuid::new_v4().to_string();
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    let start = Instant::now();
    let mut response = next.run(request).await;
    response.headers_mut().insert(
        "x-request-id",
        HeaderValue::from_str(&request_id).unwrap_or(HeaderValue::from_static("invalid")),
    );
    if path != "/api/log" {
        tracing::info!(%method, %path, status = %response.status(), duration_ms = start.elapsed().as_millis(), %request_id, "request");
    }
    response
}
