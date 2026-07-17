//! Export command boundary.

use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, time::Instant};

use tauri::{
    AppHandle, Manager,
    ipc::{InvokeBody, Request},
};

use crate::{
    AppError, CommandResult, clean_file_name,
    services::image_codec::{ExportImageFormat, encode_export_image, normalize_export_file_name},
    services::image_encoding::{
        ImageEncodingContext, ImageEncodingOptions, WebpEncodingProfile, encode_rgba_image,
        optimize_png_bytes,
    },
    services::path_service::decode_data_url,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HandoutExportMetadata {
    file_name: String,
    width: u32,
    height: u32,
    input_encoding: String,
    options: ImageEncodingOptions,
    jpeg_matte_color: Option<String>,
    webp_strength_profiles: Option<Vec<WebpEncodingProfile>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoutExportResult {
    path: String,
    input_bytes: usize,
    output_bytes: usize,
    decode_ms: u128,
    encode_ms: u128,
    write_ms: u128,
}

fn parse_handout_export_envelope(data: &[u8]) -> Result<(HandoutExportMetadata, &[u8]), String> {
    if data.len() < 8 || &data[..4] != b"HGE1" {
        return Err("Handout 导出 envelope magic/version 无效".into());
    }
    let header_len = u32::from_le_bytes(
        data[4..8]
            .try_into()
            .map_err(|_| "Handout 导出 header 无效")?,
    ) as usize;
    let payload_start = 8usize
        .checked_add(header_len)
        .ok_or("Handout 导出 header 长度溢出")?;
    if payload_start > data.len() {
        return Err("Handout 导出 envelope 被截断".into());
    }
    let metadata = serde_json::from_slice(&data[8..payload_start])
        .map_err(|error| format!("Handout 导出 metadata 无效: {error}"))?;
    Ok((metadata, &data[payload_start..]))
}

fn handout_output_path(
    downloads: &std::path::Path,
    file_name: &str,
    format: &str,
) -> Result<PathBuf, String> {
    let extension = match format {
        "png" => "png",
        "jpg" | "jpeg" => "jpg",
        "webp" => "webp",
        "jxl" => "jxl",
        _ => return Err("不支持的 Handout 导出格式".into()),
    };
    let clean = clean_file_name(file_name);
    let stem = std::path::Path::new(&clean)
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("handout");
    let mut path = downloads.join(format!("{stem}.{extension}"));
    let mut suffix = 2usize;
    while path.exists() {
        path = downloads.join(format!("{stem}_{suffix}.{extension}"));
        suffix += 1;
    }
    Ok(path)
}

fn encode_handout_payload(app: AppHandle, data: Vec<u8>) -> CommandResult<HandoutExportResult> {
    let (metadata, payload) = parse_handout_export_envelope(&data)?;
    let limits = &crate::token::configuration::active_handout_export_configuration().limits;
    if metadata.width == 0
        || metadata.height == 0
        || metadata.width > limits.max_canvas_dimension
        || metadata.height > limits.max_canvas_dimension
    {
        return Err(format!(
            "Handout 导出尺寸必须介于 1 和 {} 之间",
            limits.max_canvas_dimension
        ));
    }
    if u64::from(metadata.width) * u64::from(metadata.height) > limits.max_canvas_pixels {
        return Err(format!(
            "Handout 导出像素总数不能超过 {}",
            limits.max_canvas_pixels
        ));
    }
    let decode_started = Instant::now();
    let image = match metadata.input_encoding.as_str() {
        "rgba8" => {
            let expected =
                usize::try_from(u64::from(metadata.width) * u64::from(metadata.height) * 4)
                    .map_err(|_| "RGBA payload 尺寸溢出")?;
            if payload.len() != expected {
                return Err(format!(
                    "RGBA payload 长度无效，预期 {expected}，实际 {}",
                    payload.len()
                ));
            }
            image::RgbaImage::from_raw(metadata.width, metadata.height, payload.to_vec())
                .ok_or("无法创建 RGBA 图片")?
        }
        "png" => {
            let decoded = image::load_from_memory_with_format(payload, image::ImageFormat::Png)
                .map_err(|error| format!("传输 PNG 解码失败: {error}"))?
                .to_rgba8();
            if decoded.dimensions() != (metadata.width, metadata.height) {
                return Err("传输 PNG 尺寸与 metadata 不一致".into());
            }
            decoded
        }
        _ => return Err("Handout 输入编码仅支持 rgba8 或 png".into()),
    };
    let decode_ms = decode_started.elapsed().as_millis();
    let profiles = metadata.webp_strength_profiles.unwrap_or_else(|| {
        vec![
            WebpEncodingProfile {
                id: "fast".into(),
                method: 2,
                passes: 1,
            },
            WebpEncodingProfile {
                id: "balanced".into(),
                method: 4,
                passes: 2,
            },
            WebpEncodingProfile {
                id: "strong".into(),
                method: 5,
                passes: 6,
            },
            WebpEncodingProfile {
                id: "maximum".into(),
                method: 6,
                passes: 10,
            },
        ]
    });
    let encode_started = Instant::now();
    let encoded = if metadata.input_encoding == "png" && metadata.options.format == "png" {
        optimize_png_bytes(payload, &metadata.options)?
    } else {
        encode_rgba_image(
            &image,
            &metadata.options,
            &ImageEncodingContext {
                jpeg_matte_color: metadata.jpeg_matte_color.as_deref().unwrap_or("#FFFFFFFF"),
                webp_strength_profiles: &profiles,
            },
        )?
    };
    let encode_ms = encode_started.elapsed().as_millis();
    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&downloads)
        .map_err(AppError::from)
        .map_err(String::from)?;
    let path = handout_output_path(&downloads, &metadata.file_name, &metadata.options.format)?;
    let write_started = Instant::now();
    fs::write(&path, &encoded)
        .map_err(AppError::from)
        .map_err(String::from)?;
    let write_ms = write_started.elapsed().as_millis();
    Ok(HandoutExportResult {
        path: path.to_string_lossy().to_string(),
        input_bytes: payload.len(),
        output_bytes: encoded.len(),
        decode_ms,
        encode_ms,
        write_ms,
    })
}

#[tauri::command]
pub async fn encode_handout_image_to_downloads(
    app: AppHandle,
    request: Request<'_>,
) -> CommandResult<HandoutExportResult> {
    let data = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(_) => {
            return Err("encode_handout_image_to_downloads expects raw bytes".into());
        }
    };
    tauri::async_runtime::spawn_blocking(move || encode_handout_payload(app, data))
        .await
        .map_err(|error| format!("Handout 编码任务失败: {error}"))?
}

