//! Project preview and project-local asset command boundary.

use std::{
    fs,
    path::{Path, PathBuf},
};

use tauri::AppHandle;

use crate::errors::{AppError, CommandResult};
use crate::services::path_service::{clean_file_name, decode_data_url, remove_file_if_exists};
use crate::services::preview_service::encode_webp_thumbnail_bytes;
use crate::services::project_service::{project_dir, resolve_project_root};

#[tauri::command]
pub fn save_project_preview(
    app: AppHandle,
    project_id: String,
    data_url: String,
) -> CommandResult<String> {
    let root = project_dir(&app, &project_id).map_err(String::from)?;
    fs::create_dir_all(&root)
        .map_err(AppError::from)
        .map_err(String::from)?;
    for file_name in ["preview.webp", "preview.jpg", "preview.png"] {
        let stale = root.join(file_name);
        remove_file_if_exists(stale).map_err(String::from)?;
    }
    let path = root.join("preview.webp");
    let bytes = decode_data_url(&data_url)?;
    fs::write(&path, encode_webp_thumbnail_bytes(&bytes)?).map_err(AppError::from)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn save_project_asset(
    app: AppHandle,
    project_id: Option<String>,
    project_dir: Option<String>,
    asset_id: String,
    file_name: String,
    data_url: String,
) -> CommandResult<String> {
    let root = resolve_project_root(&app, project_id, project_dir).map_err(String::from)?;
    let clean_id = clean_file_name(&asset_id);
    let clean_name = clean_file_name(&file_name);
    let extension = Path::new(&clean_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("png");
    let relative = PathBuf::from("assets").join(format!("{clean_id}.{extension}"));
    let path = root.join(&relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(AppError::from)
            .map_err(String::from)?;
    }
    fs::write(&path, decode_data_url(&data_url)?)
        .map_err(AppError::from)
        .map_err(String::from)?;
    Ok(path.to_string_lossy().to_string())
}
