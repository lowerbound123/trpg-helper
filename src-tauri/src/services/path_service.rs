//! Path resolution, folder utilities, filesystem helpers, data-url helpers,
//! and debug logging service boundary.

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use base64::{engine::general_purpose, Engine as _};
use tauri::AppHandle;

use crate::errors::{AppError, CommandResult};

pub fn clean_file_name(file_name: &str) -> String {
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

pub(crate) fn app_root(_app: &AppHandle) -> Result<PathBuf, AppError> {
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

pub(crate) fn project_root() -> Result<PathBuf, AppError> {
    let cwd = std::env::current_dir().map_err(|_| AppError::DataDir)?;
    if cwd.file_name().and_then(|name| name.to_str()) == Some("src-tauri") {
        return cwd.parent().map(Path::to_path_buf).ok_or(AppError::DataDir);
    }
    Ok(cwd)
}

pub(crate) fn library_root(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(app_root(app)?.join("library"))
}

pub(crate) fn thumbnails_root(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(library_root(app)?.join("thumbnails"))
}

pub(crate) fn projects_root(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(app_root(app)?.join("projects"))
}

pub(crate) fn token_projects_root(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(app_root(app)?.join("token-projects"))
}

pub(crate) fn token_project_folders_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(token_projects_root(app)?.join("folders.json"))
}

pub(crate) fn index_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(library_root(app)?.join("index.json"))
}

pub(crate) fn project_folders_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(projects_root(app)?.join("folders.json"))
}

pub(crate) fn normalize_folder(folder: String) -> String {
    folder
        .trim()
        .trim_matches('/')
        .split('/')
        .filter(|part| !part.trim().is_empty())
        .map(str::trim)
        .collect::<Vec<_>>()
        .join("/")
}

pub(crate) fn ensure_folder(folders: &mut Vec<String>, folder: &str) {
    if folder.is_empty() || folders.iter().any(|item| item == folder) {
        return;
    }
    folders.push(folder.to_string());
    folders.sort();
}

pub(crate) fn rename_folder_value(value: &str, old_folder: &str, new_folder: &str) -> String {
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

pub(crate) fn folder_is_or_descendant(value: &str, folder: &str) -> bool {
    if folder.is_empty() {
        return value.is_empty();
    }
    value == folder || value.starts_with(&format!("{folder}/"))
}

pub(crate) fn remove_file_if_exists(path: impl AsRef<Path>) -> Result<(), AppError> {
    let path = path.as_ref();
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

pub(crate) fn remove_dir_if_exists(path: impl AsRef<Path>) -> Result<(), AppError> {
    let path = path.as_ref();
    if path.exists() {
        fs::remove_dir_all(path)?;
    }
    Ok(())
}

pub(crate) fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), AppError> {
    if !source.exists() {
        return Ok(());
    }
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if source_path.is_dir() {
            copy_dir_recursive(&source_path, &target_path)?;
        } else {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(source_path, target_path)?;
        }
    }
    Ok(())
}

pub(crate) fn decode_data_url(data_url: &str) -> Result<Vec<u8>, AppError> {
    let (_, data) = data_url.split_once(',').ok_or(AppError::InvalidDataUrl)?;
    Ok(general_purpose::STANDARD.decode(data)?)
}

pub(crate) fn encode_data_url(path: &Path, media_type: &str) -> Result<String, AppError> {
    let bytes = fs::read(path)?;
    Ok(format!(
        "data:{};base64,{}",
        media_type,
        general_purpose::STANDARD.encode(bytes)
    ))
}

pub(crate) fn debug_log_file_name(scope: &str) -> &'static str {
    match scope {
        "speed" => "speed.log",
        "mask" => "mask.log",
        "text" => "text.log",
        "token" => "token.log",
        "render" | "export" | "thumbnail" | "background-render" | "handout-preview" | "flat" => {
            "render.log"
        }
        "upload" => "upload.log",
        _ => "app.log",
    }
}

pub(crate) fn write_debug_log(scope: &str, line: &str) -> CommandResult<String> {
    let logs_dir = project_root().map_err(String::from)?.join("logs");
    fs::create_dir_all(&logs_dir)
        .map_err(AppError::from)
        .map_err(String::from)?;
    let path = logs_dir.join(debug_log_file_name(scope));
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

pub(crate) fn reset_debug_log() {
    if let Ok(path) = project_root().map(|root| root.join("logs")) {
        let _ = fs::create_dir_all(&path);
        for file_name in ["app.log", "mask.log", "render.log", "speed.log", "text.log", "upload.log"] {
            let _ = fs::write(path.join(file_name), "");
        }
    }
}
