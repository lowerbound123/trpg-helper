//! Library import, folder, record, font preview, and configuration command boundary.

use std::{fs, path::Path};

use chrono::Utc;
use tauri::AppHandle;

use crate::errors::{AppError, CommandResult};
use crate::services::asset_service::{
    delete_record_files, ensure_font_metadata, ensure_record_thumbnail, import_record,
    library_folders_mut, library_records_mut, read_index, write_index,
};
use crate::services::path_service::{
    encode_data_url, ensure_folder, folder_is_or_descendant, normalize_folder, project_root,
    rename_folder_value, write_debug_log,
};
use crate::services::preview_service::{encode_webp_thumbnail_bytes, thumbnail_path};
use crate::types::{DeleteEntries, ImportResult, LibraryIndex};

#[tauri::command]
pub fn get_library(app: AppHandle) -> CommandResult<LibraryIndex> {
    let mut index = read_index(&app).map_err(String::from)?;
    if ensure_font_metadata(&mut index) {
        write_index(&app, &index).map_err(String::from)?;
    }
    Ok(index)
}

#[tauri::command]
pub fn repair_missing_thumbnails(app: AppHandle) -> CommandResult<LibraryIndex> {
    let mut index = read_index(&app).map_err(String::from)?;
    let mut changed = ensure_font_metadata(&mut index);
    for record in index.backgrounds.iter_mut().chain(index.assets.iter_mut()) {
        match ensure_record_thumbnail(&app, record) {
            Ok(record_changed) => changed |= record_changed,
            Err(error) => {
                let _ = write_debug_log(&format!(
                    "{{\"timestamp\":\"{}\",\"scope\":\"thumbnail\",\"message\":\"failed to repair thumbnail\",\"data\":{{\"id\":\"{}\",\"name\":\"{}\",\"error\":\"{}\"}}}}",
                    Utc::now().to_rfc3339(),
                    record.id.replace('"', "\\\""),
                    record.name.replace('"', "\\\""),
                    error.to_string().replace('"', "\\\"")
                ));
            }
        }
    }
    if changed {
        write_index(&app, &index).map_err(String::from)?;
    }
    Ok(index)
}

#[tauri::command]
pub fn read_file_data_url(path: String, media_type: String) -> CommandResult<String> {
    encode_data_url(Path::new(&path), &media_type).map_err(Into::into)
}

#[tauri::command]
pub fn create_library_folder(
    app: AppHandle,
    kind: String,
    folder: String,
) -> CommandResult<LibraryIndex> {
    let folder = normalize_folder(folder);
    let mut index = read_index(&app).map_err(String::from)?;
    let folders = library_folders_mut(&mut index, &kind)
        .ok_or_else(|| "unknown library folder kind".to_string())?;
    ensure_folder(folders, &folder);
    write_index(&app, &index).map_err(String::from)?;
    Ok(index)
}

#[tauri::command]
pub fn rename_library_record(
    app: AppHandle,
    kind: String,
    id: String,
    name: String,
) -> CommandResult<LibraryIndex> {
    let mut index = read_index(&app).map_err(String::from)?;
    let records = match kind.as_str() {
        "background" | "backgrounds" => &mut index.backgrounds,
        "asset" | "assets" => &mut index.assets,
        "font" | "fonts" => &mut index.fonts,
        _ => return Err("unknown library record kind".to_string()),
    };
    let record = records
        .iter_mut()
        .find(|record| record.id == id)
        .ok_or_else(|| "record not found".to_string())?;
    record.name = name.trim().to_string();
    record.updated_at = Utc::now();
    write_index(&app, &index).map_err(String::from)?;
    Ok(index)
}

#[tauri::command]
pub fn move_library_record(
    app: AppHandle,
    kind: String,
    id: String,
    folder: String,
) -> CommandResult<LibraryIndex> {
    let folder = normalize_folder(folder);
    let mut index = read_index(&app).map_err(String::from)?;
    {
        let records = library_records_mut(&mut index, &kind)
            .ok_or_else(|| "unknown library record kind".to_string())?;
        let record = records
            .iter_mut()
            .find(|record| record.id == id)
            .ok_or_else(|| "record not found".to_string())?;
        record.folder = folder.clone();
        record.updated_at = Utc::now();
    }
    {
        let folders = library_folders_mut(&mut index, &kind)
            .ok_or_else(|| "unknown library folder kind".to_string())?;
        ensure_folder(folders, &folder);
    }
    write_index(&app, &index).map_err(String::from)?;
    Ok(index)
}

