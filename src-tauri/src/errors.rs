//! Application error boundary. All Tauri commands return `CommandResult<T>`
//! so that `AppError` is flattened to a string on the frontend.

use thiserror::Error;

pub(crate) type CommandResult<T> = Result<T, String>;

#[derive(Debug, Error)]
pub(crate) enum AppError {
    #[error("failed to resolve local data directory")]
    DataDir,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid data url")]
    InvalidDataUrl,
    #[error("base64 decode error: {0}")]
    Base64(#[from] base64::DecodeError),
    #[error("image error: {0}")]
    Image(#[from] image::ImageError),
    #[error("unsupported image export format: {0}")]
    InvalidImageFormat(String),
    #[error("unknown library kind: {0}")]
    InvalidLibraryKind(String),
    #[error("failed to create import worker pool: {0}")]
    ImportWorkerPool(String),
}

impl From<AppError> for String {
    fn from(value: AppError) -> Self {
        value.to_string()
    }
}
