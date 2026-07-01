//! Export command boundary.

use std::{fs, path::PathBuf, time::Instant};

use tauri::{
    ipc::{InvokeBody, Request},
    AppHandle, Manager,
};

use crate::{
    clean_file_name,
    services::image_codec::{encode_export_image, normalize_export_file_name, ExportImageFormat},
    services::path_service::decode_data_url,
    AppError, CommandResult,
};

#[tauri::command]
pub fn export_image(file_path: String, data_url: String) -> CommandResult<String> {
    let path = PathBuf::from(file_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(AppError::from)?;
    }
    fs::write(&path, decode_data_url(&data_url).map_err(AppError::from)?)
        .map_err(AppError::from)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn export_image_to_downloads(
    app: AppHandle,
    file_name: String,
    data_url: String,
) -> CommandResult<String> {
    let clean_name = clean_file_name(&file_name);
    let lower_name = clean_name.to_lowercase();
    let file_name = if lower_name.ends_with(".png")
        || lower_name.ends_with(".jpg")
        || lower_name.ends_with(".jpeg")
        || lower_name.ends_with(".webp")
    {
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
pub fn export_image_bytes_to_downloads(
    app: AppHandle,
    file_name: String,
    data: Vec<u8>,
    format: String,
    quality: Option<u8>,
) -> CommandResult<String> {
    let format = ExportImageFormat::parse(&format).map_err(String::from)?;
    let clean_name = normalize_export_file_name(&clean_file_name(&file_name), format.extension());
    let encoded = encode_export_image(&data, format, quality).map_err(String::from)?;
    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&downloads)
        .map_err(AppError::from)
        .map_err(String::from)?;
    let path = downloads.join(clean_name);
    fs::write(&path, encoded)
        .map_err(AppError::from)
        .map_err(String::from)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn write_encoded_image_bytes_to_downloads(
    app: AppHandle,
    request: Request<'_>,
) -> CommandResult<String> {
    let file_name = request
        .headers()
        .get("x-file-name")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("handout.png")
        .to_string();
    let data = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(_) => {
            return Err("write_encoded_image_bytes_to_downloads expects raw bytes".into())
        }
    };
    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    write_encoded_bytes_to_dir(&downloads, &file_name, &data)
}

#[tauri::command]
pub fn export_image_file_to_downloads(
    app: AppHandle,
    file_name: String,
    staging_path: String,
    format: String,
    quality: Option<u8>,
) -> CommandResult<String> {
    let started_at = Instant::now();
    let format = ExportImageFormat::parse(&format).map_err(String::from)?;
    let clean_name = normalize_export_file_name(&clean_file_name(&file_name), format.extension());
    let app_local_data = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    let staging_relative =
        crate::safe_project_relative_path(&staging_path).map_err(String::from)?;
    let staging_file = app_local_data.join(staging_relative);
    let read_started_at = Instant::now();
    let data = fs::read(&staging_file)
        .map_err(AppError::from)
        .map_err(String::from)?;
    let read_ms = read_started_at.elapsed().as_millis();
    let encode_started_at = Instant::now();
    let encoded = encode_export_image(&data, format, quality).map_err(String::from)?;
    let encode_ms = encode_started_at.elapsed().as_millis();
    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&downloads)
        .map_err(AppError::from)
        .map_err(String::from)?;
    let path = downloads.join(clean_name);
    let write_started_at = Instant::now();
    fs::write(&path, encoded)
        .map_err(AppError::from)
        .map_err(String::from)?;
    let write_ms = write_started_at.elapsed().as_millis();
    let _ = fs::remove_file(staging_file);
    log::info!(
        "export_image_file_to_downloads read={}ms encode={}ms write={}ms total={}ms",
        read_ms,
        encode_ms,
        write_ms,
        started_at.elapsed().as_millis()
    );
    Ok(path.to_string_lossy().to_string())
}

fn normalize_encoded_export_file_name(file_name: &str) -> String {
    let lower_name = file_name.to_ascii_lowercase();
    if lower_name.ends_with(".png")
        || lower_name.ends_with(".jpg")
        || lower_name.ends_with(".jpeg")
        || lower_name.ends_with(".webp")
    {
        file_name.to_string()
    } else {
        format!("{file_name}.png")
    }
}

fn write_encoded_bytes_to_dir(downloads: &std::path::Path, file_name: &str, data: &[u8]) -> CommandResult<String> {
    let clean_name = normalize_encoded_export_file_name(&clean_file_name(file_name));
    fs::create_dir_all(downloads)
        .map_err(AppError::from)
        .map_err(String::from)?;
    let path = downloads.join(clean_name);
    fs::write(&path, data)
        .map_err(AppError::from)
        .map_err(String::from)?;
    Ok(path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::write_encoded_bytes_to_dir;

    #[test]
    fn writes_encoded_bytes_without_reencoding() {
        let dir = std::env::temp_dir().join(format!(
            "handout-generator-export-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let bytes = [1_u8, 2, 3, 4, 5];

        let path = write_encoded_bytes_to_dir(&dir, "handout.png", &bytes).unwrap();
        let written = std::fs::read(path).unwrap();

        assert_eq!(written, bytes);
        let _ = std::fs::remove_dir_all(dir);
    }
}
