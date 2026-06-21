//! Export command boundary.

use std::{fs, time::Instant};

use tauri::{AppHandle, Manager};

use crate::{
    clean_file_name,
    services::image_codec::{encode_export_image, normalize_export_file_name, ExportImageFormat},
    AppError, CommandResult,
};

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
