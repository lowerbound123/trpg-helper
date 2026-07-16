//! Project-local mask file commands.

use std::{fs, path::PathBuf};

use tauri::AppHandle;

use crate::{
    AppError, CommandResult, clean_file_name, decode_data_url, encode_data_url,
    remove_file_if_exists, resolve_project_root, safe_project_relative_path,
};

#[tauri::command]
pub fn save_project_mask(
    app: AppHandle,
    project_id: Option<String>,
    project_dir: Option<String>,
    mask_id: String,
    data_url: String,
) -> CommandResult<String> {
    let root = resolve_project_root(&app, project_id, project_dir).map_err(String::from)?;
    let relative = PathBuf::from("masks").join(format!("{}.png", clean_file_name(&mask_id)));
    let path = root.join(&relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(AppError::from)
            .map_err(String::from)?;
    }
    fs::write(&path, decode_data_url(&data_url).map_err(AppError::from)?)
        .map_err(AppError::from)
        .map_err(String::from)?;
    Ok(relative.to_string_lossy().to_string())
}

#[tauri::command]
pub fn save_project_mask_cache(
    app: AppHandle,
    project_id: Option<String>,
    project_dir: Option<String>,
    mask_id: String,
    data_url: String,
    max_edge: u32,
) -> CommandResult<String> {
    let root = resolve_project_root(&app, project_id, project_dir).map_err(String::from)?;
    let bounded_edge = max_edge.max(1);
    let relative = PathBuf::from(".cache").join("masks").join(format!(
        "{}-preview-{}.png",
        clean_file_name(&mask_id),
        bounded_edge
    ));
    let path = root.join(&relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(AppError::from)
            .map_err(String::from)?;
    }
    fs::write(&path, decode_data_url(&data_url).map_err(AppError::from)?)
        .map_err(AppError::from)
        .map_err(String::from)?;
    Ok(relative.to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_project_file_data_url(
    app: AppHandle,
    project_id: Option<String>,
    project_dir: Option<String>,
    relative_path: String,
    media_type: String,
) -> CommandResult<String> {
    let root = resolve_project_root(&app, project_id, project_dir).map_err(String::from)?;
    let relative = safe_project_relative_path(&relative_path).map_err(String::from)?;
    encode_data_url(&root.join(relative), &media_type).map_err(Into::into)
}

#[tauri::command]
pub fn delete_project_mask(
    app: AppHandle,
    project_id: Option<String>,
    project_dir: Option<String>,
    relative_path: String,
) -> CommandResult<()> {
    let root = resolve_project_root(&app, project_id, project_dir).map_err(String::from)?;
    let relative = safe_project_relative_path(&relative_path).map_err(String::from)?;
    remove_file_if_exists(root.join(relative))
        .map_err(AppError::from)
        .map_err(String::from)
}
