//! Library import, folder, record, font preview, and configuration command boundary.

use std::{
    fs,
    path::{Path, PathBuf},
    time::Instant,
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle,
    ipc::{InvokeBody, Request},
};
use walkdir::WalkDir;

use crate::errors::{AppError, CommandResult};
use crate::services::asset_service::{
    BatchImportInput, delete_record_files, ensure_font_metadata, ensure_record_thumbnail,
    import_record, import_records_batch, library_folders_mut, library_records_mut, read_index,
    write_index,
};
use crate::services::path_service::{
    encode_data_url, ensure_folder, folder_is_or_descendant, normalize_folder, project_root,
    rename_folder_value, write_debug_log,
};
use crate::services::preview_service::{encode_webp_thumbnail_bytes, thumbnail_path};
use crate::types::{
    DeleteEntries, ImportResult, LibraryIndex, TokenBackgroundConfig, TokenRingConfig,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LibraryImportMetadata {
    kind: String,
    folder: String,
    tags: Vec<String>,
    files: Vec<LibraryImportFileMetadata>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LibraryImportFileMetadata {
    client_id: String,
    file_name: String,
    media_type: String,
    offset: usize,
    length: usize,
}

struct ParsedLibraryImportFile<'a> {
    client_id: String,
    file_name: String,
    media_type: String,
    data: &'a [u8],
}

struct ParsedLibraryImport<'a> {
    kind: String,
    folder: String,
    tags: Vec<String>,
    files: Vec<ParsedLibraryImportFile<'a>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchImportItemResult {
    client_id: String,
    file_name: String,
    record: Option<crate::types::LibraryRecord>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchImportResult {
    results: Vec<BatchImportItemResult>,
    library: LibraryIndex,
}

fn parse_library_import_envelope(data: &[u8]) -> Result<ParsedLibraryImport<'_>, String> {
    if data.len() < 8 || &data[..4] != b"HGI1" {
        return Err("Library import envelope magic/version is invalid".into());
    }
    let header_len =
        u32::from_le_bytes(data[4..8].try_into().map_err(|_| "Invalid import header")?) as usize;
    let payload_start = 8usize
        .checked_add(header_len)
        .ok_or("Import header length overflow")?;
    if payload_start > data.len() {
        return Err("Library import envelope is truncated".into());
    }
    let metadata: LibraryImportMetadata = serde_json::from_slice(&data[8..payload_start])
        .map_err(|error| format!("Invalid library import metadata: {error}"))?;
    if !matches!(metadata.kind.as_str(), "asset" | "background" | "font") {
        return Err("Unknown library import kind".into());
    }
    let payload = &data[payload_start..];
    let mut files = Vec::with_capacity(metadata.files.len());
    for file in metadata.files {
        let end = file
            .offset
            .checked_add(file.length)
            .ok_or("Import file range overflow")?;
        let bytes = payload
            .get(file.offset..end)
            .ok_or("Import file range exceeds payload")?;
        files.push(ParsedLibraryImportFile {
            client_id: file.client_id,
            file_name: file.file_name,
            media_type: file.media_type,
            data: bytes,
        });
    }
    Ok(ParsedLibraryImport {
        kind: metadata.kind,
        folder: metadata.folder,
        tags: metadata.tags,
        files,
    })
}

#[tauri::command]
pub async fn import_library_batch(
    app: AppHandle,
    request: Request<'_>,
) -> CommandResult<BatchImportResult> {
    let data = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(_) => return Err("import_library_batch expects raw bytes".into()),
    };
    tauri::async_runtime::spawn_blocking(move || {
        let started = Instant::now();
        let parsed = parse_library_import_envelope(&data)?;
        let bucket = match parsed.kind.as_str() {
            "background" => "backgrounds",
            "asset" => "assets",
            "font" => "fonts",
            _ => return Err("Unknown library import kind".to_string()),
        };
        let inputs = parsed
            .files
            .into_iter()
            .map(|file| BatchImportInput {
                client_id: file.client_id,
                file_name: file.file_name,
                media_type: file.media_type,
                data: file.data,
            })
            .collect();
        let (outcomes, library) =
            import_records_batch(&app, bucket, parsed.folder, parsed.tags, inputs)
                .map_err(String::from)?;
        let results = outcomes
            .into_iter()
            .map(|outcome| BatchImportItemResult {
                client_id: outcome.client_id,
                file_name: outcome.file_name,
                record: outcome.record,
                error: outcome.error,
            })
            .collect::<Vec<_>>();
        let _ = write_debug_log(
            "speed",
            &format!(
                "{{\"timestamp\":\"{}\",\"scope\":\"speed\",\"message\":\"library-import-batch\",\"data\":{{\"kind\":\"{}\",\"files\":{},\"bytes\":{},\"durationMs\":{}}}}}",
                Utc::now().to_rfc3339(),
                parsed.kind,
                results.len(),
                data.len(),
                started.elapsed().as_millis()
            ),
        );
        Ok(BatchImportResult { results, library })
    })
    .await
    .map_err(|error| format!("Library import task failed: {error}"))?
}

