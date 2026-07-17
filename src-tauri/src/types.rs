//! Shared backend type boundary. All structs use `#[serde(rename_all =
//! "camelCase")]` for JS interop and are `pub(crate)` so that command modules
//! can construct and return them.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LibraryRecord {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) file_name: String,
    pub(crate) path: String,
    pub(crate) thumbnail_path: Option<String>,
    #[serde(default)]
    pub(crate) font_family: Option<String>,
    pub(crate) tags: Vec<String>,
    #[serde(default)]
    pub(crate) folder: String,
    pub(crate) media_type: String,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
    #[serde(default)]
    pub(crate) token_ring: Option<TokenRingConfig>,
    #[serde(default)]
    pub(crate) token_background: Option<TokenBackgroundConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TokenBackgroundConfig {
    pub(crate) revision: u64,
    pub(crate) design_size: f64,
    pub(crate) image_offset_x: f64,
    pub(crate) image_offset_y: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TokenRingConfig {
    pub(crate) revision: u64,
    pub(crate) design_size: f64,
    pub(crate) inner_radius: f64,
    pub(crate) outer_radius: f64,
    pub(crate) image_scale_x: f64,
    pub(crate) image_scale_y: f64,
    pub(crate) image_offset_x: f64,
    pub(crate) image_offset_y: f64,
    #[serde(skip)]
    pub(crate) legacy: bool,
}

impl<'de> Deserialize<'de> for TokenRingConfig {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct CompatibleConfig {
            revision: u64,
            design_size: f64,
            inner_radius: f64,
            outer_radius: f64,
            image_scale_x: Option<f64>,
            image_scale_y: Option<f64>,
            image_offset_x: Option<f64>,
            image_offset_y: Option<f64>,
            asset_scale: Option<f64>,
            offset_x: Option<f64>,
            offset_y: Option<f64>,
        }

        let value = CompatibleConfig::deserialize(deserializer)?;
        let legacy = value.image_scale_x.is_none()
            || value.image_scale_y.is_none()
            || value.image_offset_x.is_none()
            || value.image_offset_y.is_none();
        let legacy_scale = value.asset_scale.unwrap_or(1.0) * 100.0;
        Ok(Self {
            revision: value.revision,
            design_size: value.design_size,
            inner_radius: value.inner_radius,
            outer_radius: value.outer_radius,
            image_scale_x: value.image_scale_x.unwrap_or(legacy_scale),
            image_scale_y: value.image_scale_y.unwrap_or(legacy_scale),
            image_offset_x: value.image_offset_x.or(value.offset_x).unwrap_or(0.0),
            image_offset_y: value.image_offset_y.or(value.offset_y).unwrap_or(0.0),
            legacy,
        })
    }
}

#[cfg(test)]
mod token_ring_config_tests {
    use super::TokenRingConfig;

    #[test]
    fn reads_legacy_uniform_ring_geometry() {
        let ring: TokenRingConfig = serde_json::from_value(serde_json::json!({
            "revision": 4,
            "designSize": 512.0,
            "innerRadius": 225.0,
            "outerRadius": 250.0,
            "assetScale": 1.2,
            "offsetX": 8.0,
            "offsetY": -6.0
        }))
        .unwrap();

        assert_eq!(ring.image_scale_x, 120.0);
        assert_eq!(ring.image_scale_y, 120.0);
        assert_eq!(ring.image_offset_x, 8.0);
        assert_eq!(ring.image_offset_y, -6.0);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LibraryIndex {
    #[serde(default)]
    pub(crate) backgrounds: Vec<LibraryRecord>,
    #[serde(default)]
    pub(crate) assets: Vec<LibraryRecord>,
    #[serde(default)]
    pub(crate) fonts: Vec<LibraryRecord>,
    #[serde(default)]
    pub(crate) background_folders: Vec<String>,
    #[serde(default)]
    pub(crate) asset_folders: Vec<String>,
    #[serde(default)]
    pub(crate) font_folders: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportResult {
    pub(crate) record: LibraryRecord,
    pub(crate) library: LibraryIndex,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForegroundSegmentationTimings {
    pub(crate) session_load_ms: u64,
    pub(crate) decode_ms: u64,
    pub(crate) preprocess_ms: u64,
    pub(crate) inference_ms: u64,
    pub(crate) postprocess_ms: u64,
    pub(crate) write_ms: u64,
    pub(crate) thumbnail_ms: u64,
    pub(crate) index_write_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForegroundSegmentationResult {
    pub(crate) record: LibraryRecord,
    pub(crate) library: LibraryIndex,
    pub(crate) timings: ForegroundSegmentationTimings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForegroundSegmentationRequest {
    pub(crate) asset_id: String,
    pub(crate) source_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForegroundSegmentationItemResult {
    pub(crate) asset_id: String,
    pub(crate) success: bool,
    pub(crate) record: Option<LibraryRecord>,
    pub(crate) error: Option<String>,
    pub(crate) model: String,
    pub(crate) device: String,
    pub(crate) timings: ForegroundSegmentationTimings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForegroundSegmentationBatchResult {
    pub(crate) results: Vec<ForegroundSegmentationItemResult>,
    pub(crate) library: LibraryIndex,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForegroundSegmentationProgress {
    pub(crate) phase: String,
    pub(crate) stage: String,
    pub(crate) current: usize,
    pub(crate) total: usize,
    pub(crate) asset_id: Option<String>,
    pub(crate) success_count: usize,
    pub(crate) failure_count: usize,
    pub(crate) model: Option<String>,
    pub(crate) device: Option<String>,
    pub(crate) completed_bytes: Option<u64>,
    pub(crate) total_bytes: Option<u64>,
    pub(crate) elapsed_ms: Option<u64>,
    pub(crate) error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectPayload {
    pub(crate) document: Value,
    pub(crate) metadata: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectSummary {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) project_dir: String,
    #[serde(default)]
    pub(crate) folder: String,
    pub(crate) background_asset_id: Option<String>,
    pub(crate) preview_path: Option<String>,
    pub(crate) preview_size_bytes: Option<u64>,
    pub(crate) updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectFolderIndex {
    #[serde(default)]
    pub(crate) folders: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TokenProjectPayload {
    pub(crate) document: Value,
    pub(crate) metadata: Value,
    pub(crate) resolved_sources: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TokenProjectSummary {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) project_dir: String,
    #[serde(default)]
    pub(crate) folder: String,
    pub(crate) item_count: usize,
    pub(crate) preview_path: Option<String>,
    pub(crate) updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteEntries {
    #[serde(default)]
    pub(crate) ids: Vec<String>,
    #[serde(default)]
    pub(crate) folders: Vec<String>,
}
