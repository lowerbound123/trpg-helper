use std::{
    collections::HashMap,
    ffi::OsString,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{
    SegmentationCoreProgress,
    models::{ModelDownload, ModelSpec},
};

static MODEL_DOWNLOAD_LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();
const VERIFICATION_MARKER_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
struct VerificationMarker {
    schema_version: u32,
    model: String,
    revision: String,
    sha256: String,
    size_bytes: u64,
    modified_ns: u64,
}

fn model_download_lock(key: &str) -> Arc<Mutex<()>> {
    MODEL_DOWNLOAD_LOCKS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .entry(key.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

fn sha256_file(
    path: &Path,
    model: &str,
    total_bytes: u64,
    emit: &(dyn Fn(SegmentationCoreProgress) + Sync),
) -> Result<String, String> {
    let mut file = fs::File::open(path)
        .map_err(|error| format!("模型文件无法读取 {}: {error}", path.display()))?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    let mut completed_bytes = 0_u64;
    let mut next_report = 0_u64;
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("模型哈希读取失败: {error}"))?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
        completed_bytes = completed_bytes.saturating_add(read as u64);
        if completed_bytes >= next_report || completed_bytes == total_bytes {
            emit(SegmentationCoreProgress {
                stage: "model-verify-progress",
                model: model.into(),
                device: None,
                completed_bytes: Some(completed_bytes),
                total_bytes: Some(total_bytes),
                elapsed_ms: None,
                error: None,
            });
            next_report = completed_bytes.saturating_add(64 * 1024 * 1024);
        }
    }
    Ok(hex::encode(digest.finalize()))
}

fn verification_marker_path(path: &Path) -> PathBuf {
    let mut file_name = path
        .file_name()
        .map(OsString::from)
        .unwrap_or_else(|| OsString::from("model"));
    file_name.push(".verified.json");
    path.with_file_name(file_name)
}

fn verification_marker(
    path: &Path,
    spec: ModelSpec,
    download: ModelDownload,
) -> Result<VerificationMarker, String> {
    let metadata =
        fs::metadata(path).map_err(|error| format!("模型 metadata 读取失败: {error}"))?;
    let modified_ns = metadata
        .modified()
        .map_err(|error| format!("模型修改时间读取失败: {error}"))?
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("模型修改时间无效: {error}"))?
        .as_nanos()
        .min(u128::from(u64::MAX)) as u64;
    Ok(VerificationMarker {
        schema_version: VERIFICATION_MARKER_SCHEMA_VERSION,
        model: spec.id.as_str().into(),
        revision: download.revision.into(),
        sha256: download.sha256.into(),
        size_bytes: metadata.len(),
        modified_ns,
    })
}

fn persisted_verification_matches(
    path: &Path,
    spec: ModelSpec,
    download: ModelDownload,
) -> Result<bool, String> {
    let expected = verification_marker(path, spec, download)?;
    let marker_path = verification_marker_path(path);
    let Ok(bytes) = fs::read(marker_path) else {
        return Ok(false);
    };
    let Ok(saved) = serde_json::from_slice::<VerificationMarker>(&bytes) else {
        return Ok(false);
    };
    Ok(saved == expected)
}

fn persist_verification_marker(
    path: &Path,
    spec: ModelSpec,
    download: ModelDownload,
) -> Result<(), String> {
    let marker = verification_marker(path, spec, download)?;
    let marker_path = verification_marker_path(path);
    let partial_path = marker_path.with_extension(format!("json.{}.partial", uuid::Uuid::new_v4()));
    let bytes = serde_json::to_vec_pretty(&marker)
        .map_err(|error| format!("模型校验标记序列化失败: {error}"))?;
    fs::write(&partial_path, bytes).map_err(|error| format!("模型校验标记写入失败: {error}"))?;
    if marker_path.exists() {
        fs::remove_file(&marker_path)
            .map_err(|error| format!("旧模型校验标记删除失败: {error}"))?;
    }
    if let Err(error) = fs::rename(&partial_path, &marker_path) {
        let _ = fs::remove_file(&partial_path);
        return Err(format!("模型校验标记提交失败: {error}"));
    }
    Ok(())
}

