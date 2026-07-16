use std::{collections::HashSet, fs};

use chrono::Utc;
use serde_json::Value;
use tauri::AppHandle;
use uuid::Uuid;

use crate::{
    errors::{AppError, CommandResult},
    services::{
        path_service::{
            copy_dir_recursive, decode_data_url, folder_is_or_descendant, normalize_folder,
            remove_dir_if_exists, rename_folder_value, token_projects_root,
        },
        token_project_service::{
            copy_token_sources, ensure_token_folder, read_token_folders, read_token_project,
            token_project_dir, token_summary, write_token_folders, write_token_project,
        },
    },
    types::{DeleteEntries, TokenProjectPayload, TokenProjectSummary},
};

#[tauri::command]
pub fn create_token_project_folder(app: AppHandle, folder: String) -> CommandResult<Vec<String>> {
    let folder = normalize_folder(folder);
    ensure_token_folder(&app, &folder).map_err(String::from)?;
    Ok(read_token_folders(&app).map_err(String::from)?.folders)
}

#[tauri::command]
pub fn list_token_project_folders(app: AppHandle) -> CommandResult<Vec<String>> {
    Ok(read_token_folders(&app).map_err(String::from)?.folders)
}

#[tauri::command]
pub fn create_token_project(
    app: AppHandle,
    mut document: Value,
    folder: String,
) -> CommandResult<TokenProjectPayload> {
    let id = Uuid::new_v4().to_string();
    let folder = normalize_folder(folder);
    let root = token_project_dir(&app, &id).map_err(String::from)?;
    if let Some(object) = document.as_object_mut() {
        object.insert("id".to_string(), Value::String(id.clone()));
        object.insert(
            "updatedAt".to_string(),
            Value::String(Utc::now().to_rfc3339()),
        );
    }
    copy_token_sources(&root, &mut document).map_err(String::from)?;
    let metadata = serde_json::json!({
        "id": id,
        "folder": folder,
        "savedAt": Utc::now().to_rfc3339(),
        "app": "handout-generator"
    });
    ensure_token_folder(
        &app,
        metadata
            .get("folder")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    )
    .map_err(String::from)?;
    write_token_project(&root, &document, &metadata).map_err(String::from)?;
    read_token_project(&app, &root).map_err(String::from)
}

#[tauri::command]
pub fn list_token_projects(app: AppHandle) -> CommandResult<Vec<TokenProjectSummary>> {
    let root = token_projects_root(&app).map_err(String::from)?;
    fs::create_dir_all(&root)
        .map_err(AppError::from)
        .map_err(String::from)?;
    let mut projects = Vec::new();
    for entry in fs::read_dir(root)
        .map_err(AppError::from)
        .map_err(String::from)?
    {
        let path = entry.map_err(AppError::from).map_err(String::from)?.path();
        if !path.is_dir() || !path.join("token.json").exists() {
            continue;
        }
        let payload = read_token_project(&app, &path).map_err(String::from)?;
        projects.push(token_summary(&path, &payload));
    }
    projects.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(projects)
}

#[tauri::command]
pub fn open_token_project(
    app: AppHandle,
    project_id: String,
) -> CommandResult<TokenProjectPayload> {
    let root = token_project_dir(&app, &project_id).map_err(String::from)?;
    read_token_project(&app, &root).map_err(String::from)
}

#[tauri::command]
pub fn save_token_project(
    app: AppHandle,
    project_id: String,
    mut document: Value,
) -> CommandResult<TokenProjectPayload> {
    let root = token_project_dir(&app, &project_id).map_err(String::from)?;
    let existing = read_token_project(&app, &root).map_err(String::from)?;
    if let Some(object) = document.as_object_mut() {
        object.insert("id".to_string(), Value::String(project_id.clone()));
        object.insert(
            "updatedAt".to_string(),
            Value::String(Utc::now().to_rfc3339()),
        );
    }
    let folder = existing
        .metadata
        .get("folder")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let metadata = serde_json::json!({
        "id": project_id,
        "folder": folder,
        "savedAt": Utc::now().to_rfc3339(),
        "app": "handout-generator"
    });
    copy_token_sources(&root, &mut document).map_err(String::from)?;
    write_token_project(&root, &document, &metadata).map_err(String::from)?;
    read_token_project(&app, &root).map_err(String::from)
}

