//! Project create/open/save/move/rename/delete and folder command boundary.

use std::{fs, path::PathBuf};

use chrono::Utc;
use serde_json::Value;
use tauri::AppHandle;
use uuid::Uuid;

use crate::errors::{AppError, CommandResult};
use crate::services::path_service::{
    copy_dir_recursive, folder_is_or_descendant, normalize_folder, projects_root,
    remove_dir_if_exists, rename_folder_value,
};
use crate::services::project_service::{
    ensure_project_folder, project_dir, project_summary, read_project_files,
    read_project_folder_index, write_project_files, write_project_folder_index,
};
use crate::types::{DeleteEntries, ProjectPayload, ProjectSummary};

#[tauri::command]
pub fn create_project_folder(app: AppHandle, folder: String) -> CommandResult<Vec<String>> {
    let folder = normalize_folder(folder);
    ensure_project_folder(&app, &folder).map_err(String::from)?;
    Ok(read_project_folder_index(&app)
        .map_err(String::from)?
        .folders)
}

#[tauri::command]
pub fn rename_project_folder(
    app: AppHandle,
    old_folder: String,
    new_folder: String,
) -> CommandResult<Vec<String>> {
    let old_folder = normalize_folder(old_folder);
    let new_folder = normalize_folder(new_folder);
    if old_folder.is_empty() || new_folder.is_empty() {
        return Err("folder names cannot be empty".to_string());
    }

    let mut folder_index = read_project_folder_index(&app).map_err(String::from)?;
    folder_index.folders = folder_index
        .folders
        .iter()
        .map(|folder| rename_folder_value(folder, &old_folder, &new_folder))
        .collect();
    folder_index.folders.sort();
    folder_index.folders.dedup();
    write_project_folder_index(&app, &folder_index).map_err(String::from)?;

    let root = projects_root(&app).map_err(String::from)?;
    for entry in fs::read_dir(root)
        .map_err(AppError::from)
        .map_err(String::from)?
    {
        let path = entry.map_err(AppError::from).map_err(String::from)?.path();
        if !path.is_dir() || !path.join("metadata.json").exists() {
            continue;
        }
        let payload = read_project_files(&path).map_err(String::from)?;
        let folder = payload
            .metadata
            .get("folder")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let next_folder = rename_folder_value(folder, &old_folder, &new_folder);
        let mut metadata = payload.metadata;
        if let Some(object) = metadata.as_object_mut() {
            object.insert("folder".to_string(), Value::String(next_folder));
            object.insert(
                "savedAt".to_string(),
                Value::String(Utc::now().to_rfc3339()),
            );
        }
        write_project_files(&path, &payload.document, &metadata).map_err(String::from)?;
    }

    Ok(folder_index.folders)
}

#[tauri::command]
pub fn list_project_folders(app: AppHandle) -> CommandResult<Vec<String>> {
    Ok(read_project_folder_index(&app)
        .map_err(String::from)?
        .folders)
}

#[tauri::command]
pub fn save_project(
    project_dir: String,
    document: Value,
    metadata: Value,
) -> CommandResult<ProjectPayload> {
    let root = PathBuf::from(project_dir);
    write_project_files(&root, &document, &metadata).map_err(String::from)?;

    Ok(ProjectPayload { document, metadata })
}

#[tauri::command]
pub fn open_project(project_dir: String) -> CommandResult<ProjectPayload> {
    let root = PathBuf::from(project_dir);
    read_project_files(&root).map_err(String::from)
}

#[tauri::command]
pub fn list_projects(app: AppHandle) -> CommandResult<Vec<ProjectSummary>> {
    let root = projects_root(&app).map_err(String::from)?;
    fs::create_dir_all(&root)
        .map_err(AppError::from)
        .map_err(String::from)?;
    let mut projects = Vec::new();

    for entry in fs::read_dir(root)
        .map_err(AppError::from)
        .map_err(String::from)?
    {
        let path = entry.map_err(AppError::from).map_err(String::from)?.path();
        if !path.is_dir() || !path.join("handout.json").exists() {
            continue;
        }
        let payload = read_project_files(&path).map_err(String::from)?;
        projects.push(project_summary(&path, &payload));
    }

    projects.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(projects)
}

#[tauri::command]
pub fn create_project(
    app: AppHandle,
    title: String,
    document: Value,
    folder: String,
) -> CommandResult<ProjectPayload> {
    let id = Uuid::new_v4().to_string();
    let folder = normalize_folder(folder);
    let root = project_dir(&app, &id).map_err(String::from)?;
    let metadata = serde_json::json!({
      "id": id,
      "folder": folder,
      "savedAt": Utc::now().to_rfc3339(),
      "app": "handout-generator"
    });
    ensure_project_folder(
        &app,
        metadata
            .get("folder")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    )
    .map_err(String::from)?;
    let mut next_document = document;
    if let Some(object) = next_document.as_object_mut() {
        object.insert("title".to_string(), Value::String(title));
    }
    write_project_files(&root, &next_document, &metadata).map_err(String::from)?;
    Ok(ProjectPayload {
        document: next_document,
        metadata,
    })
}

