use std::{
    cell::RefCell,
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    ptr,
};

use ndarray::Array4;
use objc2::{
    AnyThread,
    rc::autoreleasepool,
    runtime::{AnyObject, ProtocolObject},
};
use objc2_core_ml::{
    MLComputeUnits, MLDictionaryFeatureProvider, MLFeatureProvider, MLFeatureValue, MLModel,
    MLModelConfiguration, MLMultiArray, MLMultiArrayDataType,
};
use objc2_foundation::{NSArray, NSCopying, NSDictionary, NSNumber, NSString, NSURL};
use serde::{Deserialize, Serialize};

use super::models::ModelSpec;

const MANIFEST_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeCoreMlManifest {
    pub(crate) schema_version: u32,
    pub(crate) model_id: String,
    pub(crate) revision: String,
    pub(crate) reference_onnx_sha256: String,
    pub(crate) input_name: String,
    pub(crate) output_name: String,
    pub(crate) input_size: u32,
}

#[derive(Debug, Clone)]
pub(crate) struct NativeCoreMlArtifact {
    pub(crate) compiled_model_path: PathBuf,
    pub(crate) manifest: NativeCoreMlManifest,
}

#[derive(Debug, Clone)]
pub(crate) struct NativeCoreMlBackend {
    artifact: NativeCoreMlArtifact,
    spec: ModelSpec,
}

thread_local! {
    static MODELS: RefCell<HashMap<PathBuf, objc2::rc::Retained<MLModel>>> = RefCell::new(HashMap::new());
}

impl NativeCoreMlBackend {
    pub(crate) fn load(model_path: &Path, spec: ModelSpec) -> Result<Self, String> {
        let artifact = resolve_artifact(model_path, spec)?
            .ok_or_else(|| format!("{} 尚未生成单一 CoreML mlmodelc", spec.id.as_str()))?;
        with_model(&artifact.compiled_model_path, |_| Ok(()))?;
        Ok(Self { artifact, spec })
    }

    pub(crate) fn predict(&self, input: &Array4<f32>) -> Result<Vec<f32>, String> {
        let expected = (self.spec.input_size * self.spec.input_size) as usize;
        if input.len() != expected * 3 {
            return Err(format!(
                "{} CoreML 输入尺寸错误: 期望 {}，实际 {}",
                self.spec.id.as_str(),
                expected * 3,
                input.len(),
            ));
        }
        with_model(&self.artifact.compiled_model_path, |model| {
            predict_inner(model, input, &self.artifact.manifest, expected)
        })
    }
}

pub(crate) fn artifact_directory(model_path: &Path) -> PathBuf {
    model_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("native-coreml")
}

pub(crate) fn resolve_artifact(
    model_path: &Path,
    spec: ModelSpec,
) -> Result<Option<NativeCoreMlArtifact>, String> {
    let directory = artifact_directory(model_path);
    let compiled_model_path = directory.join("model.mlmodelc");
    let manifest_path = directory.join("manifest.json");
    if !compiled_model_path.is_dir() || !manifest_path.is_file() {
        return Ok(None);
    }
    let manifest = serde_json::from_slice::<NativeCoreMlManifest>(
        &fs::read(&manifest_path).map_err(|error| format!("CoreML manifest 读取失败: {error}"))?,
    )
    .map_err(|error| format!("CoreML manifest 解析失败: {error}"))?;
    let Some(download) = spec.download else {
        return Ok(None);
    };
    if manifest.schema_version != MANIFEST_SCHEMA_VERSION
        || manifest.model_id != spec.id.as_str()
        || manifest.revision != download.revision
        || !manifest
            .reference_onnx_sha256
            .eq_ignore_ascii_case(download.sha256)
        || manifest.input_size != spec.input_size
        || manifest.input_name.trim().is_empty()
        || manifest.output_name.trim().is_empty()
    {
        return Ok(None);
    }
    Ok(Some(NativeCoreMlArtifact {
        compiled_model_path,
        manifest,
    }))
}

fn with_model<T>(
    path: &Path,
    operation: impl FnOnce(&MLModel) -> Result<T, String>,
) -> Result<T, String> {
    autoreleasepool(|_| {
        MODELS.with(|models| {
            let mut models = models.borrow_mut();
            if !models.contains_key(path) {
                models.insert(path.to_path_buf(), load_model(path)?);
            }
            operation(models.get(path).expect("CoreML model inserted"))
        })
    })
}

fn load_model(path: &Path) -> Result<objc2::rc::Retained<MLModel>, String> {
    let path = NSString::from_str(
        path.to_str()
            .ok_or_else(|| "CoreML 模型路径不是有效 UTF-8".to_string())?,
    );
    let url = NSURL::fileURLWithPath_isDirectory(&path, true);
    let configuration = unsafe { MLModelConfiguration::new() };
    unsafe { configuration.setComputeUnits(MLComputeUnits::All) };
    unsafe { MLModel::modelWithContentsOfURL_configuration_error(&url, &configuration) }
        .map_err(|error| format!("原生 CoreML 模型加载失败: {}", error.localizedDescription()))
}