#[tauri::command]
pub fn rename_token_project(
    app: AppHandle,
    project_id: String,
    title: String,
) -> CommandResult<TokenProjectPayload> {
    let root = token_project_dir(&app, &project_id).map_err(String::from)?;
    let mut payload = read_token_project(&app, &root).map_err(String::from)?;
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
    write_token_project(&root, &payload.document, &payload.metadata).map_err(String::from)?;
    read_token_project(&app, &root).map_err(String::from)
}

#[tauri::command]
pub fn move_token_project(
    app: AppHandle,
    project_id: String,
    folder: String,
) -> CommandResult<TokenProjectPayload> {
    let folder = normalize_folder(folder);
    ensure_token_folder(&app, &folder).map_err(String::from)?;
    let root = token_project_dir(&app, &project_id).map_err(String::from)?;
    let mut payload = read_token_project(&app, &root).map_err(String::from)?;
    if let Some(object) = payload.metadata.as_object_mut() {
        object.insert("folder".to_string(), Value::String(folder));
        object.insert(
            "savedAt".to_string(),
            Value::String(Utc::now().to_rfc3339()),
        );
    }
    write_token_project(&root, &payload.document, &payload.metadata).map_err(String::from)?;
    read_token_project(&app, &root).map_err(String::from)
}

#[tauri::command]
pub fn copy_token_project(
    app: AppHandle,
    project_id: String,
) -> CommandResult<TokenProjectPayload> {
    let source = token_project_dir(&app, &project_id).map_err(String::from)?;
    let mut payload = read_token_project(&app, &source).map_err(String::from)?;
    let id = Uuid::new_v4().to_string();
    let target = token_project_dir(&app, &id).map_err(String::from)?;
    copy_dir_recursive(&source, &target).map_err(String::from)?;
    if let Some(object) = payload.document.as_object_mut() {
        object.insert("id".to_string(), Value::String(id.clone()));
        let title = object
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("Untitled token project");
        object.insert("title".to_string(), Value::String(format!("{title} copy")));
        object.insert(
            "updatedAt".to_string(),
            Value::String(Utc::now().to_rfc3339()),
        );
    }
    if let Some(object) = payload.metadata.as_object_mut() {
        object.insert("id".to_string(), Value::String(id));
        object.insert(
            "savedAt".to_string(),
            Value::String(Utc::now().to_rfc3339()),
        );
    }
    write_token_project(&target, &payload.document, &payload.metadata).map_err(String::from)?;
    read_token_project(&app, &target).map_err(String::from)
}

#[tauri::command]
pub fn save_token_project_preview(
    app: AppHandle,
    project_id: String,
    data_url: String,
) -> CommandResult<String> {
    let path = token_project_dir(&app, &project_id)
        .map_err(String::from)?
        .join("preview.webp");
    fs::write(&path, decode_data_url(&data_url).map_err(String::from)?)
        .map_err(AppError::from)
        .map_err(String::from)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn rename_token_project_folder(
    app: AppHandle,
    old_folder: String,
    new_folder: String,
) -> CommandResult<Vec<String>> {
    let old_folder = normalize_folder(old_folder);
    let new_folder = normalize_folder(new_folder);
    let mut index = read_token_folders(&app).map_err(String::from)?;
    index.folders = index
        .folders
        .iter()
        .map(|folder| rename_folder_value(folder, &old_folder, &new_folder))
        .collect();
    index.folders.sort();
    index.folders.dedup();
    write_token_folders(&app, &index).map_err(String::from)?;
    for project in list_token_projects(app.clone())? {
        let next = rename_folder_value(&project.folder, &old_folder, &new_folder);
        if next != project.folder {
            move_token_project(app.clone(), project.id, next)?;
        }
    }
    Ok(index.folders)
}

#[tauri::command]
pub fn delete_token_project_entries(
    app: AppHandle,
    entries: DeleteEntries,
) -> CommandResult<Vec<String>> {
    let ids: HashSet<String> = entries.ids.into_iter().collect();
    let folders: Vec<String> = entries
        .folders
        .into_iter()
        .map(normalize_folder)
        .filter(|value| !value.is_empty())
        .collect();
    for project in list_token_projects(app.clone())? {
        if ids.contains(&project.id)
            || folders
                .iter()
                .any(|folder| folder_is_or_descendant(&project.folder, folder))
        {
            remove_dir_if_exists(token_project_dir(&app, &project.id).map_err(String::from)?)
                .map_err(String::from)?;
        }
    }
    let mut index = read_token_folders(&app).map_err(String::from)?;
    index.folders.retain(|value| {
        !folders
            .iter()
            .any(|folder| folder_is_or_descendant(value, folder))
    });
    write_token_folders(&app, &index).map_err(String::from)?;
    Ok(index.folders)
}
