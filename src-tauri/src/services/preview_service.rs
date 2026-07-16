//! Thumbnail and preview generation service boundary.

use std::{
    fs,
    path::{Path, PathBuf},
};

use image::{GenericImageView, imageops::FilterType};
use tauri::AppHandle;

use crate::errors::AppError;
use crate::services::path_service::thumbnails_root;

pub(crate) const THUMBNAIL_MAX_EDGE: u32 = 256;
pub(crate) const THUMBNAIL_QUALITY: f32 = 80.0;

pub(crate) fn preview_path(root: &Path) -> Option<PathBuf> {
    ["preview.webp", "preview.jpg", "preview.png"]
        .iter()
        .map(|name| root.join(name))
        .find(|path| path.exists())
}

pub(crate) fn thumbnail_path(app: &AppHandle, id: &str) -> Result<PathBuf, AppError> {
    Ok(thumbnails_root(app)?.join(format!("{id}.webp")))
}

pub(crate) fn encode_webp_thumbnail_bytes(input: &[u8]) -> Result<Vec<u8>, AppError> {
    let image = image::load_from_memory(input)?;
    let (width, height) = image.dimensions();
    let largest = width.max(height).max(1);
    let resized = if largest > THUMBNAIL_MAX_EDGE {
        let ratio = THUMBNAIL_MAX_EDGE as f32 / largest as f32;
        let next_width = ((width as f32 * ratio).round() as u32).max(1);
        let next_height = ((height as f32 * ratio).round() as u32).max(1);
        image.resize(next_width, next_height, FilterType::Lanczos3)
    } else {
        image
    };
    let rgba = resized.to_rgba8();
    let encoder = webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height());
    Ok(encoder.encode(THUMBNAIL_QUALITY).to_vec())
}

pub(crate) fn write_webp_thumbnail(
    app: &AppHandle,
    id: &str,
    input: &[u8],
) -> Result<PathBuf, AppError> {
    let output = thumbnail_path(app, id)?;
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&output, encode_webp_thumbnail_bytes(input)?)?;
    Ok(output)
}