#[allow(deprecated)]
fn predict_inner(
    model: &MLModel,
    input: &Array4<f32>,
    manifest: &NativeCoreMlManifest,
    expected_output_len: usize,
) -> Result<Vec<f32>, String> {
    let shape = [
        1_i64,
        3,
        i64::from(manifest.input_size),
        i64::from(manifest.input_size),
    ]
    .map(NSNumber::numberWithLongLong);
    let shape = NSArray::from_retained_slice(&shape);
    let array = unsafe {
        MLMultiArray::initWithShape_dataType_error(
            MLMultiArray::alloc(),
            &shape,
            MLMultiArrayDataType::Float32,
        )
    }
    .map_err(|error| {
        format!(
            "CoreML 输入 MLMultiArray 创建失败: {}",
            error.localizedDescription()
        )
    })?;
    let source = input
        .as_slice()
        .ok_or_else(|| "CoreML 输入 Tensor 不是连续内存".to_string())?;
    unsafe {
        ptr::copy_nonoverlapping(
            source.as_ptr(),
            array.dataPointer().as_ptr().cast::<f32>(),
            source.len(),
        );
    }

    let feature = unsafe { MLFeatureValue::featureValueWithMultiArray(&array) };
    let feature_object: objc2::rc::Retained<AnyObject> = feature.into_super().into_super();
    let input_name = NSString::from_str(&manifest.input_name);
    let input_key = ProtocolObject::<dyn NSCopying>::from_ref(&*input_name);
    let dictionary = unsafe {
        NSDictionary::<NSString, AnyObject>::dictionaryWithObject_forKey(&feature_object, input_key)
    };
    let provider = unsafe {
        MLDictionaryFeatureProvider::initWithDictionary_error(
            MLDictionaryFeatureProvider::alloc(),
            &dictionary,
        )
    }
    .map_err(|error| {
        format!(
            "CoreML 输入 FeatureProvider 创建失败: {}",
            error.localizedDescription()
        )
    })?;
    let provider = ProtocolObject::<dyn MLFeatureProvider>::from_ref(&*provider);
    let output = unsafe { model.predictionFromFeatures_error(provider) }
        .map_err(|error| format!("原生 CoreML 推理失败: {}", error.localizedDescription()))?;
    let output_name = NSString::from_str(&manifest.output_name);
    let feature = unsafe { output.featureValueForName(&output_name) }
        .ok_or_else(|| format!("CoreML 输出缺少字段 {}", manifest.output_name))?;
    let values = unsafe { feature.multiArrayValue() }
        .ok_or_else(|| format!("CoreML 输出 {} 不是 MLMultiArray", manifest.output_name))?;
    if unsafe { values.dataType() } != MLMultiArrayDataType::Float32 {
        return Err(format!("CoreML 输出 {} 不是 Float32", manifest.output_name));
    }
    let count = usize::try_from(unsafe { values.count() })
        .map_err(|_| "CoreML 输出元素数量无效".to_string())?;
    if count != expected_output_len {
        return Err(format!(
            "CoreML 输出尺寸错误: 期望 {expected_output_len}，实际 {count}"
        ));
    }
    let mut result = vec![0.0_f32; count];
    unsafe {
        ptr::copy_nonoverlapping(
            values.dataPointer().as_ptr().cast::<f32>(),
            result.as_mut_ptr(),
            count,
        );
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::foreground_segmentation::models::{SegmentationModelId, model_spec};

    #[test]
    fn native_artifact_is_single_compiled_model_directory() {
        let model_path = Path::new("/tmp/model/revision/model.onnx");
        assert_eq!(
            artifact_directory(model_path),
            Path::new("/tmp/model/revision/native-coreml")
        );
    }

    #[test]
    fn invalid_or_missing_manifest_does_not_enable_coreml() {
        let root = std::env::temp_dir().join(format!("coreml-artifact-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("native-coreml/model.mlmodelc")).unwrap();
        let model_path = root.join("model.onnx");
        fs::write(&model_path, b"model").unwrap();
        let spec = model_spec(SegmentationModelId::BiRefNetGeneral);
        assert!(resolve_artifact(&model_path, spec).unwrap().is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn matching_single_model_manifest_enables_native_coreml() {
        let root =
            std::env::temp_dir().join(format!("coreml-artifact-valid-{}", uuid::Uuid::new_v4()));
        let artifact = root.join("native-coreml");
        fs::create_dir_all(artifact.join("model.mlmodelc")).unwrap();
        let model_path = root.join("model.onnx");
        fs::write(&model_path, b"model").unwrap();
        let spec = model_spec(SegmentationModelId::BiRefNetGeneral);
        let download = spec.download.unwrap();
        let manifest = NativeCoreMlManifest {
            schema_version: MANIFEST_SCHEMA_VERSION,
            model_id: spec.id.as_str().into(),
            revision: download.revision.into(),
            reference_onnx_sha256: download.sha256.into(),
            input_name: "input".into(),
            output_name: "output".into(),
            input_size: spec.input_size,
        };
        fs::write(
            artifact.join("manifest.json"),
            serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap();

        let resolved = resolve_artifact(&model_path, spec).unwrap().unwrap();
        assert_eq!(
            resolved.compiled_model_path,
            artifact.join("model.mlmodelc")
        );
        fs::remove_dir_all(root).unwrap();
    }
}
