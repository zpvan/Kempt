use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Validation(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Conflict(String),
    #[error("{0}")]
    Storage(String),
    #[error("{0}")]
    Network(String),
    #[error("{0}")]
    SecretStore(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../contracts/generated/", rename_all = "camelCase")]
pub struct ErrorBody {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Validation(_) => "VALIDATION",
            Self::NotFound(_) => "NOT_FOUND",
            Self::Conflict(_) => "CONFLICT",
            Self::Storage(_) => "STORAGE",
            Self::Network(_) => "NETWORK",
            Self::SecretStore(_) => "SECRET_STORE",
        }
    }

    pub fn body(&self) -> ErrorBody {
        ErrorBody {
            code: self.code().into(),
            message: self.to_string(),
        }
    }
}
