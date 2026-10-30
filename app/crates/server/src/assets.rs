use axum::response::IntoResponse;
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../../dist/public"]
struct Assets;

pub fn response(path: &str) -> axum::response::Response {
    let clean = path.trim_start_matches('/');
    let asset = if clean.is_empty() {
        "index.html"
    } else {
        clean
    };
    if let Some(file) = Assets::get(asset) {
        return file_response(asset, file.data.into_owned());
    }
    if asset.contains('.') {
        return axum::http::StatusCode::NOT_FOUND.into_response();
    }
    match Assets::get("index.html") {
        Some(file) => file_response("index.html", file.data.into_owned()),
        None => axum::http::StatusCode::NOT_FOUND.into_response(),
    }
}

fn file_response(path: &str, data: Vec<u8>) -> axum::response::Response {
    axum::response::Response::builder()
        .header(
            axum::http::header::CONTENT_TYPE,
            mime_guess::from_path(path).first_or_octet_stream().as_ref(),
        )
        .body(axum::body::Body::from(data))
        .unwrap()
}
