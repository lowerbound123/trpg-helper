use std::{
    collections::HashMap,
    fs,
    io::Cursor,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex, OnceLock,
        atomic::{AtomicUsize, Ordering},
    },
    time::Instant,
};

use super::{
    ComputeDevice, SegmentationCoreProgress, SegmentationModelId, device, downloader,
    models::{self, InputNormalization, ModelSpec, OutputTransform},
};
use image::{
    DynamicImage, GenericImageView, ImageDecoder, ImageFormat, ImageReader, RgbaImage,
    imageops::{FilterType, resize},
};
use ndarray::Array4;
use ort::{
    execution_providers::{
        CPUExecutionProvider, CUDAExecutionProvider, DirectMLExecutionProvider, ExecutionProvider,
        ExecutionProviderDispatch,
    },
    session::{Session, builder::GraphOptimizationLevel},
    value::TensorRef,
};

const IMAGE_NET_MEAN: [f32; 3] = [0.485, 0.456, 0.406];
const IMAGE_NET_STD: [f32; 3] = [0.229, 0.224, 0.225];
static ORT_INITIALIZED: OnceLock<Result<(), String>> = OnceLock::new();

#[derive(Debug, Clone)]
pub(crate) struct SegmentationOptions {
    pub(crate) model: SegmentationModelId,
    pub(crate) device: ComputeDevice,
    pub(crate) worker_threads: usize,
    pub(crate) intra_threads: usize,
    pub(crate) inter_threads: usize,
    pub(crate) download_missing_models: bool,
    pub(crate) download_timeout_seconds: u64,
    pub(crate) model_cache_directory: PathBuf,
    pub(crate) legacy_model_path: Option<PathBuf>,
    pub(crate) max_source_dimension: u32,
    pub(crate) max_source_pixels: u64,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct SegmentationOutput {
    pub(crate) png_bytes: Vec<u8>,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) model: String,
    pub(crate) device: String,
    pub(crate) decode_ms: u64,
    pub(crate) preprocess_ms: u64,
    pub(crate) session_load_ms: u64,
    pub(crate) inference_ms: u64,
    pub(crate) postprocess_ms: u64,
}

struct OrtBackend {
    session: Session,
    spec: ModelSpec,
}

enum InferenceBackend {
    Ort(OrtBackend),
    #[cfg(target_os = "macos")]
    CoreMl(super::coreml::NativeCoreMlBackend),
}

impl InferenceBackend {
    fn load(
        runtime_path: &Path,
        model_path: &Path,
        options: &SegmentationOptions,
        spec: ModelSpec,
        device: ComputeDevice,
    ) -> Result<Self, String> {
        #[cfg(target_os = "macos")]
        if device == ComputeDevice::CoreMl {
            return super::coreml::NativeCoreMlBackend::load(model_path, spec).map(Self::CoreMl);
        }
        OrtBackend::load(runtime_path, model_path, options, spec, device).map(Self::Ort)
    }

    fn predict(&mut self, input: &Array4<f32>) -> Result<Vec<f32>, String> {
        match self {
            Self::Ort(backend) => backend.predict(input),
            #[cfg(target_os = "macos")]
            Self::CoreMl(backend) => backend.predict(input),
        }
    }
}

impl OrtBackend {
    fn load(
        runtime_path: &Path,
        model_path: &Path,
        options: &SegmentationOptions,
        spec: ModelSpec,
        device: ComputeDevice,
    ) -> Result<Self, String> {
        ensure_ort_initialized(runtime_path)?;
        let providers = if device == ComputeDevice::Cpu {
            vec![execution_provider(ComputeDevice::Cpu)]
        } else {
            vec![
                execution_provider(device).error_on_failure(),
                execution_provider(ComputeDevice::Cpu),
            ]
        };
        let mut builder = Session::builder()
            .map_err(|error| format!("ORT Session builder 创建失败: {error}"))?
            .with_execution_providers(providers)
            .map_err(|error| format!("ORT execution provider 配置失败: {error}"))?
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(|error| format!("ORT 图优化配置失败: {error}"))?
            .with_inter_threads(options.inter_threads)
            .map_err(|error| format!("ORT inter-op 线程配置失败: {error}"))?;
        if options.intra_threads > 0 {
            builder = builder
                .with_intra_threads(options.intra_threads)
                .map_err(|error| format!("ORT intra-op 线程配置失败: {error}"))?;
        }
        let session = builder
            .commit_from_file(model_path)
            .map_err(|error| format!("{} 模型加载失败: {error}", spec.id.as_str()))?;
        Ok(Self { session, spec })
    }

