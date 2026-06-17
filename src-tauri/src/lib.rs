use std::{
  fs,
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
  #[error("failed to resolve app data directory")]
  AppDataDir,
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
  assets: Vec<LibraryRecord>,
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

fn app_root(app: &AppHandle) -> Result<PathBuf, AppError> {
  app.path().app_data_dir().map_err(|_| AppError::AppDataDir)
}

fn library_root(app: &AppHandle) -> Result<PathBuf, AppError> {
  Ok(app_root(app)?.join("library"))
}

fn index_path(app: &AppHandle) -> Result<PathBuf, AppError> {
  Ok(library_root(app)?.join("index.json"))
}

fn ensure_library(app: &AppHandle) -> Result<(), AppError> {
  let root = library_root(app)?;
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

#[tauri::command]
fn get_library(app: AppHandle) -> CommandResult<LibraryIndex> {
  read_index(&app).map_err(Into::into)
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
  fs::create_dir_all(&root).map_err(AppError::from)?;
  fs::write(root.join("handout.json"), serde_json::to_vec_pretty(&document).map_err(AppError::from)?)
    .map_err(AppError::from)?;
  fs::write(root.join("metadata.json"), serde_json::to_vec_pretty(&metadata).map_err(AppError::from)?)
    .map_err(AppError::from)?;

  Ok(ProjectPayload { document, metadata })
}

#[tauri::command]
fn open_project(project_dir: String) -> CommandResult<ProjectPayload> {
  let root = PathBuf::from(project_dir);
  let document = serde_json::from_slice(&fs::read(root.join("handout.json")).map_err(AppError::from)?)
    .map_err(AppError::from)?;
  let metadata_path = root.join("metadata.json");
  let metadata = if metadata_path.exists() {
    serde_json::from_slice(&fs::read(metadata_path).map_err(AppError::from)?).map_err(AppError::from)?
  } else {
    serde_json::json!({})
  };

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
      get_library,
      import_asset,
      import_font,
      open_project,
      save_project
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
