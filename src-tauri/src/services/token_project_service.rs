use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use chrono::{DateTime, Utc};
use serde_json::Value;
use tauri::AppHandle;

use crate::{
    errors::AppError,
    services::{
        asset_service::read_index,
        path_service::{ensure_folder, token_project_folders_path, token_projects_root},
    },
    types::{ProjectFolderIndex, TokenProjectPayload, TokenProjectSummary},
};

pub(crate) fn token_project_dir(app: &AppHandle, id: &str) -> Result<PathBuf, AppError> {
    Ok(token_projects_root(app)?.join(id))
}

pub(crate) fn read_token_folders(app: &AppHandle) -> Result<ProjectFolderIndex, AppError> {
    fs::create_dir_all(token_projects_root(app)?)?;
    let path = token_project_folders_path(app)?;
    if !path.exists() {
        return Ok(ProjectFolderIndex::default());
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

pub(crate) fn write_token_folders(
    app: &AppHandle,
    index: &ProjectFolderIndex,
) -> Result<(), AppError> {
    fs::create_dir_all(token_projects_root(app)?)?;
    fs::write(
        token_project_folders_path(app)?,
        serde_json::to_vec_pretty(index)?,
    )?;
    Ok(())
}

pub(crate) fn ensure_token_folder(app: &AppHandle, folder: &str) -> Result<(), AppError> {
    let mut index = read_token_folders(app)?;
    ensure_folder(&mut index.folders, folder);
    write_token_folders(app, &index)
}

pub(crate) fn write_token_project(
    root: &Path,
    document: &Value,
    metadata: &Value,
) -> Result<(), AppError> {
    fs::create_dir_all(root.join("sources"))?;
    fs::write(
        root.join("token.json"),
        serde_json::to_vec_pretty(document)?,
    )?;
    fs::write(
        root.join("metadata.json"),
        serde_json::to_vec_pretty(metadata)?,
    )?;
    Ok(())
}

pub(crate) fn copy_token_sources(root: &Path, document: &mut Value) -> Result<(), AppError> {
    fs::create_dir_all(root.join("sources"))?;
    let Some(items) = document.get_mut("items").and_then(Value::as_array_mut) else {
        return Ok(());
    };
    for item in items {
        let Some(object) = item.as_object_mut() else {
            continue;
        };
        let id = object
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let source = object
            .get("sourcePath")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        if id.is_empty() || source.is_empty() || !Path::new(&source).exists() {
            continue;
        }
        let extension = Path::new(&source)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("bin");
        let relative = format!("sources/{id}.{extension}");
        fs::copy(source, root.join(&relative))?;
        object.insert("fallbackSource".to_string(), Value::String(relative));
    }
    Ok(())
}

pub(crate) fn read_token_project(
    app: &AppHandle,
    root: &Path,
) -> Result<TokenProjectPayload, AppError> {
    let document: Value = serde_json::from_slice(&fs::read(root.join("token.json"))?)?;
    let metadata = if root.join("metadata.json").exists() {
        serde_json::from_slice(&fs::read(root.join("metadata.json"))?)?
    } else {
        serde_json::json!({})
    };
    let library = read_index(app)?;
    let mut resolved_sources = HashMap::new();
    if let Some(items) = document.get("items").and_then(Value::as_array) {
        for item in items {
            let id = item.get("id").and_then(Value::as_str).unwrap_or_default();
            if id.is_empty() {
                continue;
            }
            let asset = item
                .get("assetId")
                .and_then(Value::as_str)
                .and_then(|asset_id| library.assets.iter().find(|record| record.id == asset_id));
            if let Some(record) = asset.filter(|record| Path::new(&record.path).exists()) {
                resolved_sources.insert(id.to_string(), record.path.clone());
                continue;
            }
            if let Some(relative) = item.get("fallbackSource").and_then(Value::as_str) {
                let fallback = root.join(relative);
                if fallback.exists() {
                    resolved_sources.insert(id.to_string(), fallback.to_string_lossy().to_string());
                }
            }
        }
    }
    Ok(TokenProjectPayload {
        document,
        metadata,
        resolved_sources,
    })
}

pub(crate) fn token_summary(root: &Path, payload: &TokenProjectPayload) -> TokenProjectSummary {
    let id = root
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();
    let updated_at = payload
        .metadata
        .get("savedAt")
        .and_then(Value::as_str)
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.with_timezone(&Utc))
        .unwrap_or_else(Utc::now);
    let preview = root.join("preview.webp");
    TokenProjectSummary {
        id,
        title: payload
            .document
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("Untitled token project")
            .to_string(),
        project_dir: root.to_string_lossy().to_string(),
        folder: payload
            .metadata
            .get("folder")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        item_count: payload
            .document
            .get("items")
            .and_then(Value::as_array)
            .map_or(0, Vec::len),
        preview_path: preview
            .exists()
            .then(|| preview.to_string_lossy().to_string()),
        updated_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copies_project_source_and_records_relative_fallback() {
        let root =
            std::env::temp_dir().join(format!("handout-token-source-{}", uuid::Uuid::new_v4()));
        let source = root.with_extension("png");
        fs::write(&source, b"source-bytes").unwrap();
        let mut document = serde_json::json!({
            "items": [{
                "id": "item-1",
                "sourcePath": source.to_string_lossy()
            }]
        });

        copy_token_sources(&root, &mut document).unwrap();

        assert_eq!(document["items"][0]["fallbackSource"], "sources/item-1.png");
        assert_eq!(
            fs::read(root.join("sources/item-1.png")).unwrap(),
            b"source-bytes"
        );
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_file(source);
    }
}