    fn predict(&mut self, input: &Array4<f32>) -> Result<Vec<f32>, String> {
        let tensor = TensorRef::from_array_view(input.view())
            .map_err(|error| format!("{} 输入 Tensor 创建失败: {error}", self.spec.id.as_str()))?;
        let outputs = self
            .session
            .run(ort::inputs![tensor])
            .map_err(|error| format!("{} 推理失败: {error}", self.spec.id.as_str()))?;
        if self.spec.output_index >= outputs.len() {
            return Err(format!("{} 缺少目标输出 Tensor", self.spec.id.as_str()));
        }
        let (_, values) = outputs[self.spec.output_index]
            .try_extract_tensor::<f32>()
            .map_err(|error| format!("{} 输出 Tensor 类型错误: {error}", self.spec.id.as_str()))?;
        let expected = (self.spec.input_size * self.spec.input_size) as usize;
        if values.len() != expected {
            return Err(format!(
                "{} 输出尺寸错误: 期望 {expected}，实际 {}",
                self.spec.id.as_str(),
                values.len(),
            ));
        }
        Ok(values.to_vec())
    }
}

struct BackendPool {
    backends: Vec<Mutex<InferenceBackend>>,
    next: AtomicUsize,
    device: ComputeDevice,
}

impl BackendPool {
    fn load(
        runtime_path: &Path,
        model_path: &Path,
        options: &SegmentationOptions,
        spec: ModelSpec,
        device: ComputeDevice,
    ) -> Result<Self, String> {
        let mut backends = Vec::with_capacity(options.worker_threads);
        for _ in 0..options.worker_threads {
            backends.push(Mutex::new(InferenceBackend::load(
                runtime_path,
                model_path,
                options,
                spec,
                device,
            )?));
        }
        Ok(Self {
            backends,
            next: AtomicUsize::new(0),
            device,
        })
    }

