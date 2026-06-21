//! Project file and folder index service boundary.

use std::{
    fs,
    path::{Path, PathBuf},
};

use chrono::{DateTime, Utc};
use serde_json::Value;
use tauri::AppHandle;

use crate::errors::AppError;
use crate::services::path_service::{ensure_folder, project_folders_path, projects_root};
use crate::services::preview_service::preview_path;
use crate::types::{ProjectFolderIndex, ProjectPayload, ProjectSummary};

pub(crate) fn read_project_folder_index(
    app: &AppHandle,
) -> Result<ProjectFolderIndex, AppError> {
    fs::create_dir_all(projects_root(app)?)?;
    let path = project_folders_path(app)?;
    if !path.exists() {
        return Ok(ProjectFolderIndex::default());
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

pub(crate) fn write_project_folder_index(
    app: &AppHandle,
    index: &ProjectFolderIndex,
) -> Result<(), AppError> {
    fs::create_dir_all(projects_root(app)?)?;
    fs::write(
        project_folders_path(app)?,
        serde_json::to_vec_pretty(index)?,
    )?;
    Ok(())
}

pub(crate) fn ensure_project_folder(app: &AppHandle, folder: &str) -> Result<(), AppError> {
    let mut index = read_project_folder_index(app)?;
    ensure_folder(&mut index.folders, folder);
    write_project_folder_index(app, &index)
}

pub(crate) fn project_dir(app: &AppHandle, project_id: &str) -> Result<PathBuf, AppError> {
    Ok(projects_root(app)?.join(project_id))
}

pub(crate) fn resolve_project_root(
    app: &AppHandle,
    project_id: Option<String>,
    project_dir_value: Option<String>,
) -> Result<PathBuf, AppError> {
    if let Some(project_id) = project_id.filter(|value| !value.trim().is_empty()) {
        return project_dir(app, project_id.trim());
    }
    if let Some(project_dir_value) = project_dir_value.filter(|value| !value.trim().is_empty()) {
        return Ok(PathBuf::from(project_dir_value));
    }
    Err(AppError::DataDir)
}

pub(crate) fn safe_project_relative_path(relative_path: &str) -> Result<PathBuf, AppError> {
    let path = Path::new(relative_path);
    if path.is_absolute() || relative_path.split('/').any(|part| part == "..") {
        return Err(AppError::DataDir);
    }
    Ok(path.to_path_buf())
}

pub(crate) fn document_title(document: &Value) -> String {
    document
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("Untitled handout")
        .to_string()
}

pub(crate) fn write_project_files(
    root: &Path,
    document: &Value,
    metadata: &Value,
) -> Result<(), AppError> {
    fs::create_dir_all(root)?;
    fs::write(
        root.join("handout.json"),
        serde_json::to_vec_pretty(document)?,
    )?;
    fs::write(
        root.join("metadata.json"),
        serde_json::to_vec_pretty(metadata)?,
    )?;
    Ok(())
}

pub(crate) fn read_project_files(root: &Path) -> Result<ProjectPayload, AppError> {
    let document = serde_json::from_slice(&fs::read(root.join("handout.json"))?)?;
    let metadata_path = root.join("metadata.json");
    let metadata = if metadata_path.exists() {
        serde_json::from_slice(&fs::read(metadata_path)?)?
    } else {
        serde_json::json!({})
    };
    Ok(ProjectPayload { document, metadata })
}

pub(crate) fn project_summary(root: &Path, payload: &ProjectPayload) -> ProjectSummary {
    let id = root
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("unknown")
        .to_string();
    let updated_at = payload
        .metadata
        .get("savedAt")
        .and_then(Value::as_str)
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.with_timezone(&Utc))
        .unwrap_or_else(Utc::now);

    ProjectSummary {
        id,
        title: document_title(&payload.document),
        project_dir: root.to_string_lossy().to_string(),
        folder: payload
            .metadata
            .get("folder")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        background_asset_id: payload
            .document
            .get("canvas")
            .and_then(|canvas| canvas.get("backgroundAssetId"))
            .and_then(Value::as_str)
            .map(ToString::to_string),
        preview_path: preview_path(root).map(|path| path.to_string_lossy().to_string()),
        preview_size_bytes: preview_path(root)
            .and_then(|path| fs::metadata(path).ok())
            .map(|metadata| metadata.len()),
        updated_at,
    }
}