fn valid_model_file(
    path: &Path,
    spec: ModelSpec,
    download: ModelDownload,
    use_persisted_verification: bool,
    emit: &(dyn Fn(SegmentationCoreProgress) + Sync),
) -> Result<bool, String> {
    if !path.is_file() {
        return Ok(false);
    }
    let size = fs::metadata(path)
        .map_err(|error| format!("模型 metadata 读取失败: {error}"))?
        .len();
    if download.size_bytes > 0 && size != download.size_bytes {
        return Ok(false);
    }
    if use_persisted_verification && persisted_verification_matches(path, spec, download)? {
        emit(SegmentationCoreProgress {
            stage: "model-verification-cache-hit",
            model: spec.id.as_str().into(),
            device: None,
            completed_bytes: Some(size),
            total_bytes: Some(download.size_bytes),
            elapsed_ms: None,
            error: None,
        });
        return Ok(true);
    }
    emit(SegmentationCoreProgress {
        stage: "model-verify-start",
        model: spec.id.as_str().into(),
        device: None,
        completed_bytes: Some(0),
        total_bytes: Some(download.size_bytes),
        elapsed_ms: None,
        error: None,
    });
    let valid = sha256_file(path, spec.id.as_str(), download.size_bytes, emit)? == download.sha256;
    if valid && use_persisted_verification {
        persist_verification_marker(path, spec, download)?;
    }
    emit(SegmentationCoreProgress {
        stage: if valid {
            "model-verify-complete"
        } else {
            "model-verify-failed"
        },
        model: spec.id.as_str().into(),
        device: None,
        completed_bytes: Some(download.size_bytes),
        total_bytes: Some(download.size_bytes),
        elapsed_ms: None,
        error: None,
    });
    Ok(valid)
}

fn valid_cached_model(
    path: &Path,
    spec: ModelSpec,
    download: ModelDownload,
    emit: &(dyn Fn(SegmentationCoreProgress) + Sync),
) -> Result<bool, String> {
    valid_model_file(path, spec, download, true, emit)
}

fn model_path(cache_root: &Path, spec: ModelSpec, download: ModelDownload) -> PathBuf {
    cache_root
        .join(spec.id.as_str())
        .join(download.revision)
        .join(download.file_name)
}

