//! Asset library I/O, font metadata parsing, and import pipeline service boundary.

use std::{
    fs,
    path::Path,
    sync::{Mutex, MutexGuard, OnceLock},
};

use chrono::Utc;
use rayon::prelude::*;
use tauri::AppHandle;
use uuid::Uuid;

use crate::errors::AppError;
use crate::services::path_service::{
    clean_file_name, ensure_folder, index_path, library_root, normalize_folder,
    remove_file_if_exists, write_debug_log,
};
use crate::services::preview_service::write_webp_thumbnail;
use crate::types::{ImportResult, LibraryIndex, LibraryRecord, TokenRingConfig};

pub(crate) struct BatchImportInput<'a> {
    pub(crate) client_id: String,
    pub(crate) file_name: String,
    pub(crate) media_type: String,
    pub(crate) data: &'a [u8],
}

pub(crate) struct BatchImportOutcome {
    pub(crate) client_id: String,
    pub(crate) file_name: String,
    pub(crate) record: Option<LibraryRecord>,
    pub(crate) error: Option<String>,
}

struct PreparedImport<'a> {
    outcome_index: usize,
    record: LibraryRecord,
    data: &'a [u8],
}

static LIBRARY_IMPORT_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

pub(crate) fn lock_library_mutation() -> MutexGuard<'static, ()> {
    LIBRARY_IMPORT_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub(crate) fn ensure_library(app: &AppHandle) -> Result<(), AppError> {
    let root = library_root(app)?;
    fs::create_dir_all(root.join("backgrounds"))?;
    fs::create_dir_all(root.join("assets"))?;
    fs::create_dir_all(root.join("fonts"))?;
    fs::create_dir_all(root.join("thumbnails"))?;

    let path = index_path(app)?;
    if !path.exists() {
        let mut index = LibraryIndex::default();
        index.asset_folders = vec!["rings".to_string(), "token-tmp".to_string()];
        fs::write(path, serde_json::to_vec_pretty(&index)?)?;
    } else {
        let mut index: LibraryIndex = serde_json::from_slice(&fs::read(&path)?)?;
        let previous = index.asset_folders.len();
        ensure_folder(&mut index.asset_folders, "rings");
        ensure_folder(&mut index.asset_folders, "token-tmp");
        if index.asset_folders.len() != previous {
            fs::write(path, serde_json::to_vec_pretty(&index)?)?;
        }
    }

    Ok(())
}

pub(crate) fn read_index(app: &AppHandle) -> Result<LibraryIndex, AppError> {
    ensure_library(app)?;
    let bytes = fs::read(index_path(app)?)?;
    Ok(serde_json::from_slice(&bytes)?)
}

pub(crate) fn write_index(app: &AppHandle, index: &LibraryIndex) -> Result<(), AppError> {
    ensure_library(app)?;
    fs::write(index_path(app)?, serde_json::to_vec_pretty(index)?)?;
    Ok(())
}

pub(crate) fn library_folders_mut<'a>(
    index: &'a mut LibraryIndex,
    kind: &str,
) -> Option<&'a mut Vec<String>> {
    match kind {
        "background" | "backgrounds" => Some(&mut index.background_folders),
        "asset" | "assets" => Some(&mut index.asset_folders),
        "font" | "fonts" => Some(&mut index.font_folders),
        _ => None,
    }
}

pub(crate) fn library_records_mut<'a>(
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
    if value.is_empty() { None } else { Some(value) }
}

pub(crate) fn extract_font_family_from_bytes(bytes: &[u8]) -> Option<String> {
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

pub(crate) fn ensure_font_metadata(index: &mut LibraryIndex) -> bool {
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
                let _ = write_debug_log(
                    "text",
                    &format!(
                        "{{\"timestamp\":\"{}\",\"scope\":\"text\",\"message\":\"font-metadata-repaired\",\"data\":{{\"id\":\"{}\",\"name\":\"{}\",\"fontFamily\":\"{}\"}}}}",
                        Utc::now().to_rfc3339(),
                        record.id.replace('"', "\\\""),
                        record.name.replace('"', "\\\""),
                        font_family.replace('"', "\\\"")
                    ),
                );
            }
            None => {
                let _ = write_debug_log(
                    "text",
                    &format!(
                        "{{\"timestamp\":\"{}\",\"scope\":\"text\",\"message\":\"font-metadata-repair-failed\",\"data\":{{\"id\":\"{}\",\"name\":\"{}\",\"path\":\"{}\"}}}}",
                        Utc::now().to_rfc3339(),
                        record.id.replace('"', "\\\""),
                        record.name.replace('"', "\\\""),
                        record.path.replace('"', "\\\"")
                    ),
                );
            }
        }
    }
    changed
}