fn import_media_type(path: &Path) -> Option<&'static str> {
    match path
        .extension()?
        .to_string_lossy()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "bmp" => Some("image/bmp"),
        "tif" | "tiff" => Some("image/tiff"),
        _ => None,
    }
}

fn collect_import_paths(paths: &[String]) -> Vec<PathBuf> {
    paths
        .iter()
        .flat_map(|value| {
            let path = PathBuf::from(value);
            if path.is_dir() {
                WalkDir::new(path)
                    .follow_links(false)
                    .into_iter()
                    .filter_map(Result::ok)
                    .filter(|entry| {
                        entry.file_type().is_file() && import_media_type(entry.path()).is_some()
                    })
                    .map(|entry| entry.into_path())
                    .collect::<Vec<_>>()
            } else if path.is_file() && import_media_type(&path).is_some() {
                vec![path]
            } else {
                Vec::new()
            }
        })
        .collect()
}

#[tauri::command]
pub async fn import_library_paths(
    app: AppHandle,
    kind: String,
    paths: Vec<String>,
    folder: String,
    tags: Vec<String>,
) -> CommandResult<BatchImportResult> {
    tauri::async_runtime::spawn_blocking(move || {
        let bucket = match kind.as_str() {
            "background" => "backgrounds",
            "asset" => "assets",
            "font" => "fonts",
            _ => return Err("Unknown library import kind".to_string()),
        };
        let collected = collect_import_paths(&paths);
        let owned = collected
            .into_iter()
            .map(|path| {
                let name = path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("image")
                    .to_string();
                let media_type = import_media_type(&path)
                    .unwrap_or("application/octet-stream")
                    .to_string();
                match fs::read(&path) {
                    Ok(data) => Ok((path, name, media_type, data)),
                    Err(error) => Err((path, name, error.to_string())),
                }
            })
            .collect::<Vec<_>>();
        let mut read_errors = Vec::new();
        let successful = owned
            .into_iter()
            .filter_map(|result| match result {
                Ok(value) => Some(value),
                Err((path, name, error)) => {
                    read_errors.push(BatchImportItemResult {
                        client_id: path.to_string_lossy().to_string(),
                        file_name: name,
                        record: None,
                        error: Some(error),
                    });
                    None
                }
            })
            .collect::<Vec<_>>();
        let inputs = successful
            .iter()
            .enumerate()
            .map(|(index, (path, name, media_type, data))| BatchImportInput {
                client_id: format!("path:{index}:{}", path.to_string_lossy()),
                file_name: name.clone(),
                media_type: media_type.clone(),
                data,
            })
            .collect();
        let (outcomes, library) =
            import_records_batch(&app, bucket, folder, tags, inputs).map_err(String::from)?;
        let mut results = outcomes
            .into_iter()
            .map(|outcome| BatchImportItemResult {
                client_id: outcome.client_id,
                file_name: outcome.file_name,
                record: outcome.record,
                error: outcome.error,
            })
            .collect::<Vec<_>>();
        results.extend(read_errors);
        Ok(BatchImportResult { results, library })
    })
    .await
    .map_err(|error| format!("Path import task failed: {error}"))?
}

#[cfg(test)]
mod batch_import_tests {
    use super::parse_library_import_envelope;

    fn envelope(metadata: serde_json::Value, payload: &[u8]) -> Vec<u8> {
        let header = serde_json::to_vec(&metadata).unwrap();
        let mut data = b"HGI1".to_vec();
        data.extend_from_slice(&(header.len() as u32).to_le_bytes());
        data.extend_from_slice(&header);
        data.extend_from_slice(payload);
        data
    }

    #[test]
    fn parses_multiple_file_boundaries() {
        let data = envelope(
            serde_json::json!({
                "kind": "asset",
                "folder": "rings",
                "tags": ["token"],
                "files": [
                    { "clientId": "0", "fileName": "a.png", "mediaType": "image/png", "offset": 0, "length": 2 },
                    { "clientId": "1", "fileName": "b.png", "mediaType": "image/png", "offset": 2, "length": 1 }
                ]
            }),
            &[1, 2, 3],
        );
        let parsed = parse_library_import_envelope(&data).unwrap();
        assert_eq!(parsed.files.len(), 2);
        assert_eq!(parsed.files[0].data, &[1, 2]);
        assert_eq!(parsed.files[1].data, &[3]);
    }