#[tauri::command]
pub fn export_image(file_path: String, data_url: String) -> CommandResult<String> {
    let path = PathBuf::from(file_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(AppError::from)?;
    }
    fs::write(&path, decode_data_url(&data_url)?).map_err(AppError::from)?;
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
    fs::write(&path, decode_data_url(&data_url)?).map_err(AppError::from)?;
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
            return Err("write_encoded_image_bytes_to_downloads expects raw bytes".into());
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
        || lower_name.ends_with(".jxl")
    {
        file_name.to_string()
    } else {
        format!("{file_name}.png")
    }
}

fn write_encoded_bytes_to_dir(
    downloads: &std::path::Path,
    file_name: &str,
    data: &[u8],
) -> CommandResult<String> {
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
    use super::{handout_output_path, parse_handout_export_envelope, write_encoded_bytes_to_dir};
    use serde_json::json;

    fn envelope(metadata: serde_json::Value, payload: &[u8]) -> Vec<u8> {
        let header = serde_json::to_vec(&metadata).unwrap();
        let mut data = Vec::with_capacity(8 + header.len() + payload.len());
        data.extend_from_slice(b"HGE1");
        data.extend_from_slice(&(header.len() as u32).to_le_bytes());
        data.extend_from_slice(&header);
        data.extend_from_slice(payload);
        data
    }

    fn metadata() -> serde_json::Value {
        json!({
            "fileName": "中文讲义.png",
            "width": 1,
            "height": 1,
            "inputEncoding": "rgba8",
            "options": {
                "format": "png",
                "pngOptimizationLevel": 3,
                "pngOptimizeAlpha": true,
                "pngPreserveMetadata": false,
                "pngZopfli": false,
                "jpegQuality": 85,
                "jpegProgressive": true,
                "jpegDeringing": true,
                "jpegChromaSubsampling": "422",
                "webpQuality": 90,
                "webpLossless": false,
                "webpEncodingStrength": "balanced",
                "jxlLossless": false,
                "jxlDistance": 1.0,
                "jxlEffort": 7,
                "jxlProgressive": true,
                "jxlDecodingSpeed": 0
            }
        })
    }

    #[test]
    fn parses_versioned_handout_envelope_and_preserves_payload() {
        let data = envelope(metadata(), &[1, 2, 3, 4]);
        let (metadata, payload) = parse_handout_export_envelope(&data).unwrap();

        assert_eq!(metadata.file_name, "中文讲义.png");
        assert_eq!(metadata.options.format, "png");
        assert_eq!(payload, [1, 2, 3, 4]);
    }

    #[test]
    fn rejects_truncated_or_invalid_handout_envelopes() {
        assert!(parse_handout_export_envelope(b"HGE1\x10\x00\x00\x00{}").is_err());
        assert!(parse_handout_export_envelope(b"BAD!\x00\x00\x00\x00").is_err());
    }

    #[test]
    fn handout_output_path_avoids_existing_names() {
        let dir =
            std::env::temp_dir().join(format!("trpg-helper-envelope-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("中文讲义.png"), []).unwrap();

        let path = handout_output_path(&dir, "中文讲义.png", "png").unwrap();

        assert_eq!(path.file_name().unwrap(), "中文讲义_2.png");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn writes_encoded_bytes_without_reencoding() {
        let dir =
            std::env::temp_dir().join(format!("trpg-helper-export-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let bytes = [1_u8, 2, 3, 4, 5];

        let path = write_encoded_bytes_to_dir(&dir, "handout.png", &bytes).unwrap();
        let written = std::fs::read(path).unwrap();

        assert_eq!(written, bytes);
        let _ = std::fs::remove_dir_all(dir);
    }
}