pub(crate) fn import_records_batch(
    app: &AppHandle,
    bucket: &str,
    folder: String,
    tags: Vec<String>,
    files: Vec<BatchImportInput<'_>>,
) -> Result<(Vec<BatchImportOutcome>, LibraryIndex), AppError> {
    let _guard = lock_library_mutation();
    ensure_library(app)?;
    let folder = normalize_folder(folder);
    let root = library_root(app)?.join(bucket);
    let now = Utc::now();
    let mut outcomes = Vec::with_capacity(files.len());
    let mut prepared = Vec::with_capacity(files.len());

    for file in files {
        let id = Uuid::new_v4().to_string();
        let clean_name = clean_file_name(&file.file_name);
        let stored_name = format!("{id}-{clean_name}");
        let destination = root.join(&stored_name);
        let outcome_index = outcomes.len();
        match fs::write(&destination, file.data) {
            Ok(()) => {
                outcomes.push(BatchImportOutcome {
                    client_id: file.client_id,
                    file_name: file.file_name.clone(),
                    record: None,
                    error: None,
                });
                prepared.push(PreparedImport {
                    outcome_index,
                    record: LibraryRecord {
                        id,
                        name: file.file_name,
                        file_name: stored_name,
                        path: destination.to_string_lossy().to_string(),
                        thumbnail_path: None,
                        font_family: None,
                        tags: tags.clone(),
                        folder: folder.clone(),
                        media_type: file.media_type,
                        created_at: now,
                        updated_at: now,
                        token_ring: if bucket == "assets" && folder == "rings" {
                            Some(TokenRingConfig {
                                revision: 1,
                                design_size: 512.0,
                                inner_radius: 225.0,
                                outer_radius: 250.0,
                                image_scale_x: 100.0,
                                image_scale_y: 100.0,
                                image_offset_x: 0.0,
                                image_offset_y: 0.0,
                                legacy: false,
                            })
                        } else {
                            None
                        },
                    },
                    data: file.data,
                });
            }
            Err(error) => outcomes.push(BatchImportOutcome {
                client_id: file.client_id,
                file_name: file.file_name,
                record: None,
                error: Some(error.to_string()),
            }),
        }
    }

    let worker_count = std::thread::available_parallelism()
        .map_or(2, usize::from)
        .clamp(1, 4);
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(worker_count)
        .build()
        .map_err(|error| AppError::ImportWorkerPool(error.to_string()))?;
    pool.install(|| {
        prepared.par_iter_mut().for_each(|item| {
            if matches!(bucket, "backgrounds" | "assets") {
                match write_webp_thumbnail(app, &item.record.id, item.data) {
                    Ok(path) => item.record.thumbnail_path = Some(path.to_string_lossy().to_string()),
                    Err(error) => {
                        let _ = write_debug_log("upload", &format!(
                            "{{\"timestamp\":\"{}\",\"scope\":\"upload\",\"message\":\"batch-thumbnail-failed\",\"data\":{{\"fileName\":\"{}\",\"error\":\"{}\"}}}}",
                            Utc::now().to_rfc3339(),
                            item.record.name.replace('"', "\\\""),
                            error.to_string().replace('"', "\\\"")
                        ));
                    }
                }
            } else if bucket == "fonts" {
                item.record.font_family = extract_font_family_from_bytes(item.data);
            }
        });
    });

    let mut index = read_index(app)?;
    match bucket {
        "backgrounds" => {
            ensure_folder(&mut index.background_folders, &folder);
            index
                .backgrounds
                .extend(prepared.iter().map(|item| item.record.clone()));
        }
        "assets" => {
            ensure_folder(&mut index.asset_folders, &folder);
            index
                .assets
                .extend(prepared.iter().map(|item| item.record.clone()));
        }
        "fonts" => {
            ensure_folder(&mut index.font_folders, &folder);
            index
                .fonts
                .extend(prepared.iter().map(|item| item.record.clone()));
        }
        _ => return Err(AppError::InvalidLibraryKind(bucket.into())),
    }
    if let Err(error) = write_index(app, &index) {
        for item in &prepared {
            let _ = remove_file_if_exists(Path::new(&item.record.path));
            if let Some(path) = &item.record.thumbnail_path {
                let _ = remove_file_if_exists(Path::new(path));
            }
        }
        return Err(error);
    }
    for item in prepared {
        outcomes[item.outcome_index].record = Some(item.record);
    }
    Ok((outcomes, index))
}

pub(crate) fn import_record(
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
                let _ = write_debug_log(
                    "thumbnail",
                    &format!(
                        "{{\"timestamp\":\"{}\",\"scope\":\"thumbnail\",\"message\":\"failed to generate import thumbnail\",\"data\":{{\"id\":\"{}\",\"fileName\":\"{}\",\"error\":\"{}\"}}}}",
                        Utc::now().to_rfc3339(),
                        id,
                        file_name.replace('"', "\\\""),
                        error.to_string().replace('"', "\\\"")
                    ),
                );
                None
            }
        }
    } else {
        None
    };
    let font_family = if bucket == "fonts" {
        let extracted = extract_font_family_from_bytes(&data);
        let _ = write_debug_log(
            "text",
            &format!(
                "{{\"timestamp\":\"{}\",\"scope\":\"text\",\"message\":\"font-metadata-import\",\"data\":{{\"fileName\":\"{}\",\"fontFamily\":{}}}}}",
                Utc::now().to_rfc3339(),
                file_name.replace('"', "\\\""),
                extracted
                    .as_ref()
                    .map(|value| format!("\"{}\"", value.replace('"', "\\\"")))
                    .unwrap_or_else(|| "null".to_string())
            ),
        );
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
        token_ring: if bucket == "assets" && folder == "rings" {
            Some(crate::types::TokenRingConfig {
                revision: 1,
                design_size: 512.0,
                inner_radius: 225.0,
                outer_radius: 250.0,
                image_scale_x: 100.0,
                image_scale_y: 100.0,
                image_offset_x: 0.0,
                image_offset_y: 0.0,
                legacy: false,
            })
        } else {
            None
        },
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

pub(crate) fn ensure_record_thumbnail(
    app: &AppHandle,
    record: &mut LibraryRecord,
) -> Result<bool, AppError> {
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

pub(crate) fn delete_record_files(record: &LibraryRecord) -> Result<(), AppError> {
    remove_file_if_exists(&record.path)?;
    if let Some(path) = &record.thumbnail_path {
        remove_file_if_exists(path)?;
    }
    Ok(())
}
