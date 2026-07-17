#[cfg(target_os = "macos")]
mod coreml;
mod device;
mod downloader;
mod engine;
mod models;
#[cfg(target_os = "macos")]
mod vision;

pub(crate) use device::ComputeDevice;
pub(crate) use engine::{ForegroundSegmentationEngine, SegmentationOptions, SegmentationOutput};
pub(crate) use models::SegmentationModelId;

#[derive(Debug, Clone)]
pub(crate) struct SegmentationCoreProgress {
    pub(crate) stage: &'static str,
    pub(crate) model: String,
    pub(crate) device: Option<String>,
    pub(crate) completed_bytes: Option<u64>,
    pub(crate) total_bytes: Option<u64>,
    pub(crate) elapsed_ms: Option<u64>,
    pub(crate) error: Option<String>,
}

use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex, OnceLock,
        atomic::{AtomicUsize, Ordering},
    },
    time::Instant,
};

use chrono::Utc;
use rayon::prelude::*;
use tauri::{AppHandle, Manager, ipc::Channel, path::BaseDirectory};
use uuid::Uuid;

use crate::{
    CommandResult,
    services::{
        asset_service::{lock_library_mutation, read_index, write_index},
        path_service::{
            clean_file_name, library_root, project_root, remove_file_if_exists, write_debug_log,
        },
        preview_service::write_webp_thumbnail,
    },
    token::configuration::active_configuration,
    types::{
        ForegroundSegmentationBatchResult, ForegroundSegmentationItemResult,
        ForegroundSegmentationProgress, ForegroundSegmentationRequest,
        ForegroundSegmentationResult, ForegroundSegmentationTimings, LibraryRecord,
    },
};

struct LazyBackend<T> {
    value: OnceLock<T>,
    initialize_lock: Mutex<()>,
}

impl<T> Default for LazyBackend<T> {
    fn default() -> Self {
        Self {
            value: OnceLock::new(),
            initialize_lock: Mutex::new(()),
        }
    }
}

impl<T> LazyBackend<T> {
    fn get_or_init(&self, initialize: impl FnOnce() -> Result<T, String>) -> Result<&T, String> {
        if let Some(value) = self.value.get() {
            return Ok(value);
        }
        let _guard = self
            .initialize_lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(value) = self.value.get() {
            return Ok(value);
        }
        let value = initialize()?;
        let _ = self.value.set(value);
        Ok(self.value.get().expect("successful backend initialization"))
    }
}

#[derive(Clone)]
pub(crate) struct ForegroundSegmentationService {
    engine: Arc<LazyBackend<ForegroundSegmentationEngine>>,
}

impl Default for ForegroundSegmentationService {
    fn default() -> Self {
        Self {
            engine: Arc::new(LazyBackend::default()),
        }
    }
}

struct PreparedSegmentation {
    asset_id: String,
    source_record: LibraryRecord,
    output_bytes: Vec<u8>,
    model: String,
    device: String,
    timings: ForegroundSegmentationTimings,
}

pub(crate) fn runtime_resource_for_target(target: &str) -> Result<&'static str, String> {
    match target {
        "aarch64-apple-darwin" => {
            Ok("resources/onnxruntime/aarch64-apple-darwin/libonnxruntime.1.22.0.dylib")
        }
        "x86_64-pc-windows-msvc" => {
            Ok("resources/onnxruntime/x86_64-pc-windows-msvc/onnxruntime.dll")
        }
        "x86_64-unknown-linux-gnu" => {
            Ok("resources/onnxruntime/x86_64-unknown-linux-gnu/libonnxruntime.so.1.22.0")
        }
        value => Err(format!("当前构建目标不支持前景分割: {value}")),
    }
}

