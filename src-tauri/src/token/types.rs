use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenParams {
    pub size: u32,
    pub scale: f32,
    pub offset_x: f32,
    pub offset_y: f32,
    pub background: String,
    pub ring_inner_radius: i32,
    pub ring_outer_radius: i32,
    pub ring_color: String,
    pub ring_style: String,
    pub ring_stretch_x: f32,
    pub ring_stretch_y: f32,
    pub ring_image_scale_x: f32,
    pub ring_image_scale_y: f32,
    pub ring_image_offset_x: f32,
    pub ring_image_offset_y: f32,
    #[serde(default)]
    pub ring_asset_path: Option<String>,
    pub split_ring: bool,
    pub split_angle: f32,
    pub split_height: f32,
    pub export_format: String,
    /// 基础 Token 分辨率；出框内容可让最终输出对称扩展至更大的方形。
    pub export_size: u32,
    pub png_optimization_level: u8,
    pub png_optimize_alpha: bool,
    pub png_preserve_metadata: bool,
    pub png_zopfli: bool,
    pub jpeg_quality: u8,
    pub jpeg_progressive: bool,
    pub jpeg_deringing: bool,
    pub jpeg_chroma_subsampling: String,
    /// 有损 WebP 编码质量；无损模式下不会参与编码。
    pub webp_quality: u8,
    pub webp_lossless: bool,
    pub webp_encoding_strength: String,
    pub jxl_lossless: bool,
    pub jxl_distance: f32,
    pub jxl_effort: u8,
    pub jxl_progressive: bool,
    pub jxl_decoding_speed: u8,
    pub random_background: bool,
    pub random_ring_color: bool,
}

impl Default for TokenParams {
    fn default() -> Self {
        Self {
            size: 512,
            scale: 100.0,
            offset_x: 0.0,
            offset_y: 0.0,
            background: "#000000FF".into(),
            ring_inner_radius: 225,
            ring_outer_radius: 250,
            ring_color: "#F6C75BFF".into(),
            ring_style: "solid".into(),
            ring_stretch_x: 1.0,
            ring_stretch_y: 1.0,
            ring_image_scale_x: 100.0,
            ring_image_scale_y: 100.0,
            ring_image_offset_x: 0.0,
            ring_image_offset_y: 0.0,
            ring_asset_path: None,
            split_ring: false,
            split_angle: 0.0,
            split_height: 0.0,
            export_format: "png".into(),
            export_size: 512,
            png_optimization_level: 3,
            png_optimize_alpha: true,
            png_preserve_metadata: false,
            png_zopfli: false,
            jpeg_quality: 85,
            jpeg_progressive: true,
            jpeg_deringing: true,
            jpeg_chroma_subsampling: "422".into(),
            webp_quality: 90,
            webp_lossless: false,
            webp_encoding_strength: "balanced".into(),
            jxl_lossless: false,
            jxl_distance: 1.0,
            jxl_effort: 7,
            jxl_progressive: true,
            jxl_decoding_speed: 0,
            random_background: false,
            random_ring_color: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RingConfig {
    pub name: String,
    pub ring_inner_radius: Option<i32>,
    pub ring_outer_radius: Option<i32>,
    pub ring_stretch_x: Option<f32>,
    pub ring_stretch_y: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateResult {
    pub success: bool,
    pub output_path: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExportProgressPhase {
    Preparing,
    Decoding,
    Rendering,
    Compositing,
    Encoding,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "event",
    content = "data"
)]
pub enum ExportProgressEvent {
    Started {
        total: usize,
    },
    ItemProgress {
        index: usize,
        total: usize,
        input: String,
        phase: ExportProgressPhase,
        item_progress: f32,
    },
    ItemFinished {
        index: usize,
        completed: usize,
        total: usize,
        success: bool,
    },
    Finished {
        completed: usize,
        total: usize,
        success_count: usize,
        failure_count: usize,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchGenerateItem {
    pub input: String,
    pub params: TokenParams,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMeta {
    pub width: u32,
    pub height: u32,
    pub format: String,
}