#[tauri::command]
pub fn copy_project_masks(
    app: AppHandle,
    source_project_id: String,
    target_project_id: String,
) -> CommandResult<()> {
    let source = project_dir(&app, source_project_id.trim())
        .map_err(String::from)?
        .join("masks");
    let target = project_dir(&app, target_project_id.trim())
        .map_err(String::from)?
        .join("masks");
    copy_dir_recursive(&source, &target).map_err(String::from)?;
    Ok(())
}

#[tauri::command]
pub fn open_managed_project(app: AppHandle, project_id: String) -> CommandResult<ProjectPayload> {
    let root = project_dir(&app, &project_id).map_err(String::from)?;
    read_project_files(&root).map_err(String::from)
}

#[tauri::command]
pub fn rename_managed_project(
    app: AppHandle,
    project_id: String,
    title: String,
) -> CommandResult<ProjectPayload> {
    let root = project_dir(&app, &project_id).map_err(String::from)?;
    let mut payload = read_project_files(&root).map_err(String::from)?;
    if let Some(object) = payload.document.as_object_mut() {
        object.insert("title".to_string(), Value::String(title.trim().to_string()));
        object.insert(
            "updatedAt".to_string(),
            Value::String(Utc::now().to_rfc3339()),
        );
    }
    if let Some(object) = payload.metadata.as_object_mut() {
        object.insert(
            "savedAt".to_string(),
            Value::String(Utc::now().to_rfc3339()),
        );
    }
    write_project_files(&root, &payload.document, &payload.metadata).map_err(String::from)?;
    Ok(payload)
}

#[tauri::command]
pub fn move_managed_project(
    app: AppHandle,
    project_id: String,
    folder: String,
) -> CommandResult<ProjectPayload> {
    let folder = normalize_folder(folder);
    ensure_project_folder(&app, &folder).map_err(String::from)?;
    let root = project_dir(&app, &project_id).map_err(String::from)?;
    let payload = read_project_files(&root).map_err(String::from)?;
    let mut metadata = payload.metadata;
    if let Some(object) = metadata.as_object_mut() {
        object.insert("id".to_string(), Value::String(project_id));
        object.insert("folder".to_string(), Value::String(folder));
        object.insert(
            "savedAt".to_string(),
            Value::String(Utc::now().to_rfc3339()),
        );
        object.insert(
            "app".to_string(),
            Value::String("handout-generator".to_string()),
        );
    }
    write_project_files(&root, &payload.document, &metadata).map_err(String::from)?;
    Ok(ProjectPayload {
        document: payload.document,
        metadata,
    })
}

#[tauri::command]
pub fn delete_project_entries(
    app: AppHandle,
    entries: DeleteEntries,
) -> CommandResult<Vec<String>> {
    let ids: std::collections::HashSet<String> = entries.ids.into_iter().collect();
    let folders: Vec<String> = entries
        .folders
        .into_iter()
        .map(normalize_folder)
        .filter(|folder| !folder.is_empty())
        .collect();

    let root = projects_root(&app).map_err(String::from)?;
    fs::create_dir_all(&root)
        .map_err(AppError::from)
        .map_err(String::from)?;

    for entry in fs::read_dir(&root)
        .map_err(AppError::from)
        .map_err(String::from)?
    {
        let path = entry.map_err(AppError::from).map_err(String::from)?.path();
        if !path.is_dir() || !path.join("handout.json").exists() {
            continue;
        }
        let project_id = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        let payload = read_project_files(&path).map_err(String::from)?;
        let folder = payload
            .metadata
            .get("folder")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let should_delete = ids.contains(&project_id)
            || folders
                .iter()
                .any(|deleted| folder_is_or_descendant(folder, deleted));
        if should_delete {
            remove_dir_if_exists(path).map_err(String::from)?;
        }
    }

    let mut folder_index = read_project_folder_index(&app).map_err(String::from)?;
    folder_index.folders.retain(|folder| {
        !folders
            .iter()
            .any(|deleted| folder_is_or_descendant(folder, deleted))
    });
    write_project_folder_index(&app, &folder_index).map_err(String::from)?;
    Ok(folder_index.folders)
}

#[tauri::command]
pub fn save_managed_project(
    app: AppHandle,
    project_id: String,
    document: Value,
) -> CommandResult<ProjectPayload> {
    let root = project_dir(&app, &project_id).map_err(String::from)?;
    let folder = read_project_files(&root)
        .ok()
        .and_then(|payload| {
            payload
                .metadata
                .get("folder")
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
        .unwrap_or_default();
    let metadata = serde_json::json!({
      "id": project_id,
      "folder": folder,
      "savedAt": Utc::now().to_rfc3339(),
      "app": "handout-generator"
    });
    write_project_files(&root, &document, &metadata).map_err(String::from)?;
    Ok(ProjectPayload { document, metadata })
}
