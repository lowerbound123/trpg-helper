use std::{
  fs,
  path::{Path, PathBuf},
};

use base64::{engine::general_purpose, Engine as _};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;
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
  updated_at: DateTime<Utc>,
}

fn app_root(_app: &AppHandle) -> Result<PathBuf, AppError> {
  let cwd = std::env::current_dir().map_err(|_| AppError::DataDir)?;
  let project_root = if cwd.file_name().and_then(|name| name.to_str()) == Some("src-tauri") {
    cwd.parent().map(Path::to_path_buf).ok_or(AppError::DataDir)?
  } else {
    cwd
  };
  Ok(project_root.join("data"))
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

fn clean_file_name(file_name: &str) -> String {
  let fallback = "resource.bin";
  let name = Path::new(file_name)
    .file_name()
    .and_then(|value| value.to_str())
    .unwrap_or(fallback);

  name
    .chars()
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
  media_type: String,
) -> Result<ImportResult, AppError> {
  ensure_library(app)?;
  let id = Uuid::new_v4().to_string();
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
    media_type,
    created_at: now,
    updated_at: now,
  };

  let mut index = read_index(app)?;
  match bucket {
    "backgrounds" => index.backgrounds.push(record.clone()),
    "assets" => index.assets.push(record.clone()),
    "fonts" => index.fonts.push(record.clone()),
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
  fs::write(root.join("handout.json"), serde_json::to_vec_pretty(document)?)?;
  fs::write(root.join("metadata.json"), serde_json::to_vec_pretty(metadata)?)?;
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
    updated_at,
  }
}

#[tauri::command]
fn get_library(app: AppHandle) -> CommandResult<LibraryIndex> {
  read_index(&app).map_err(Into::into)
}

#[tauri::command]
fn import_background(
  app: AppHandle,
  file_name: String,
  data: Vec<u8>,
  tags: Vec<String>,
  media_type: String,
) -> CommandResult<ImportResult> {
  import_record(&app, "backgrounds", file_name, data, tags, media_type).map_err(Into::into)
}

#[tauri::command]
fn import_asset(
  app: AppHandle,
  file_name: String,
  data: Vec<u8>,
  tags: Vec<String>,
  media_type: String,
) -> CommandResult<ImportResult> {
  import_record(&app, "assets", file_name, data, tags, media_type).map_err(Into::into)
}

#[tauri::command]
fn import_font(
  app: AppHandle,
  file_name: String,
  data: Vec<u8>,
  tags: Vec<String>,
  media_type: String,
) -> CommandResult<ImportResult> {
  import_record(&app, "fonts", file_name, data, tags, media_type).map_err(Into::into)
}

#[tauri::command]
fn save_project(project_dir: String, document: Value, metadata: Value) -> CommandResult<ProjectPayload> {
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
  fs::create_dir_all(&root).map_err(AppError::from).map_err(String::from)?;
  let mut projects = Vec::new();

  for entry in fs::read_dir(root).map_err(AppError::from).map_err(String::from)? {
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
fn create_project(app: AppHandle, title: String, document: Value) -> CommandResult<ProjectPayload> {
  let id = Uuid::new_v4().to_string();
  let root = project_dir(&app, &id).map_err(String::from)?;
  let metadata = serde_json::json!({
    "id": id,
    "savedAt": Utc::now().to_rfc3339(),
    "app": "handout-generator"
  });
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
fn save_managed_project(app: AppHandle, project_id: String, document: Value) -> CommandResult<ProjectPayload> {
  let root = project_dir(&app, &project_id).map_err(String::from)?;
  let metadata = serde_json::json!({
    "id": project_id,
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
  fs::write(&path, decode_data_url(&data_url).map_err(AppError::from)?).map_err(AppError::from)?;
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
      export_image,
      create_project,
      get_library,
      import_background,
      import_asset,
      import_font,
      list_projects,
      open_managed_project,
      open_project,
      save_managed_project,
      save_project
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