    fn predict(&self, input: &Array4<f32>) -> Result<Vec<f32>, String> {
        let index = self.next.fetch_add(1, Ordering::Relaxed) % self.backends.len();
        self.backends[index]
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .predict(input)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct BackendKey {
    model: SegmentationModelId,
    device: ComputeDevice,
    worker_threads: usize,
    intra_threads: usize,
    inter_threads: usize,
}

pub(crate) struct ForegroundSegmentationEngine {
    runtime_path: PathBuf,
    backends: Mutex<HashMap<BackendKey, Arc<BackendPool>>>,
    device_probe_lock: Mutex<()>,
}

impl ForegroundSegmentationEngine {
    pub(crate) fn new(runtime_path: PathBuf) -> Self {
        Self {
            runtime_path,
            backends: Mutex::new(HashMap::new()),
            device_probe_lock: Mutex::new(()),
        }
    }

    pub(crate) fn segment_path(
        &self,
        source_path: &Path,
        options: &SegmentationOptions,
        emit: &(dyn Fn(SegmentationCoreProgress) + Sync),
    ) -> Result<SegmentationOutput, String> {
        let requested_model = options.model;
        #[cfg(target_os = "macos")]
        if requested_model == SegmentationModelId::MacosVision && super::vision::is_available() {
            emit(core_progress(
                "vision-inference-start",
                requested_model,
                Some(ComputeDevice::Vision),
            ));
            return super::vision::segment_path(source_path);
        }
        let model = if requested_model == SegmentationModelId::MacosVision {
            SegmentationModelId::BiRefNetGeneral
        } else {
            requested_model
        };
        let spec = models::model_spec(model);

        emit(core_progress("source-decode-start", model, None));
        let started = Instant::now();
        let source_bytes = fs::read(source_path)
            .map_err(|error| format!("读取源图片失败 {}: {error}", source_path.display()))?;
        let image = decode_oriented_image(&source_bytes)?;
        let decode_ms = elapsed_ms(started);
        let (width, height) = image.dimensions();
        let pixels = u64::from(width).saturating_mul(u64::from(height));
        if width.max(height) > options.max_source_dimension || pixels > options.max_source_pixels {
            return Err(format!("图片尺寸超限: {width}x{height}"));
        }
        emit(core_progress_with_elapsed(
            "source-decode-complete",
            model,
            None,
            decode_ms,
        ));

        emit(core_progress("preprocess-start", model, None));
        let started = Instant::now();
        let input = preprocess(&image, spec);
        let preprocess_ms = elapsed_ms(started);
        emit(core_progress_with_elapsed(
            "preprocess-complete",
            model,
            None,
            preprocess_ms,
        ));
        let model_path = match options.legacy_model_path.as_ref() {
            Some(path) if model == SegmentationModelId::BiRefNetGeneral && path.is_file() => {
                path.clone()
            }
            _ => downloader::ensure_model(
                spec,
                &options.model_cache_directory,
                options.download_missing_models,
                options.download_timeout_seconds,
                emit,
            )?
            .ok_or_else(|| format!("{} 不需要 ONNX 模型", model.as_str()))?,
        };
        if !model_path.is_file() {
            return Err("前景分割模型文件缺失".into());
        }

        let selected_device = self.select_compute_device(options, spec, &model_path, emit)?;
        emit(core_progress(
            "session-load-start",
            model,
            Some(selected_device),
        ));
        let started = Instant::now();
        let backend = self
            .get_backend(&model_path, options, spec, selected_device)
            .map_err(|error| {
                emit(SegmentationCoreProgress {
                    stage: "device-session-failed",
                    model: model.as_str().into(),
                    device: Some(selected_device.as_str().into()),
                    completed_bytes: None,
                    total_bytes: None,
                    elapsed_ms: None,
                    error: Some(error.clone()),
                });
                error
            })?;
        let selected_device = backend.device;
        let session_load_ms = elapsed_ms(started);
        emit(core_progress_with_elapsed(
            "session-load-complete",
            model,
            Some(selected_device),
            session_load_ms,
        ));
        emit(core_progress(
            "inference-start",
            model,
            Some(selected_device),
        ));
        let started = Instant::now();
        let prediction = backend.predict(&input)?;
        let inference_ms = elapsed_ms(started);
        emit(core_progress_with_elapsed(
            "inference-complete",
            model,
            Some(selected_device),
            inference_ms,
        ));

        emit(core_progress(
            "postprocess-start",
            model,
            Some(selected_device),
        ));
        let started = Instant::now();
        let mask = normalize_prediction(&prediction, spec, width, height)?;
        let output = apply_soft_mask(&image.to_rgba8(), &mask, width, height)?;
        let mut png_bytes = Vec::new();
        DynamicImage::ImageRgba8(output)
            .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
            .map_err(|error| format!("透明 PNG 编码失败: {error}"))?;
        let postprocess_ms = elapsed_ms(started);
        emit(core_progress_with_elapsed(
            "postprocess-complete",
            model,
            Some(selected_device),
            postprocess_ms,
        ));

        Ok(SegmentationOutput {
            png_bytes,
            width,
            height,
            model: model.as_str().into(),
            device: selected_device.as_str().into(),
            decode_ms,
            preprocess_ms,
            session_load_ms,
            inference_ms,
            postprocess_ms,
        })
    }

    fn get_backend(
        &self,
        model_path: &Path,
        options: &SegmentationOptions,
        spec: ModelSpec,
        device: ComputeDevice,
    ) -> Result<Arc<BackendPool>, String> {
        let key = BackendKey {
            model: spec.id,
            device,
            worker_threads: options.worker_threads,
            intra_threads: options.intra_threads,
            inter_threads: options.inter_threads,
        };
        if let Some(backend) = self
            .backends
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(&key)
            .cloned()
        {
            return Ok(backend);
        }
        let loaded = Arc::new(BackendPool::load(
            &self.runtime_path,
            model_path,
            options,
            spec,
            device,
        )?);
        let mut backends = self
            .backends
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        Ok(backends.entry(key).or_insert_with(|| loaded).clone())
    }

    fn select_compute_device(
        &self,
        options: &SegmentationOptions,
        spec: ModelSpec,
        model_path: &Path,
        emit: &(dyn Fn(SegmentationCoreProgress) + Sync),
    ) -> Result<ComputeDevice, String> {
        let _probe_guard = self
            .device_probe_lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let native_coreml_available = native_coreml_available(model_path, spec)?;
        let candidates = if options.device == ComputeDevice::Auto {
            if cfg!(target_os = "macos") && !native_coreml_available {
                emit(core_progress(
                    "coreml-compilation-required",
                    spec.id,
                    Some(ComputeDevice::Cpu),
                ));
            }
            device::automatic_candidates(native_coreml_available).to_vec()
        } else {
            if options.device == ComputeDevice::CoreMl && !native_coreml_available {
                emit(core_progress(
                    "coreml-compilation-required",
                    spec.id,
                    Some(ComputeDevice::Cpu),
                ));
            }
            vec![options.device, ComputeDevice::Cpu]
        };
        emit(core_progress("device-selection-start", spec.id, None));
        if candidates.contains(&ComputeDevice::CoreMl) && native_coreml_available {
            emit(core_progress(
                "coreml-native-model-ready",
                spec.id,
                Some(ComputeDevice::CoreMl),
            ));
            emit(core_progress(
                "device-available",
                spec.id,
                Some(ComputeDevice::CoreMl),
            ));
            emit(core_progress(
                "device-selected",
                spec.id,
                Some(ComputeDevice::CoreMl),
            ));
            return Ok(ComputeDevice::CoreMl);
        }

        emit(core_progress("runtime-initialization-start", spec.id, None));
        if !self.runtime_path.is_file() {
            return Err("ONNX Runtime 文件缺失，无法回退 CPU".into());
        }
        ensure_ort_initialized(&self.runtime_path)?;
        emit(core_progress(
            "runtime-initialization-complete",
            spec.id,
            None,
        ));
        let selected = candidates
            .into_iter()
            .filter(|candidate| *candidate != ComputeDevice::CoreMl)
            .find(|candidate| {
                let available = execution_provider_available(*candidate);
                emit(SegmentationCoreProgress {
                    stage: if available {
                        "device-available"
                    } else {
                        "device-unavailable"
                    },
                    model: spec.id.as_str().into(),
                    device: Some(candidate.as_str().into()),
                    completed_bytes: None,
                    total_bytes: None,
                    elapsed_ms: None,
                    error: None,
                });
                available
            })
            .unwrap_or(ComputeDevice::Cpu);
        if options.device == ComputeDevice::CoreMl && selected == ComputeDevice::Cpu {
            emit(SegmentationCoreProgress {
                stage: "device-fallback-cpu",
                model: spec.id.as_str().into(),
                device: Some(ComputeDevice::CoreMl.as_str().into()),
                completed_bytes: None,
                total_bytes: None,
                elapsed_ms: None,
                error: Some(format!(
                    "未找到有效的单一 CoreML 模型: {}",
                    native_coreml_artifact_path(model_path).display()
                )),
            });
        }
        emit(core_progress("device-selected", spec.id, Some(selected)));
        Ok(selected)
    }
}

fn core_progress(
    stage: &'static str,
    model: SegmentationModelId,
    device: Option<ComputeDevice>,
) -> SegmentationCoreProgress {
    SegmentationCoreProgress {
        stage,
        model: model.as_str().into(),
        device: device.map(|value| value.as_str().into()),
        completed_bytes: None,
        total_bytes: None,
        elapsed_ms: None,
        error: None,
    }
}

fn core_progress_with_elapsed(
    stage: &'static str,
    model: SegmentationModelId,
    device: Option<ComputeDevice>,
    elapsed_ms: u64,
) -> SegmentationCoreProgress {
    SegmentationCoreProgress {
        elapsed_ms: Some(elapsed_ms),
        ..core_progress(stage, model, device)
    }
}

fn ensure_ort_initialized(runtime_path: &Path) -> Result<(), String> {
    ORT_INITIALIZED
        .get_or_init(|| {
            ort::init_from(runtime_path.to_string_lossy())
                .with_name("handout-generator-foreground-segmentation")
                .commit()
                .map(|_| ())
                .map_err(|error| format!("ONNX Runtime 初始化失败: {error}"))
        })
        .clone()
}

fn execution_provider(device: ComputeDevice) -> ExecutionProviderDispatch {
    match device {
        ComputeDevice::DirectMl => DirectMLExecutionProvider::default()
            .with_device_id(0)
            .build(),
        ComputeDevice::Cuda => CUDAExecutionProvider::default().with_device_id(0).build(),
        _ => CPUExecutionProvider::default().build(),
    }
}

fn execution_provider_available(device: ComputeDevice) -> bool {
    match device {
        ComputeDevice::CoreMl => false,
        ComputeDevice::DirectMl => DirectMLExecutionProvider::default()
            .is_available()
            .unwrap_or(false),
        ComputeDevice::Cuda => CUDAExecutionProvider::default()
            .is_available()
            .unwrap_or(false),
        ComputeDevice::Cpu => true,
        _ => false,
    }
}

#[cfg(target_os = "macos")]
fn native_coreml_available(model_path: &Path, spec: ModelSpec) -> Result<bool, String> {
    Ok(super::coreml::resolve_artifact(model_path, spec)?.is_some())
}

#[cfg(target_os = "macos")]
fn native_coreml_artifact_path(model_path: &Path) -> PathBuf {
    super::coreml::artifact_directory(model_path).join("model.mlmodelc")
}

#[cfg(not(target_os = "macos"))]
fn native_coreml_available(_model_path: &Path, _spec: ModelSpec) -> Result<bool, String> {
    Ok(false)
}

#[cfg(not(target_os = "macos"))]
fn native_coreml_artifact_path(_model_path: &Path) -> PathBuf {
    PathBuf::from("native CoreML is unavailable on this platform")
}

fn decode_oriented_image(bytes: &[u8]) -> Result<DynamicImage, String> {
    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| format!("图片格式识别失败: {error}"))?;
    let mut decoder = reader
        .into_decoder()
        .map_err(|error| format!("图片解码器创建失败: {error}"))?;
    let orientation = decoder
        .orientation()
        .unwrap_or(image::metadata::Orientation::NoTransforms);
    let mut image =
        DynamicImage::from_decoder(decoder).map_err(|error| format!("图片解码失败: {error}"))?;
    image.apply_orientation(orientation);
    Ok(image)
}

fn preprocess(image: &DynamicImage, spec: ModelSpec) -> Array4<f32> {
    let model_size = spec.input_size;
    let rgb = image
        .resize_exact(model_size, model_size, FilterType::Lanczos3)
        .to_rgb8();
    let mut input = Array4::<f32>::zeros((1, 3, model_size as usize, model_size as usize));
    for (x, y, pixel) in rgb.enumerate_pixels() {
        for channel in 0..3 {
            let value = f32::from(pixel.0[channel]) / 255.0;
            input[[0, channel, y as usize, x as usize]] = match spec.normalization {
                InputNormalization::ImageNet => {
                    (value - IMAGE_NET_MEAN[channel]) / IMAGE_NET_STD[channel]
                }
                InputNormalization::Unit => value,
            };
        }
    }
    input
}

fn normalize_prediction(
    values: &[f32],
    spec: ModelSpec,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, String> {
    let model_size = spec.input_size;
    if values.len() != (model_size * model_size) as usize {
        return Err(format!("{} 输出像素数错误", spec.id.as_str()));
    }
    let probabilities = match spec.output_transform {
        OutputTransform::SigmoidMinMax => values
            .iter()
            .map(|value| 1.0 / (1.0 + (-value).exp()))
            .collect::<Vec<_>>(),
        OutputTransform::MinMax => values.to_vec(),
    };
    let min = probabilities.iter().copied().fold(f32::INFINITY, f32::min);
    let max = probabilities
        .iter()
        .copied()
        .fold(f32::NEG_INFINITY, f32::max);
    let range = (max - min).max(f32::EPSILON);
    let pixels = probabilities
        .into_iter()
        .map(|value| (((value - min) / range) * 255.0).round() as u8)
        .collect::<Vec<_>>();
    let mask = image::GrayImage::from_raw(model_size, model_size, pixels)
        .ok_or_else(|| format!("{} mask 创建失败", spec.id.as_str()))?;
    Ok(resize(&mask, width, height, FilterType::Lanczos3).into_raw())
}

pub(crate) fn apply_soft_mask(
    source: &RgbaImage,
    mask: &[u8],
    width: u32,
    height: u32,
) -> Result<RgbaImage, String> {
    if source.width() != width
        || source.height() != height
        || mask.len() != (width as usize).saturating_mul(height as usize)
    {
        return Err("前景 mask 尺寸与原图不匹配".into());
    }
    let mut output = source.clone();
    for (pixel, mask_alpha) in output.pixels_mut().zip(mask.iter().copied()) {
        pixel.0[3] = ((u16::from(pixel.0[3]) * u16::from(mask_alpha) + 127) / 255) as u8;
    }
    Ok(output)
}

fn elapsed_ms(started: Instant) -> u64 {
    started.elapsed().as_millis().try_into().unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use image::{Rgba, RgbaImage};

    use super::*;

    #[test]
    fn soft_mask_multiplies_existing_alpha_and_preserves_rgb() {
        let source = RgbaImage::from_pixel(1, 1, Rgba([10, 20, 30, 128]));
        let output = apply_soft_mask(&source, &[128], 1, 1).unwrap();
        assert_eq!(output.get_pixel(0, 0).0, [10, 20, 30, 64]);
    }

    #[test]
    fn model_normalization_modes_are_distinct() {
        let image =
            DynamicImage::ImageRgb8(image::RgbImage::from_pixel(1, 1, image::Rgb([255, 0, 0])));
        let biref = preprocess(
            &image,
            models::model_spec(SegmentationModelId::BiRefNetGeneral),
        );
        let ben2 = preprocess(&image, models::model_spec(SegmentationModelId::Ben2));
        assert!(biref[[0, 0, 0, 0]] > 2.0);
        assert_eq!(ben2[[0, 0, 0, 0]], 1.0);
    }

    #[test]
    #[ignore = "requires the packaged ONNX Runtime and a downloaded model"]
    fn real_birefnet_smoke_segments_a_generated_image() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let target = env!("TAURI_ENV_TARGET_TRIPLE");
        let runtime_file = if target.contains("windows") {
            "onnxruntime.dll"
        } else if target.contains("apple") {
            "libonnxruntime.1.22.0.dylib"
        } else {
            "libonnxruntime.so.1.22.0"
        };
        let runtime_path = manifest
            .join("resources/onnxruntime")
            .join(target)
            .join(runtime_file);
        let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
            .map(PathBuf::from)
            .expect("HOME/USERPROFILE is required for the real smoke test");
        let model_cache_directory =
            home.join("Documents/trpg-helper/models/foreground-segmentation");
        let requested_device = std::env::var("SEGMENTATION_SMOKE_DEVICE")
            .ok()
            .map(|value| ComputeDevice::parse(&value))
            .unwrap_or(ComputeDevice::Cpu);
        eprintln!(
            "segmentation smoke machine: os={}, arch={}, target={}, requested_device={}, candidates={:?}",
            std::env::consts::OS,
            std::env::consts::ARCH,
            target,
            requested_device.as_str(),
            device::automatic_candidates(
                native_coreml_available(
                    &model_cache_directory
                        .join("birefnet-general/epoch-244/BiRefNet-general-epoch_244.onnx"),
                    models::model_spec(SegmentationModelId::BiRefNetGeneral),
                )
                .unwrap_or(false)
            ),
        );

        let output_root = std::env::temp_dir().join("handout-generator-segmentation-smoke");
        fs::create_dir_all(&output_root).unwrap();
        let input_path = output_root.join("generated-input.png");
        let output_path = output_root.join("segmented-output.png");
        let generated = RgbaImage::from_fn(256, 256, |x, y| {
            let dx = i64::from(x) - 128;
            let dy = i64::from(y) - 128;
            if dx * dx + dy * dy < 72 * 72 {
                Rgba([235, 185, 70, 255])
            } else {
                Rgba([25, 35, 55, 255])
            }
        });
        generated.save(&input_path).unwrap();

        let options = SegmentationOptions {
            model: SegmentationModelId::BiRefNetGeneral,
            device: requested_device,
            worker_threads: 1,
            intra_threads: 0,
            inter_threads: 1,
            download_missing_models: false,
            download_timeout_seconds: 1,
            model_cache_directory,
            legacy_model_path: None,
            max_source_dimension: 16_384,
            max_source_pixels: 67_108_864,
        };
        let engine = ForegroundSegmentationEngine::new(runtime_path);
        let output = engine
            .segment_path(&input_path, &options, &|progress| {
                eprintln!(
                    "segmentation smoke stage={} model={} device={} elapsed_ms={}",
                    progress.stage,
                    progress.model,
                    progress.device.as_deref().unwrap_or("-"),
                    progress.elapsed_ms.unwrap_or_default(),
                );
                if let Some(error) = progress.error.as_deref() {
                    eprintln!("segmentation smoke error={error}");
                }
            })
            .unwrap();
        fs::write(&output_path, &output.png_bytes).unwrap();
        let decoded = image::load_from_memory(&output.png_bytes).unwrap();
        assert_eq!(decoded.dimensions(), (256, 256));
        assert!(!output.png_bytes.is_empty());
        eprintln!(
            "segmentation smoke complete: device={}, session_load_ms={}, inference_ms={}, output={}",
            output.device,
            output.session_load_ms,
            output.inference_ms,
            output_path.display(),
        );
        if let Some(marker) = std::env::var_os("SEGMENTATION_SMOKE_SUCCESS_MARKER") {
            fs::write(
                marker,
                format!(
                    "device={}\nsession_load_ms={}\ninference_ms={}\noutput={}\n",
                    output.device,
                    output.session_load_ms,
                    output.inference_ms,
                    output_path.display(),
                ),
            )
            .unwrap();
        }
    }
}