    #[test]
    fn rejects_out_of_bounds_file_payload() {
        let data = envelope(
            serde_json::json!({
                "kind": "asset", "folder": "", "tags": [],
                "files": [{ "clientId": "0", "fileName": "a.png", "mediaType": "image/png", "offset": 1, "length": 4 }]
            }),
            &[1, 2],
        );
        assert!(parse_library_import_envelope(&data).is_err());
    }
}

#[tauri::command]
pub fn get_library(app: AppHandle) -> CommandResult<LibraryIndex> {
    let mut index = read_index(&app).map_err(String::from)?;
    let migrated_ring_geometry = index
        .assets
        .iter()
        .any(|record| record.token_ring.as_ref().is_some_and(|ring| ring.legacy));
    if ensure_font_metadata(&mut index) || migrated_ring_geometry {
        for record in &mut index.assets {
            if let Some(ring) = &mut record.token_ring {
                ring.legacy = false;
            }
        }
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
                let _ = write_debug_log(
                    "thumbnail",
                    &format!(
                        "{{\"timestamp\":\"{}\",\"scope\":\"thumbnail\",\"message\":\"failed to repair thumbnail\",\"data\":{{\"id\":\"{}\",\"name\":\"{}\",\"error\":\"{}\"}}}}",
                        Utc::now().to_rfc3339(),
                        record.id.replace('"', "\\\""),
                        record.name.replace('"', "\\\""),
                        error.to_string().replace('"', "\\\"")
                    ),
                );
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
pub fn update_token_ring_config(
    app: AppHandle,
    id: String,
    expected_revision: u64,
    mut config: TokenRingConfig,
) -> CommandResult<LibraryIndex> {
    if config.design_size <= 0.0
        || config.inner_radius < 0.0
        || config.outer_radius <= config.inner_radius
        || config.outer_radius > config.design_size / 2.0
        || !(f64::from(
            crate::token::configuration::active_configuration()
                .rings
                .custom_scale_min,
        )
            ..=f64::from(
                crate::token::configuration::active_configuration()
                    .rings
                    .custom_scale_max,
            ))
            .contains(&config.image_scale_x)
        || !(f64::from(
            crate::token::configuration::active_configuration()
                .rings
                .custom_scale_min,
        )
            ..=f64::from(
                crate::token::configuration::active_configuration()
                    .rings
                    .custom_scale_max,
            ))
            .contains(&config.image_scale_y)
    {
        return Err("invalid token ring geometry".to_string());
    }
    let mut index = read_index(&app).map_err(String::from)?;
    let record = index
        .assets
        .iter_mut()
        .find(|record| record.id == id)
        .ok_or_else(|| "ring asset not found".to_string())?;
    let revision = record.token_ring.as_ref().map_or(0, |ring| ring.revision);
    if revision != expected_revision {
        return Err(format!(
            "token ring revision conflict: expected {expected_revision}, current {revision}"
        ));
    }
    config.revision = revision + 1;
    config.legacy = false;
    record.token_ring = Some(config);
    record.updated_at = Utc::now();
    write_index(&app, &index).map_err(String::from)?;
    Ok(index)
}

#[tauri::command]
pub fn update_token_background_config(
    app: AppHandle,
    id: String,
    expected_revision: u64,
    mut config: TokenBackgroundConfig,
) -> CommandResult<LibraryIndex> {
    let limit = config.design_size;
    if limit <= 0.0
        || !config.image_offset_x.is_finite()
        || !config.image_offset_y.is_finite()
        || config.image_offset_x.abs() > limit
        || config.image_offset_y.abs() > limit
    {
        return Err("invalid token background geometry".to_string());
    }
    let mut index = read_index(&app).map_err(String::from)?;
    let record = index
        .assets
        .iter_mut()
        .find(|record| record.id == id)
        .ok_or_else(|| "token background asset not found".to_string())?;
    let revision = record
        .token_background
        .as_ref()
        .map_or(0, |value| value.revision);
    if revision != expected_revision {
        return Err(format!(
            "token background revision conflict: expected {expected_revision}, current {revision}"
        ));
    }
    config.revision = revision + 1;
    record.token_background = Some(config);
    record.updated_at = Utc::now();
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
    let bytes = crate::services::path_service::decode_data_url(&data_url)?;
    let path = thumbnail_path(&app, &font_id).map_err(String::from)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(AppError::from)
            .map_err(String::from)?;
    }
    fs::write(&path, encode_webp_thumbnail_bytes(&bytes)?)
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
pub fn append_debug_log(scope: String, line: String) -> CommandResult<String> {
    write_debug_log(&scope, &line)
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
    crate::token::configuration::parse_handout_configuration(&source)?;
    let path = project_root()
        .map_err(String::from)?
        .join("configuration.toml");
    fs::write(&path, source)
        .map_err(AppError::from)
        .map_err(String::from)?;
    Ok(path.to_string_lossy().to_string())
}
