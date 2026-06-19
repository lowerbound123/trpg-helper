use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use base64::{engine::general_purpose, Engine as _};
use chrono::{DateTime, Utc};
use image::{imageops::FilterType, GenericImageView};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};
use thiserror::Error;
use uuid::Uuid;

const THUMBNAIL_MAX_EDGE: u32 = 256;
const THUMBNAIL_QUALITY: f32 = 80.0;

type CommandResult<T> = Result<T, String>;

#[derive(Debug, Error)]
enum AppError {
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
}

impl From<AppError> for String {
    fn from(value: AppError) -> Self {
        value.to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LibraryRecord {
    id: String,
    name: String,
    file_name: String,
    path: String,
    thumbnail_path: Option<String>,
    #[serde(default)]
    font_family: Option<String>,
    tags: Vec<String>,
    #[serde(default)]
    folder: String,
    media_type: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct LibraryIndex {
    #[serde(default)]
    backgrounds: Vec<LibraryRecord>,
    #[serde(default)]
    assets: Vec<LibraryRecord>,
    #[serde(default)]
    fonts: Vec<LibraryRecord>,
    #[serde(default)]
    background_folders: Vec<String>,
    #[serde(default)]
    asset_folders: Vec<String>,
    #[serde(default)]
    font_folders: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportResult {
    record: LibraryRecord,
    library: LibraryIndex,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectPayload {
    document: Value,
    metadata: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSummary {
    id: String,
    title: String,
    project_dir: String,
    #[serde(default)]
    folder: String,
    background_asset_id: Option<String>,
    preview_path: Option<String>,
    preview_size_bytes: Option<u64>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ProjectFolderIndex {
    #[serde(default)]
    folders: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteEntries {
    #[serde(default)]
    ids: Vec<String>,
    #[serde(default)]
    folders: Vec<String>,
}

fn app_root(_app: &AppHandle) -> Result<PathBuf, AppError> {
    let cwd = std::env::current_dir().map_err(|_| AppError::DataDir)?;
    let project_root = if cwd.file_name().and_then(|name| name.to_str()) == Some("src-tauri") {
        cwd.parent()
            .map(Path::to_path_buf)
            .ok_or(AppError::DataDir)?
    } else {
        cwd
    };
    Ok(project_root.join("data"))
}

fn project_root() -> Result<PathBuf, AppError> {
    let cwd = std::env::current_dir().map_err(|_| AppError::DataDir)?;
    if cwd.file_name().and_then(|name| name.to_str()) == Some("src-tauri") {
        return cwd.parent().map(Path::to_path_buf).ok_or(AppError::DataDir);
    }
    Ok(cwd)
}

fn library_root(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(app_root(app)?.join("library"))
}

fn thumbnails_root(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(library_root(app)?.join("thumbnails"))
}

fn projects_root(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(app_root(app)?.join("projects"))
}

fn index_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(library_root(app)?.join("index.json"))
}

fn project_folders_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(projects_root(app)?.join("folders.json"))
}

fn ensure_library(app: &AppHandle) -> Result<(), AppError> {
    let root = library_root(app)?;
    fs::create_dir_all(root.join("backgrounds"))?;
    fs::create_dir_all(root.join("assets"))?;
    fs::create_dir_all(root.join("fonts"))?;
    fs::create_dir_all(root.join("thumbnails"))?;

    let path = index_path(app)?;
    if !path.exists() {
        fs::write(path, serde_json::to_vec_pretty(&LibraryIndex::default())?)?;
    }

    Ok(())
}

fn read_index(app: &AppHandle) -> Result<LibraryIndex, AppError> {
    ensure_library(app)?;
    let bytes = fs::read(index_path(app)?)?;
    Ok(serde_json::from_slice(&bytes)?)
}

fn write_index(app: &AppHandle, index: &LibraryIndex) -> Result<(), AppError> {
    ensure_library(app)?;
    fs::write(index_path(app)?, serde_json::to_vec_pretty(index)?)?;
    Ok(())
}

fn normalize_folder(folder: String) -> String {
    folder
        .trim()
        .trim_matches('/')
        .split('/')
        .filter(|part| !part.trim().is_empty())
        .map(str::trim)
        .collect::<Vec<_>>()
        .join("/")
}

fn ensure_folder(folders: &mut Vec<String>, folder: &str) {
    if folder.is_empty() || folders.iter().any(|item| item == folder) {
        return;
    }
    folders.push(folder.to_string());
    folders.sort();
}

fn rename_folder_value(value: &str, old_folder: &str, new_folder: &str) -> String {
    if old_folder.is_empty() {
        return value.to_string();
    }
    if value == old_folder {
        return new_folder.to_string();
    }
    let prefix = format!("{old_folder}/");
    if value.starts_with(&prefix) {
        return format!("{new_folder}/{}", &value[prefix.len()..]);
    }
    value.to_string()
}

fn folder_is_or_descendant(value: &str, folder: &str) -> bool {
    if folder.is_empty() {
        return value.is_empty();
    }
    value == folder || value.starts_with(&format!("{folder}/"))
}

fn library_folders_mut<'a>(index: &'a mut LibraryIndex, kind: &str) -> Option<&'a mut Vec<String>> {
    match kind {
        "background" | "backgrounds" => Some(&mut index.background_folders),
        "asset" | "assets" => Some(&mut index.asset_folders),
        "font" | "fonts" => Some(&mut index.font_folders),
        _ => None,
    }
}

fn library_records_mut<'a>(
    index: &'a mut LibraryIndex,
    kind: &str,
) -> Option<&'a mut Vec<LibraryRecord>> {
    match kind {
        "background" | "backgrounds" => Some(&mut index.backgrounds),
        "asset" | "assets" => Some(&mut index.assets),
        "font" | "fonts" => Some(&mut index.fonts),
        _ => None,
    }
}

fn read_project_folder_index(app: &AppHandle) -> Result<ProjectFolderIndex, AppError> {
    fs::create_dir_all(projects_root(app)?)?;
    let path = project_folders_path(app)?;
    if !path.exists() {
        return Ok(ProjectFolderIndex::default());
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn write_project_folder_index(app: &AppHandle, index: &ProjectFolderIndex) -> Result<(), AppError> {
    fs::create_dir_all(projects_root(app)?)?;
    fs::write(
        project_folders_path(app)?,
        serde_json::to_vec_pretty(index)?,
    )?;
    Ok(())
}

fn ensure_project_folder(app: &AppHandle, folder: &str) -> Result<(), AppError> {
    let mut index = read_project_folder_index(app)?;
    ensure_folder(&mut index.folders, folder);
    write_project_folder_index(app, &index)
}

fn clean_file_name(file_name: &str) -> String {
    let fallback = "resource.bin";
    let name = Path::new(file_name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(fallback);

    name.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn be_u16(bytes: &[u8], offset: usize) -> Option<u16> {
    Some(u16::from_be_bytes([
        *bytes.get(offset)?,
        *bytes.get(offset + 1)?,
    ]))
}

fn be_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    Some(u32::from_be_bytes([
        *bytes.get(offset)?,
        *bytes.get(offset + 1)?,
        *bytes.get(offset + 2)?,
        *bytes.get(offset + 3)?,
    ]))
}

fn decode_font_name(bytes: &[u8], platform_id: u16) -> Option<String> {
    let value = if platform_id == 0 || platform_id == 3 {
        if bytes.len() % 2 != 0 {
            return None;
        }
        let units = bytes
            .chunks_exact(2)
            .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        String::from_utf16(&units).ok()?
    } else {
        String::from_utf8_lossy(bytes).to_string()
    };
    let value = value.trim_matches(char::from(0)).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn extract_font_family_from_bytes(bytes: &[u8]) -> Option<String> {
    let num_tables = usize::from(be_u16(bytes, 4)?);
    let mut name_offset = 0usize;
    let mut name_length = 0usize;
    for index in 0..num_tables {
        let record_offset = 12 + index * 16;
        let tag = bytes.get(record_offset..record_offset + 4)?;
        if tag == b"name" {
            name_offset = usize::try_from(be_u32(bytes, record_offset + 8)?).ok()?;
            name_length = usize::try_from(be_u32(bytes, record_offset + 12)?).ok()?;
            break;
        }
    }
    if name_offset == 0 || name_offset.checked_add(name_length)? > bytes.len() {
        return None;
    }

    let count = usize::from(be_u16(bytes, name_offset + 2)?);
    let string_base = name_offset + usize::from(be_u16(bytes, name_offset + 4)?);
    let mut candidates: Vec<(u16, bool, bool, String)> = Vec::new();
    for index in 0..count {
        let offset = name_offset + 6 + index * 12;
        let platform_id = be_u16(bytes, offset)?;
        let language_id = be_u16(bytes, offset + 4)?;
        let name_id = be_u16(bytes, offset + 6)?;
        if !matches!(name_id, 16 | 1 | 4 | 6) {
            continue;
        }
        let length = usize::from(be_u16(bytes, offset + 8)?);
        let string_offset = string_base + usize::from(be_u16(bytes, offset + 10)?);
        let string_end = string_offset.checked_add(length)?;
        let value = decode_font_name(bytes.get(string_offset..string_end)?, platform_id)?;
        let unicode = platform_id == 0 || platform_id == 3;
        let english = language_id == 0x0409 || language_id == 0;
        candidates.push((name_id, unicode, english, value));
    }

    for preferred_name_id in [16u16, 1, 4, 6] {
        if let Some((_, _, _, value)) = candidates
            .iter()
            .filter(|candidate| candidate.0 == preferred_name_id)
            .max_by_key(|candidate| (candidate.1, candidate.2))
        {
            return Some(value.clone());
        }
    }
    None
}

fn ensure_font_metadata(index: &mut LibraryIndex) -> bool {
    let mut changed = false;
    for record in &mut index.fonts {
        if record
            .font_family
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
        {
            continue;
        }
        match fs::read(&record.path)
            .ok()
            .and_then(|bytes| extract_font_family_from_bytes(&bytes))
        {
            Some(font_family) => {
                record.font_family = Some(font_family.clone());
                record.updated_at = Utc::now();
                changed = true;
                let _ = append_debug_log(format!(
                    "{{\"timestamp\":\"{}\",\"scope\":\"text\",\"message\":\"font-metadata-repaired\",\"data\":{{\"id\":\"{}\",\"name\":\"{}\",\"fontFamily\":\"{}\"}}}}",
                    Utc::now().to_rfc3339(),
                    record.id.replace('"', "\\\""),
                    record.name.replace('"', "\\\""),
                    font_family.replace('"', "\\\"")
                ));
            }
            None => {
                let _ = append_debug_log(format!(
                    "{{\"timestamp\":\"{}\",\"scope\":\"text\",\"message\":\"font-metadata-repair-failed\",\"data\":{{\"id\":\"{}\",\"name\":\"{}\",\"path\":\"{}\"}}}}",
                    Utc::now().to_rfc3339(),
                    record.id.replace('"', "\\\""),
                    record.name.replace('"', "\\\""),
                    record.path.replace('"', "\\\"")
                ));
            }
        }
    }
    changed
}

fn import_record(
    app: &AppHandle,
    bucket: &str,
    file_name: String,
    data: Vec<u8>,
    tags: Vec<String>,
    folder: String,
    media_type: String,
) -> Result<ImportResult, AppError> {
    ensure_library(app)?;
    let id = Uuid::new_v4().to_string();
    let folder = normalize_folder(folder);
    let clean_name = clean_file_name(&file_name);
    let stored_name = format!("{id}-{clean_name}");
    let destination = library_root(app)?.join(bucket).join(&stored_name);
    fs::write(&destination, &data)?;

    let thumbnail_path = if matches!(bucket, "backgrounds" | "assets") {
        match write_webp_thumbnail(app, &id, &data) {
            Ok(path) => Some(path.to_string_lossy().to_string()),
            Err(error) => {
                let _ = append_debug_log(format!(
                    "{{\"timestamp\":\"{}\",\"scope\":\"thumbnail\",\"message\":\"failed to generate import thumbnail\",\"data\":{{\"id\":\"{}\",\"fileName\":\"{}\",\"error\":\"{}\"}}}}",
                    Utc::now().to_rfc3339(),
                    id,
                    file_name.replace('"', "\\\""),
                    error.to_string().replace('"', "\\\"")
                ));
                None
            }
        }
    } else {
        None
    };
    let font_family = if bucket == "fonts" {
        let extracted = extract_font_family_from_bytes(&data);
        let _ = append_debug_log(format!(
            "{{\"timestamp\":\"{}\",\"scope\":\"text\",\"message\":\"font-metadata-import\",\"data\":{{\"fileName\":\"{}\",\"fontFamily\":{}}}}}",
            Utc::now().to_rfc3339(),
            file_name.replace('"', "\\\""),
            extracted
                .as_ref()
                .map(|value| format!("\"{}\"", value.replace('"', "\\\"")))
                .unwrap_or_else(|| "null".to_string())
        ));
        extracted
    } else {
        None
    };

    let now = Utc::now();
    let record = LibraryRecord {
        id,
        name: file_name,
        file_name: stored_name,
        path: destination.to_string_lossy().to_string(),
        thumbnail_path,
        font_family,
        tags,
        folder: folder.clone(),
        media_type,
        created_at: now,
        updated_at: now,
    };

    let mut index = read_index(app)?;
    match bucket {
        "backgrounds" => {
            ensure_folder(&mut index.background_folders, &folder);
            index.backgrounds.push(record.clone());
        }
        "assets" => {
            ensure_folder(&mut index.asset_folders, &folder);
            index.assets.push(record.clone());
        }
        "fonts" => {
            ensure_folder(&mut index.font_folders, &folder);
            index.fonts.push(record.clone());
        }
        _ => {}
    }
    write_index(app, &index)?;

    Ok(ImportResult {
        record,
        library: index,
    })
}

fn decode_data_url(data_url: &str) -> Result<Vec<u8>, AppError> {
    let (_, data) = data_url.split_once(',').ok_or(AppError::InvalidDataUrl)?;
    Ok(general_purpose::STANDARD.decode(data)?)
}

fn preview_path(root: &Path) -> Option<PathBuf> {
    ["preview.webp", "preview.jpg", "preview.png"]
        .iter()
        .map(|name| root.join(name))
        .find(|path| path.exists())
}

fn thumbnail_path(app: &AppHandle, id: &str) -> Result<PathBuf, AppError> {
    Ok(thumbnails_root(app)?.join(format!("{id}.webp")))
}

fn encode_webp_thumbnail_bytes(input: &[u8]) -> Result<Vec<u8>, AppError> {
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

fn write_webp_thumbnail(app: &AppHandle, id: &str, input: &[u8]) -> Result<PathBuf, AppError> {
    let output = thumbnail_path(app, id)?;
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&output, encode_webp_thumbnail_bytes(input)?)?;
    Ok(output)
}

fn ensure_record_thumbnail(app: &AppHandle, record: &mut LibraryRecord) -> Result<bool, AppError> {
    let should_generate = record
        .thumbnail_path
        .as_ref()
        .map(|path| !Path::new(path).exists())
        .unwrap_or(true);
    if !should_generate {
        return Ok(false);
    }
    let bytes = fs::read(&record.path)?;
    let path = write_webp_thumbnail(app, &record.id, &bytes)?;
    record.thumbnail_path = Some(path.to_string_lossy().to_string());
    record.updated_at = Utc::now();
    Ok(true)
}

fn delete_record_files(record: &LibraryRecord) -> Result<(), AppError> {
    remove_file_if_exists(&record.path)?;
    if let Some(path) = &record.thumbnail_path {
        remove_file_if_exists(path)?;
    }
    Ok(())
}

fn remove_file_if_exists(path: impl AsRef<Path>) -> Result<(), AppError> {
    let path = path.as_ref();
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

fn remove_dir_if_exists(path: impl AsRef<Path>) -> Result<(), AppError> {
    let path = path.as_ref();
    if path.exists() {
        fs::remove_dir_all(path)?;
    }
    Ok(())
}

fn encode_data_url(path: &Path, media_type: &str) -> Result<String, AppError> {
    let bytes = fs::read(path)?;
    Ok(format!(
        "data:{};base64,{}",
        media_type,
        general_purpose::STANDARD.encode(bytes)
    ))
}

fn project_dir(app: &AppHandle, project_id: &str) -> Result<PathBuf, AppError> {
    Ok(projects_root(app)?.join(project_id))
}

fn document_title(document: &Value) -> String {
    document
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("Untitled handout")
        .to_string()
}

fn write_project_files(root: &Path, document: &Value, metadata: &Value) -> Result<(), AppError> {
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

fn read_project_files(root: &Path) -> Result<ProjectPayload, AppError> {
    let document = serde_json::from_slice(&fs::read(root.join("handout.json"))?)?;
    let metadata_path = root.join("metadata.json");
    let metadata = if metadata_path.exists() {
        serde_json::from_slice(&fs::read(metadata_path)?)?
    } else {
        serde_json::json!({})
    };
    Ok(ProjectPayload { document, metadata })
}

fn project_summary(root: &Path, payload: &ProjectPayload) -> ProjectSummary {
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

#[tauri::command]
fn get_library(app: AppHandle) -> CommandResult<LibraryIndex> {
    let mut index = read_index(&app).map_err(String::from)?;
    if ensure_font_metadata(&mut index) {
        write_index(&app, &index).map_err(String::from)?;
    }
    Ok(index)
}

#[tauri::command]
fn repair_missing_thumbnails(app: AppHandle) -> CommandResult<LibraryIndex> {
    let mut index = read_index(&app).map_err(String::from)?;
    let mut changed = ensure_font_metadata(&mut index);
    for record in index.backgrounds.iter_mut().chain(index.assets.iter_mut()) {
        match ensure_record_thumbnail(&app, record) {
            Ok(record_changed) => changed |= record_changed,
            Err(error) => {
                let _ = append_debug_log(format!(
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
fn read_file_data_url(path: String, media_type: String) -> CommandResult<String> {
    encode_data_url(Path::new(&path), &media_type).map_err(Into::into)
}

#[tauri::command]
fn create_library_folder(
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
fn rename_library_record(
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
fn move_library_record(
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
fn delete_library_entries(
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
fn rename_library_folder(
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
fn create_project_folder(app: AppHandle, folder: String) -> CommandResult<Vec<String>> {
    let folder = normalize_folder(folder);
    ensure_project_folder(&app, &folder).map_err(String::from)?;
    Ok(read_project_folder_index(&app)
        .map_err(String::from)?
        .folders)
}

#[tauri::command]
fn rename_project_folder(
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
fn list_project_folders(app: AppHandle) -> CommandResult<Vec<String>> {
    Ok(read_project_folder_index(&app)
        .map_err(String::from)?
        .folders)
}

#[tauri::command]
fn import_background(
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
fn import_asset(
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
fn import_font(
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
fn save_project(
    project_dir: String,
    document: Value,
    metadata: Value,
) -> CommandResult<ProjectPayload> {
    let root = PathBuf::from(project_dir);
    write_project_files(&root, &document, &metadata).map_err(String::from)?;

    Ok(ProjectPayload { document, metadata })
}

#[tauri::command]
fn open_project(project_dir: String) -> CommandResult<ProjectPayload> {
    let root = PathBuf::from(project_dir);
    read_project_files(&root).map_err(String::from)
}

#[tauri::command]
fn list_projects(app: AppHandle) -> CommandResult<Vec<ProjectSummary>> {
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
fn create_project(
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
fn open_managed_project(app: AppHandle, project_id: String) -> CommandResult<ProjectPayload> {
    let root = project_dir(&app, &project_id).map_err(String::from)?;
    read_project_files(&root).map_err(String::from)
}

#[tauri::command]
fn rename_managed_project(
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
fn move_managed_project(
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
fn delete_project_entries(app: AppHandle, entries: DeleteEntries) -> CommandResult<Vec<String>> {
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
fn save_managed_project(
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

#[tauri::command]
fn export_image(file_path: String, data_url: String) -> CommandResult<String> {
    let path = PathBuf::from(file_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(AppError::from)?;
    }
    fs::write(&path, decode_data_url(&data_url).map_err(AppError::from)?)
        .map_err(AppError::from)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn export_image_to_downloads(
    app: AppHandle,
    file_name: String,
    data_url: String,
) -> CommandResult<String> {
    let clean_name = clean_file_name(&file_name);
    let file_name = if clean_name.to_lowercase().ends_with(".png") {
        clean_name
    } else {
        format!("{clean_name}.png")
    };
    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&downloads)
        .map_err(AppError::from)
        .map_err(String::from)?;
    let path = downloads.join(file_name);
    fs::write(&path, decode_data_url(&data_url).map_err(AppError::from)?)
        .map_err(AppError::from)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_project_preview(
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
        remove_file_if_exists(stale)
            .map_err(AppError::from)
            .map_err(String::from)?;
    }
    let path = root.join("preview.webp");
    let bytes = decode_data_url(&data_url).map_err(AppError::from)?;
    fs::write(
        &path,
        encode_webp_thumbnail_bytes(&bytes).map_err(AppError::from)?,
    )
    .map_err(AppError::from)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn append_debug_log(line: String) -> CommandResult<String> {
    let path = project_root().map_err(String::from)?.join("log.txt");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(AppError::from)
        .map_err(String::from)?;
    writeln!(file, "{line}")
        .map_err(AppError::from)
        .map_err(String::from)?;
    Ok(path.to_string_lossy().to_string())
}

fn reset_debug_log() {
    if let Ok(path) = project_root().map(|root| root.join("log.txt")) {
        let _ = fs::write(path, "");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            reset_debug_log();
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            ensure_library(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            append_debug_log,
            delete_library_entries,
            delete_project_entries,
            export_image,
            export_image_to_downloads,
            save_project_preview,
            create_project,
            create_library_folder,
            create_project_folder,
            get_library,
            import_background,
            import_asset,
            import_font,
            list_project_folders,
            list_projects,
            move_library_record,
            move_managed_project,
            open_managed_project,
            open_project,
            read_file_data_url,
            repair_missing_thumbnails,
            rename_library_folder,
            rename_library_record,
            rename_managed_project,
            rename_project_folder,
            save_managed_project,
            save_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
