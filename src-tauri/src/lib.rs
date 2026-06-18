use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use base64::{engine::general_purpose, Engine as _};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};
use thiserror::Error;
use uuid::Uuid;

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
        return cwd
            .parent()
            .map(Path::to_path_buf)
            .ok_or(AppError::DataDir);
    }
    Ok(cwd)
}

fn library_root(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(app_root(app)?.join("library"))
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

fn library_folders_mut<'a>(index: &'a mut LibraryIndex, kind: &str) -> Option<&'a mut Vec<String>> {
    match kind {
        "background" | "backgrounds" => Some(&mut index.background_folders),
        "asset" | "assets" => Some(&mut index.asset_folders),
        "font" | "fonts" => Some(&mut index.font_folders),
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
    fs::write(&destination, data)?;

    let now = Utc::now();
    let record = LibraryRecord {
        id,
        name: file_name,
        file_name: stored_name,
        path: destination.to_string_lossy().to_string(),
        thumbnail_path: None,
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

fn data_url_media_type(data_url: &str) -> &str {
    data_url
        .strip_prefix("data:")
        .and_then(|rest| rest.split_once(';').map(|(media_type, _)| media_type))
        .unwrap_or("image/png")
}

fn preview_file_name(data_url: &str) -> &'static str {
    match data_url_media_type(data_url) {
        "image/webp" => "preview.webp",
        "image/jpeg" | "image/jpg" => "preview.jpg",
        _ => "preview.png",
    }
}

fn preview_path(root: &Path) -> Option<PathBuf> {
    ["preview.webp", "preview.jpg", "preview.png"]
        .iter()
        .map(|name| root.join(name))
        .find(|path| path.exists())
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
    read_index(&app).map_err(Into::into)
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
fn export_image_to_downloads(app: AppHandle, file_name: String, data_url: String) -> CommandResult<String> {
    let clean_name = clean_file_name(&file_name);
    let file_name = if clean_name.to_lowercase().ends_with(".png") {
        clean_name
    } else {
        format!("{clean_name}.png")
    };
    let downloads = app.path().download_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&downloads)
        .map_err(AppError::from)
        .map_err(String::from)?;
    let path = downloads.join(file_name);
    fs::write(&path, decode_data_url(&data_url).map_err(AppError::from)?)
        .map_err(AppError::from)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_project_preview(app: AppHandle, project_id: String, data_url: String) -> CommandResult<String> {
    let root = project_dir(&app, &project_id).map_err(String::from)?;
    fs::create_dir_all(&root)
        .map_err(AppError::from)
        .map_err(String::from)?;
    for file_name in ["preview.webp", "preview.jpg", "preview.png"] {
        let stale = root.join(file_name);
        if stale.exists() {
            fs::remove_file(stale)
                .map_err(AppError::from)
                .map_err(String::from)?;
        }
    }
    let path = root.join(preview_file_name(&data_url));
    fs::write(&path, decode_data_url(&data_url).map_err(AppError::from)?)
        .map_err(AppError::from)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn append_debug_log(line: String) -> CommandResult<String> {
    let path = project_root()
        .map_err(String::from)?
        .join("log.txt");
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
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
            open_managed_project,
            open_project,
            read_file_data_url,
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