fn next_output_name(
    source_name: &str,
    suffix: &str,
    mut exists: impl FnMut(&str) -> bool,
) -> String {
    let stem = Path::new(source_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let first = format!("{stem}{suffix}.png");
    if !exists(&first) {
        return first;
    }
    for index in 2.. {
        let candidate = format!("{stem}{suffix}-{index}.png");
        if !exists(&candidate) {
            return candidate;
        }
    }
    unreachable!()
}

fn validate_source_path(
    app: &AppHandle,
    record: &LibraryRecord,
    source_path: &str,
) -> Result<PathBuf, String> {
    if record.path != source_path {
        return Err("Asset 路径与 Library index 记录不一致".into());
    }
    let assets_root = library_root(app)
        .map_err(String::from)?
        .join("assets")
        .canonicalize()
        .map_err(|error| format!("Assets 根目录解析失败: {error}"))?;
    let canonical = Path::new(source_path)
        .canonicalize()
        .map_err(|error| format!("Asset 文件路径解析失败: {error}"))?;
    if !canonical.starts_with(&assets_root) || !canonical.is_file() {
        return Err("Asset 文件不在受管理的 Assets 目录内".into());
    }
    Ok(canonical)
}

fn elapsed_ms(started: Instant) -> u64 {
    started.elapsed().as_millis().try_into().unwrap_or(u64::MAX)
}

fn batch_progress(phase: &str, stage: &str, total: usize) -> ForegroundSegmentationProgress {
    ForegroundSegmentationProgress {
        phase: phase.into(),
        stage: stage.into(),
        current: 0,
        total,
        asset_id: None,
        success_count: 0,
        failure_count: 0,
        model: None,
        device: None,
        completed_bytes: None,
        total_bytes: None,
        elapsed_ms: None,
        error: None,
    }
}

impl ForegroundSegmentationService {
    fn prepare(
        &self,
        app: &AppHandle,
        source_record: LibraryRecord,
        source_path: &str,
        emit: &(dyn Fn(SegmentationCoreProgress) + Sync),
    ) -> Result<PreparedSegmentation, String> {
        let config = &active_configuration().foreground_segmentation;
        if !config.enabled {
            return Err("前景分割已在配置中禁用".into());
        }
        if !source_record.media_type.starts_with("image/") {
            return Err("前景分割只支持图片 Asset".into());
        }
        let canonical_source = validate_source_path(app, &source_record, source_path)?;
        let runtime_resource = runtime_resource_for_target(env!("TAURI_ENV_TARGET_TRIPLE"))?;
        let runtime_path = app
            .path()
            .resolve(runtime_resource, BaseDirectory::Resource)
            .map_err(|error| format!("ONNX Runtime resource 解析失败: {error}"))?;
        let legacy_model_path = config.model_resource.as_deref().and_then(|resource| {
            app.path()
                .resolve(resource, BaseDirectory::Resource)
                .ok()
                .filter(|path| path.is_file())
        });
        let options = SegmentationOptions {
            model: SegmentationModelId::parse(config.resolved_model()),
            device: ComputeDevice::parse(config.resolved_device()),
            worker_threads: config.worker_threads,
            intra_threads: config.intra_threads,
            inter_threads: config.inter_threads,
            download_missing_models: config.download_missing_models,
            download_timeout_seconds: config.download_timeout_seconds,
            model_cache_directory: project_root()
                .map_err(String::from)?
                .join(&config.model_cache_directory),
            legacy_model_path,
            max_source_dimension: config.max_source_dimension,
            max_source_pixels: config.max_source_pixels,
        };
        let engine = self
            .engine
            .get_or_init(|| Ok(ForegroundSegmentationEngine::new(runtime_path)))?;
        let output: SegmentationOutput = engine.segment_path(&canonical_source, &options, emit)?;
        let core_event = serde_json::json!({
            "timestamp": Utc::now().to_rfc3339(),
            "scope": "segmentation",
            "message": "foreground-core-complete",
            "data": {
                "assetId": &source_record.id,
                "model": &output.model,
                "device": &output.device,
                "width": output.width,
                "height": output.height
            }
        });
        let _ = write_debug_log("segmentation", &core_event.to_string());

        Ok(PreparedSegmentation {
            asset_id: source_record.id.clone(),
            source_record,
            output_bytes: output.png_bytes,
            model: output.model,
            device: output.device,
            timings: ForegroundSegmentationTimings {
                session_load_ms: output.session_load_ms,
                decode_ms: output.decode_ms,
                preprocess_ms: output.preprocess_ms,
                inference_ms: output.inference_ms,
                postprocess_ms: output.postprocess_ms,
                ..ForegroundSegmentationTimings::default()
            },
        })
    }

    fn commit_prepared(
        &self,
        app: &AppHandle,
        prepared: Vec<(
            ForegroundSegmentationRequest,
            Result<PreparedSegmentation, String>,
        )>,
    ) -> Result<ForegroundSegmentationBatchResult, String> {
        let config = &active_configuration().foreground_segmentation;
        let _guard = lock_library_mutation();
        let mut index = read_index(app).map_err(String::from)?;
        let original_index = index.clone();
        let mut created_paths = Vec::<(PathBuf, PathBuf)>::new();
        let mut results = Vec::with_capacity(prepared.len());

        for (request, prepared_result) in prepared {
            let mut prepared = match prepared_result {
                Ok(prepared) => prepared,
                Err(error) => {
                    results.push(ForegroundSegmentationItemResult {
                        asset_id: request.asset_id,
                        success: false,
                        record: None,
                        error: Some(error),
                        model: String::new(),
                        device: String::new(),
                        timings: ForegroundSegmentationTimings::default(),
                    });
                    continue;
                }
            };
            let source_is_current = index.assets.iter().any(|record| {
                record.id == prepared.asset_id && record.path == prepared.source_record.path
            });
            if !source_is_current {
                results.push(ForegroundSegmentationItemResult {
                    asset_id: prepared.asset_id,
                    success: false,
                    record: None,
                    error: Some("分割期间源 Asset 已被删除或修改".into()),
                    model: prepared.model.clone(),
                    device: prepared.device.clone(),
                    timings: prepared.timings,
                });
                continue;
            }

            let output_name = next_output_name(
                &prepared.source_record.name,
                &config.output_suffix,
                |name| {
                    index.assets.iter().any(|record| {
                        record.folder == prepared.source_record.folder && record.name == name
                    })
                },
            );
            let id = Uuid::new_v4().to_string();
            let file_name = format!("{id}-{}", clean_file_name(&output_name));
            let output_path = library_root(app)
                .map_err(String::from)?
                .join("assets")
                .join(&file_name);
            let started = Instant::now();
            if let Err(error) = fs::write(&output_path, &prepared.output_bytes) {
                results.push(ForegroundSegmentationItemResult {
                    asset_id: prepared.asset_id,
                    success: false,
                    record: None,
                    error: Some(format!("分割结果写入失败: {error}")),
                    model: prepared.model.clone(),
                    device: prepared.device.clone(),
                    timings: prepared.timings,
                });
                continue;
            }
            prepared.timings.write_ms = elapsed_ms(started);
            let started = Instant::now();
            let thumbnail_path = match write_webp_thumbnail(app, &id, &prepared.output_bytes) {
                Ok(path) => path,
                Err(error) => {
                    let _ = remove_file_if_exists(&output_path);
                    results.push(ForegroundSegmentationItemResult {
                        asset_id: prepared.asset_id,
                        success: false,
                        record: None,
                        error: Some(format!("分割结果缩略图生成失败: {error}")),
                        model: prepared.model.clone(),
                        device: prepared.device.clone(),
                        timings: prepared.timings,
                    });
                    continue;
                }
            };
            prepared.timings.thumbnail_ms = elapsed_ms(started);
            let now = Utc::now();
            let record = LibraryRecord {
                id,
                name: output_name,
                file_name,
                path: output_path.to_string_lossy().to_string(),
                thumbnail_path: Some(thumbnail_path.to_string_lossy().to_string()),
                font_family: None,
                tags: prepared.source_record.tags.clone(),
                folder: prepared.source_record.folder.clone(),
                media_type: "image/png".into(),
                created_at: now,
                updated_at: now,
                token_ring: None,
                token_background: None,
            };
            created_paths.push((output_path, thumbnail_path));
            index.assets.push(record.clone());
            results.push(ForegroundSegmentationItemResult {
                asset_id: prepared.asset_id,
                success: true,
                record: Some(record),
                error: None,
                model: prepared.model,
                device: prepared.device,
                timings: prepared.timings,
            });
        }

        if created_paths.is_empty() {
            return Ok(ForegroundSegmentationBatchResult {
                results,
                library: index,
            });
        }

        let started = Instant::now();
        if let Err(error) = write_index(app, &index) {
            for (output_path, thumbnail_path) in &created_paths {
                let _ = remove_file_if_exists(output_path);
                let _ = remove_file_if_exists(thumbnail_path);
            }
            for result in &mut results {
                if result.success {
                    result.success = false;
                    result.record = None;
                    result.error = Some(format!("Library index 写入失败: {error}"));
                }
            }
            return Ok(ForegroundSegmentationBatchResult {
                results,
                library: original_index,
            });
        }
        let index_write_ms = elapsed_ms(started);
        for result in &mut results {
            if result.success {
                result.timings.index_write_ms = index_write_ms;
                let event = serde_json::json!({
                    "timestamp": Utc::now().to_rfc3339(),
                    "scope": "segmentation",
                    "message": "foreground-segmentation-complete",
                    "data": {
                        "device": result.device,
                        "model": result.model,
                        "target": env!("TAURI_ENV_TARGET_TRIPLE"),
                        "assetId": result.asset_id,
                        "outputPath": result.record.as_ref().map(|record| &record.path)
                    }
                });
                let _ = write_debug_log("segmentation", &event.to_string());
                let speed = serde_json::json!({
                    "timestamp": Utc::now().to_rfc3339(),
                    "scope": "speed",
                    "message": "foreground-segmentation",
                    "data": &result.timings
                });
                let _ = write_debug_log("speed", &speed.to_string());
            }
        }
        Ok(ForegroundSegmentationBatchResult {
            results,
            library: index,
        })
    }

    fn segment_batch(
        &self,
        app: &AppHandle,
        requests: Vec<ForegroundSegmentationRequest>,
        emit: impl Fn(ForegroundSegmentationProgress) + Sync,
    ) -> Result<ForegroundSegmentationBatchResult, String> {
        let config = &active_configuration().foreground_segmentation;
        if !config.enabled {
            return Err("前景分割已在配置中禁用".into());
        }
        let total = requests.len();
        emit(batch_progress("preparing", "batch-preparing", total));
        let index = read_index(app).map_err(String::from)?;
        let mut seen_asset_ids = HashSet::new();
        let source_records = requests
            .iter()
            .map(|request| {
                if !seen_asset_ids.insert(request.asset_id.clone()) {
                    return Err("同一批次不能重复分割同一个 Asset".to_string());
                }
                index
                    .assets
                    .iter()
                    .find(|record| record.id == request.asset_id)
                    .cloned()
                    .ok_or_else(|| "Library index 中不存在该 Asset".to_string())
            })
            .collect::<Vec<_>>();
        emit(batch_progress(
            "preparing",
            "source-validation-complete",
            total,
        ));
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(config.worker_threads)
            .build()
            .map_err(|error| format!("前景分割 worker pool 创建失败: {error}"))?;
        let completed = AtomicUsize::new(0);
        let succeeded = AtomicUsize::new(0);
        let failed = AtomicUsize::new(0);
        let prepared = pool.install(|| {
            requests
                .par_iter()
                .zip(source_records.into_par_iter())
                .map(|(request, source_record)| {
                    let emit_core = |core: SegmentationCoreProgress| {
                        let phase = match core.stage {
                            stage if stage.starts_with("model-") => "downloading",
                            "device-selection-start"
                            | "device-available"
                            | "device-unavailable"
                            | "device-selected"
                            | "device-cache-hit"
                            | "device-fallback-cpu" => "probing",
                            _ => "processing",
                        };
                        let mut progress = batch_progress(phase, core.stage, total);
                        progress.current = completed.load(Ordering::Relaxed);
                        progress.asset_id = Some(request.asset_id.clone());
                        progress.success_count = succeeded.load(Ordering::Relaxed);
                        progress.failure_count = failed.load(Ordering::Relaxed);
                        progress.model = Some(core.model.clone());
                        progress.device = core.device.clone();
                        progress.completed_bytes = core.completed_bytes;
                        progress.total_bytes = core.total_bytes;
                        progress.elapsed_ms = core.elapsed_ms;
                        progress.error = core.error.clone();
                        let event = serde_json::json!({
                            "timestamp": Utc::now().to_rfc3339(),
                            "scope": "segmentation",
                            "message": core.stage,
                            "data": {
                                "assetId": request.asset_id,
                                "model": core.model,
                                "device": core.device,
                                "completedBytes": core.completed_bytes,
                                "totalBytes": core.total_bytes,
                                "elapsedMs": core.elapsed_ms
                                ,"error": core.error
                            }
                        });
                        let _ = write_debug_log("segmentation", &event.to_string());
                        emit(progress);
                    };
                    let result = source_record.and_then(|record| {
                        self.prepare(app, record, &request.source_path, &emit_core)
                    });
                    if result.is_ok() {
                        succeeded.fetch_add(1, Ordering::Relaxed);
                    } else {
                        failed.fetch_add(1, Ordering::Relaxed);
                    }
                    let current = completed.fetch_add(1, Ordering::Relaxed) + 1;
                    let mut progress = batch_progress(
                        "processing",
                        if result.is_ok() {
                            "item-processing-complete"
                        } else {
                            "item-processing-failed"
                        },
                        total,
                    );
                    progress.current = current;
                    progress.asset_id = Some(request.asset_id.clone());
                    progress.success_count = succeeded.load(Ordering::Relaxed);
                    progress.failure_count = failed.load(Ordering::Relaxed);
                    progress.error = result.as_ref().err().cloned();
                    if let Some(error) = progress.error.as_ref() {
                        let event = serde_json::json!({
                            "timestamp": Utc::now().to_rfc3339(),
                            "scope": "segmentation",
                            "message": "item-processing-failed",
                            "data": { "assetId": request.asset_id, "error": error }
                        });
                        let _ = write_debug_log("segmentation", &event.to_string());
                    }
                    emit(progress);
                    (request.clone(), result)
                })
                .collect::<Vec<_>>()
        });
        let prepare_failures = failed.load(Ordering::Relaxed);
        let mut writing = batch_progress("writing", "library-write-start", total);
        writing.current = total;
        writing.success_count = total.saturating_sub(prepare_failures);
        writing.failure_count = prepare_failures;
        emit(writing);
        let result = self.commit_prepared(app, prepared)?;
        let success_count = result
            .results
            .iter()
            .filter(|result| result.success)
            .count();
        let mut finished = batch_progress("finished", "batch-finished", total);
        finished.current = total;
        finished.success_count = success_count;
        finished.failure_count = total.saturating_sub(success_count);
        emit(finished);
        Ok(result)
    }

    fn segment(
        &self,
        app: &AppHandle,
        asset_id: &str,
        source_path: &str,
    ) -> Result<ForegroundSegmentationResult, String> {
        let batch = self.segment_batch(
            app,
            vec![ForegroundSegmentationRequest {
                asset_id: asset_id.into(),
                source_path: source_path.into(),
            }],
            |_| {},
        )?;
        let item = batch
            .results
            .into_iter()
            .next()
            .ok_or_else(|| "前景分割未返回结果".to_string())?;
        if !item.success {
            return Err(item.error.unwrap_or_else(|| "前景分割失败".into()));
        }
        Ok(ForegroundSegmentationResult {
            record: item
                .record
                .ok_or_else(|| "前景分割结果缺少 Asset".to_string())?,
            library: batch.library,
            timings: item.timings,
        })
    }
}

#[tauri::command]
pub(crate) async fn segment_asset_foreground(
    app: AppHandle,
    state: tauri::State<'_, ForegroundSegmentationService>,
    asset_id: String,
    source_path: String,
) -> CommandResult<ForegroundSegmentationResult> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.segment(&app, &asset_id, &source_path))
        .await
        .map_err(|error| format!("前景分割后台任务失败: {error}"))?
}