pub(crate) fn ensure_model(
    spec: ModelSpec,
    cache_root: &Path,
    allow_download: bool,
    timeout_seconds: u64,
    emit: &(dyn Fn(SegmentationCoreProgress) + Sync),
) -> Result<Option<PathBuf>, String> {
    let Some(download) = spec.download else {
        return Ok(None);
    };
    let target = model_path(cache_root, spec, download);
    emit(SegmentationCoreProgress {
        stage: "model-cache-check",
        model: spec.id.as_str().into(),
        device: None,
        completed_bytes: None,
        total_bytes: Some(download.size_bytes),
        elapsed_ms: None,
        error: None,
    });
    let download_lock = model_download_lock(spec.id.as_str());
    emit(SegmentationCoreProgress {
        stage: "model-lock-wait",
        model: spec.id.as_str().into(),
        device: None,
        completed_bytes: None,
        total_bytes: Some(download.size_bytes),
        elapsed_ms: None,
        error: None,
    });
    let _guard = download_lock
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if valid_cached_model(&target, spec, download, emit)? {
        emit(SegmentationCoreProgress {
            stage: "model-cache-hit",
            model: spec.id.as_str().into(),
            device: None,
            completed_bytes: Some(download.size_bytes),
            total_bytes: Some(download.size_bytes),
            elapsed_ms: None,
            error: None,
        });
        return Ok(Some(target));
    }
    if !allow_download {
        return Err(format!("模型 {} 不存在且自动下载已禁用", spec.id.as_str()));
    }

    let parent = target
        .parent()
        .ok_or_else(|| "模型缓存目录无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("模型缓存目录创建失败: {error}"))?;
    let partial = target.with_extension("onnx.partial");
    let _ = fs::remove_file(&partial);

    let result = (|| {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(timeout_seconds.max(1)))
            .build()
            .map_err(|error| format!("模型下载客户端创建失败: {error}"))?;
        let mut response = client
            .get(download.url)
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .map_err(|error| format!("模型下载失败: {error}"))?;
        let total_bytes = response.content_length().unwrap_or(download.size_bytes);
        emit(SegmentationCoreProgress {
            stage: "model-download-start",
            model: spec.id.as_str().into(),
            device: None,
            completed_bytes: Some(0),
            total_bytes: Some(total_bytes),
            elapsed_ms: None,
            error: None,
        });
        let mut output =
            fs::File::create(&partial).map_err(|error| format!("模型临时文件创建失败: {error}"))?;
        let mut buffer = [0_u8; 1024 * 1024];
        let mut completed_bytes = 0_u64;
        let mut next_report = 0_u64;
        loop {
            let read = response
                .read(&mut buffer)
                .map_err(|error| format!("模型下载读取失败: {error}"))?;
            if read == 0 {
                break;
            }
            output
                .write_all(&buffer[..read])
                .map_err(|error| format!("模型下载写入失败: {error}"))?;
            completed_bytes = completed_bytes.saturating_add(read as u64);
            if completed_bytes >= next_report || completed_bytes == total_bytes {
                emit(SegmentationCoreProgress {
                    stage: "model-download-progress",
                    model: spec.id.as_str().into(),
                    device: None,
                    completed_bytes: Some(completed_bytes),
                    total_bytes: Some(total_bytes),
                    elapsed_ms: None,
                    error: None,
                });
                next_report = completed_bytes.saturating_add(8 * 1024 * 1024);
            }
        }
        output
            .flush()
            .map_err(|error| format!("模型临时文件刷新失败: {error}"))?;
        emit(SegmentationCoreProgress {
            stage: "model-download-complete",
            model: spec.id.as_str().into(),
            device: None,
            completed_bytes: Some(completed_bytes),
            total_bytes: Some(total_bytes),
            elapsed_ms: None,
            error: None,
        });
        if !valid_model_file(&partial, spec, download, false, emit)? {
            return Err(format!("模型 {} 校验失败", spec.id.as_str()));
        }
        let backup = target.with_extension("onnx.backup");
        let had_previous = target.exists();
        if had_previous {
            let _ = fs::remove_file(&backup);
            fs::rename(&target, &backup).map_err(|error| format!("旧模型备份失败: {error}"))?;
        }
        if let Err(error) = fs::rename(&partial, &target) {
            if had_previous {
                let _ = fs::rename(&backup, &target);
            }
            return Err(format!("模型原子替换失败: {error}"));
        }
        if had_previous {
            let _ = fs::remove_file(&backup);
        }
        persist_verification_marker(&target, spec, download)?;
        Ok(Some(target.clone()))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&partial);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::foreground_segmentation::{
        SegmentationModelId,
        models::{InputNormalization, OutputTransform, model_spec},
    };

    const TEST_DOWNLOAD: ModelDownload = ModelDownload {
        revision: "test-revision",
        file_name: "test.onnx",
        url: "https://example.invalid/test.onnx",
        sha256: "446957344e9c0910b41c8d0f064fd68fb7f503e7af35a28f1d4e3f6663f36e5d",
        size_bytes: 16,
    };

    const TEST_SPEC: ModelSpec = ModelSpec {
        id: SegmentationModelId::U2Net,
        input_size: 1,
        normalization: InputNormalization::Unit,
        output_index: 0,
        output_transform: OutputTransform::MinMax,
        download: Some(TEST_DOWNLOAD),
    };

    #[test]
    fn vision_does_not_require_a_download() {
        let root =
            std::env::temp_dir().join(format!("segmentation-model-test-{}", uuid::Uuid::new_v4()));
        let result = ensure_model(
            model_spec(SegmentationModelId::MacosVision),
            &root,
            false,
            1,
            &|_| {},
        )
        .unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn successful_verification_is_persisted_and_reused() {
        let root =
            std::env::temp_dir().join(format!("segmentation-verify-test-{}", uuid::Uuid::new_v4()));
        let path = model_path(&root, TEST_SPEC, TEST_DOWNLOAD);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, b"test-model-bytes").unwrap();

        let first_stages = Mutex::new(Vec::new());
        assert!(
            valid_cached_model(&path, TEST_SPEC, TEST_DOWNLOAD, &|progress| {
                first_stages.lock().unwrap().push(progress.stage);
            })
            .unwrap()
        );
        assert!(verification_marker_path(&path).is_file());

        let second_stages = Mutex::new(Vec::new());
        assert!(
            valid_cached_model(&path, TEST_SPEC, TEST_DOWNLOAD, &|progress| {
                second_stages.lock().unwrap().push(progress.stage);
            })
            .unwrap()
        );
        let second_stages = second_stages.into_inner().unwrap();
        assert!(second_stages.contains(&"model-verification-cache-hit"));
        assert!(!second_stages.contains(&"model-verify-progress"));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn changed_model_invalidates_persisted_verification() {
        let root =
            std::env::temp_dir().join(format!("segmentation-verify-test-{}", uuid::Uuid::new_v4()));
        let path = model_path(&root, TEST_SPEC, TEST_DOWNLOAD);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, b"test-model-bytes").unwrap();
        assert!(valid_cached_model(&path, TEST_SPEC, TEST_DOWNLOAD, &|_| {}).unwrap());

        std::thread::sleep(Duration::from_millis(10));
        fs::write(&path, b"changed-content!").unwrap();
        let stages = Mutex::new(Vec::new());
        assert!(
            !valid_cached_model(&path, TEST_SPEC, TEST_DOWNLOAD, &|progress| {
                stages.lock().unwrap().push(progress.stage);
            })
            .unwrap()
        );
        assert!(
            !stages
                .into_inner()
                .unwrap()
                .contains(&"model-verification-cache-hit")
        );

        fs::remove_dir_all(root).unwrap();
    }
}