#[tauri::command]
pub fn delete_library_entries(
    app: AppHandle,
    kind: String,
    entries: DeleteEntries,
) -> CommandResult<LibraryIndex> {
    let mut index = read_index(&app).map_err(String::from)?;
    let ids: std::collections::HashSet<String> = entries.ids.into_iter().collect();
    let folders: Vec<String> = entries
        .folders
        .into_iter()
        .map(normalize_folder)
        .filter(|folder| !folder.is_empty())
        .collect();

    {
        let records = library_records_mut(&mut index, &kind)
            .ok_or_else(|| "unknown library record kind".to_string())?;
        let mut kept = Vec::with_capacity(records.len());
        for record in records.drain(..) {
            let should_delete = ids.contains(&record.id)
                || folders
                    .iter()
                    .any(|folder| folder_is_or_descendant(&record.folder, folder));
            if should_delete {
                delete_record_files(&record).map_err(String::from)?;
            } else {
                kept.push(record);
            }
        }
        *records = kept;
    }

    {
        let folder_index = library_folders_mut(&mut index, &kind)
            .ok_or_else(|| "unknown library folder kind".to_string())?;
        folder_index.retain(|folder| {
            !folders
                .iter()
                .any(|deleted| folder_is_or_descendant(folder, deleted))
        });
    }

    write_index(&app, &index).map_err(String::from)?;
    Ok(index)
}

#[tauri::command]
pub fn rename_library_folder(
    app: AppHandle,
    kind: String,
    old_folder: String,
    new_folder: String,
) -> CommandResult<LibraryIndex> {
    let old_folder = normalize_folder(old_folder);
    let new_folder = normalize_folder(new_folder);
    if old_folder.is_empty() || new_folder.is_empty() {
        return Err("folder names cannot be empty".to_string());
    }
    let mut index = read_index(&app).map_err(String::from)?;
    let folders = library_folders_mut(&mut index, &kind)
        .ok_or_else(|| "unknown library folder kind".to_string())?;
    *folders = folders
        .iter()
        .map(|folder| rename_folder_value(folder, &old_folder, &new_folder))
        .collect();
    folders.sort();
    folders.dedup();

    let records = match kind.as_str() {
        "background" | "backgrounds" => &mut index.backgrounds,
        "asset" | "assets" => &mut index.assets,
        "font" | "fonts" => &mut index.fonts,
        _ => return Err("unknown library folder kind".to_string()),
    };
    for record in records {
        record.folder = rename_folder_value(&record.folder, &old_folder, &new_folder);
        record.updated_at = Utc::now();
    }

    write_index(&app, &index).map_err(String::from)?;
    Ok(index)
}

#[tauri::command]
pub fn import_background(
    app: AppHandle,
    file_name: String,
    data: Vec<u8>,
    tags: Vec<String>,
    folder: String,
    media_type: String,
) -> CommandResult<ImportResult> {
    import_record(
        &app,
        "backgrounds",
        file_name,
        data,
        tags,
        folder,
        media_type,
    )
    .map_err(Into::into)
}

#[tauri::command]
pub fn import_asset(
    app: AppHandle,
    file_name: String,
    data: Vec<u8>,
    tags: Vec<String>,
    folder: String,
    media_type: String,
) -> CommandResult<ImportResult> {
    import_record(&app, "assets", file_name, data, tags, folder, media_type).map_err(Into::into)
}

#[tauri::command]
pub fn import_font(
    app: AppHandle,
    file_name: String,
    data: Vec<u8>,
    tags: Vec<String>,
    folder: String,
    media_type: String,
) -> CommandResult<ImportResult> {
    import_record(&app, "fonts", file_name, data, tags, folder, media_type).map_err(Into::into)
}

#[tauri::command]
pub fn save_font_preview(
    app: AppHandle,
    font_id: String,
    data_url: String,
) -> CommandResult<LibraryIndex> {
    let bytes = crate::services::path_service::decode_data_url(&data_url)
        .map_err(AppError::from)?;
    let path = thumbnail_path(&app, &font_id).map_err(String::from)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(AppError::from)
            .map_err(String::from)?;
    }
    fs::write(
        &path,
        encode_webp_thumbnail_bytes(&bytes).map_err(AppError::from)?,
    )
    .map_err(AppError::from)
    .map_err(String::from)?;

    let mut index = read_index(&app).map_err(String::from)?;
    let record = index
        .fonts
        .iter_mut()
        .find(|record| record.id == font_id)
        .ok_or_else(|| "font record not found".to_string())?;
    record.thumbnail_path = Some(path.to_string_lossy().to_string());
    record.updated_at = Utc::now();
    write_index(&app, &index).map_err(String::from)?;
    Ok(index)
}

#[tauri::command]
pub fn append_debug_log(line: String) -> CommandResult<String> {
    write_debug_log(&line)
}

#[tauri::command]
pub fn read_configuration() -> CommandResult<String> {
    let path = project_root()
        .map_err(String::from)?
        .join("configuration.toml");
    fs::read_to_string(path)
        .map_err(AppError::from)
        .map_err(String::from)
}

#[tauri::command]
pub fn write_configuration(source: String) -> CommandResult<String> {
    let path = project_root()
        .map_err(String::from)?
        .join("configuration.toml");
    fs::write(&path, source)
        .map_err(AppError::from)
        .map_err(String::from)?;
    Ok(path.to_string_lossy().to_string())
}