#[tauri::command]
pub(crate) async fn segment_assets_foreground(
    app: AppHandle,
    state: tauri::State<'_, ForegroundSegmentationService>,
    requests: Vec<ForegroundSegmentationRequest>,
    on_progress: Channel<ForegroundSegmentationProgress>,
) -> CommandResult<ForegroundSegmentationBatchResult> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        service.segment_batch(&app, requests, |event| {
            let _ = on_progress.send(event);
        })
    })
    .await
    .map_err(|error| format!("批量前景分割后台任务失败: {error}"))?
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;

    #[test]
    fn model_registry_exposes_all_supported_models() {
        assert_eq!(
            models::model_spec(SegmentationModelId::BiRefNetGeneral).input_size,
            1024
        );
        assert_eq!(
            models::model_spec(SegmentationModelId::U2Net).input_size,
            320
        );
        assert_eq!(
            models::model_spec(SegmentationModelId::Ben2).input_size,
            1024
        );
        assert!(
            models::model_spec(SegmentationModelId::MacosVision)
                .download
                .is_none()
        );
    }

    #[test]
    fn automatic_device_order_uses_only_precompiled_coreml() {
        let candidates = device::automatic_candidates(false);
        assert_eq!(candidates.last(), Some(&ComputeDevice::Cpu));
        #[cfg(target_os = "macos")]
        assert_eq!(candidates, &[ComputeDevice::Cpu]);
        #[cfg(any(target_os = "windows", target_os = "linux"))]
        assert_eq!(candidates.first(), Some(&ComputeDevice::Cuda));

        #[cfg(target_os = "macos")]
        assert_eq!(
            device::automatic_candidates(true),
            &[ComputeDevice::CoreMl, ComputeDevice::Cpu]
        );
    }

    #[test]
    fn invalid_model_ids_fall_back_to_birefnet() {
        assert_eq!(
            SegmentationModelId::parse("unknown"),
            SegmentationModelId::BiRefNetGeneral
        );
    }

    #[test]
    fn output_name_avoids_asset_name_collisions() {
        let existing = ["portrait-foreground.png", "portrait-foreground-2.png"];
        assert_eq!(
            next_output_name("portrait.jpg", "-foreground", |name| existing
                .contains(&name)),
            "portrait-foreground-3.png"
        );
    }

    #[test]
    fn lazy_backend_initializes_only_once() {
        let lazy = LazyBackend::default();
        let calls = AtomicUsize::new(0);
        for _ in 0..2 {
            let backend = lazy
                .get_or_init(|| {
                    calls.fetch_add(1, Ordering::SeqCst);
                    Ok::<_, String>(7usize)
                })
                .unwrap();
            assert_eq!(*backend, 7);
        }
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn lazy_backend_retries_after_initialization_failure() {
        let lazy = LazyBackend::default();
        assert_eq!(
            lazy.get_or_init(|| Err::<usize, _>("missing".into()))
                .unwrap_err(),
            "missing"
        );
        let backend = lazy.get_or_init(|| Ok::<_, String>(9usize)).unwrap();
        assert_eq!(*backend, 9);
    }

    #[test]
    fn runtime_resource_map_rejects_unsupported_targets() {
        assert!(
            runtime_resource_for_target("aarch64-apple-darwin")
                .unwrap()
                .ends_with(".dylib")
        );
        assert!(
            runtime_resource_for_target("x86_64-pc-windows-msvc")
                .unwrap()
                .ends_with(".dll")
        );
        assert!(
            runtime_resource_for_target("x86_64-unknown-linux-gnu")
                .unwrap()
                .contains(".so")
        );
        assert!(runtime_resource_for_target("x86_64-apple-darwin").is_err());
    }
}
