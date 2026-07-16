use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::OnceLock,
};

macro_rules! config_struct {
    ($name:ident { $($field:ident: $ty:ty),* $(,)? }) => {
        #[derive(Debug, Clone, Serialize, Deserialize)]
        #[serde(deny_unknown_fields, rename_all(serialize = "camelCase", deserialize = "snake_case"))]
        pub struct $name { $(pub $field: $ty),* }
    };
}

config_struct!(AppConfiguration {
    schema_version: u32,
    application: ApplicationConfig,
    window: WindowConfig,
    token: TokenConfig,
    export: ExportConfig,
    preview: PreviewConfig,
    layout: LayoutConfig,
    files: FilesConfig,
    rings: RingsConfig,
    history: HistoryConfig,
    notifications: NotificationsConfig,
    diagnostics: DiagnosticsConfig,
    foreground_segmentation: ForegroundSegmentationConfig
});
config_struct!(ApplicationConfig {
    title: String,
    locale: String
});
config_struct!(WindowConfig {
    width: u32,
    height: u32,
    min_width: u32,
    min_height: u32,
    resizable: bool
});
config_struct!(TokenConfig {
    defaults: TokenDefaults,
    limits: TokenLimits
});
config_struct!(TokenDefaults {
    design_size: u32,
    scale: f32,
    offset_x: f32,
    offset_y: f32,
    background_color: String,
    ring_inner_radius: i32,
    ring_outer_radius: i32,
    ring_color: String,
    ring_style: String,
    ring_stretch_x: f32,
    ring_stretch_y: f32,
    split_ring: bool,
    split_angle: f32,
    split_height: f32
});
config_struct!(TokenLimits {
    scale_min: f32,
    scale_max: f32,
    scale_step: f32,
    offset_min: f32,
    offset_max: f32,
    ring_stretch_min: f32,
    ring_stretch_max: f32,
    split_angle_min: f32,
    split_angle_max: f32,
    split_height_min: f32,
    split_height_max: f32
});
config_struct!(ExportConfig {
    defaults: ExportDefaults,
    limits: ExportLimits,
    rendering: RenderingConfig,
    naming: NamingConfig,
    random_colors: RandomColorsConfig,
    webp_strength_profiles: Vec<WebpStrengthProfile>
});
config_struct!(ExportDefaults {
    format: String,
    size: u32,
    png_optimization_level: u8,
    png_optimize_alpha: bool,
    png_preserve_metadata: bool,
    png_zopfli: bool,
    jpeg_quality: u8,
    jpeg_progressive: bool,
    jpeg_deringing: bool,
    jpeg_chroma_subsampling: String,
    webp_quality: u8,
    webp_lossless: bool,
    webp_encoding_strength: String,
    jxl_lossless: bool,
    jxl_distance: f32,
    jxl_effort: u8,
    jxl_progressive: bool,
    jxl_decoding_speed: u8,
    random_background: bool,
    random_ring_color: bool
});
config_struct!(ExportLimits {
    size_min: u32,
    size_max: u32,
    png_optimization_level_min: u8,
    png_optimization_level_max: u8,
    jpeg_quality_min: u8,
    jpeg_quality_max: u8,
    webp_quality_min: u8,
    webp_quality_max: u8,
    jxl_distance_min: f32,
    jxl_distance_max: f32,
    jxl_effort_min: u8,
    jxl_effort_max: u8,
    jxl_decoding_speed_min: u8,
    jxl_decoding_speed_max: u8,
    max_canvas_size: u32
});
config_struct!(WebpStrengthProfile {
    id: String,
    label: String,
    method: u8,
    passes: u8
});
config_struct!(RenderingConfig {
    resample_filter: String,
    trim_transparent_bounds: bool,
    jpeg_matte_color: String
});
config_struct!(NamingConfig {
    collision_separator: String,
    collision_start: usize
});
config_struct!(RandomColorsConfig {
    palette: Vec<String>,
    minimum_contrast_ratio: f32,
    minimum_oklab_distance: f32
});
config_struct!(PreviewConfig {
    display_token_size: f32,
    minimum_world_size: u32,
    world_size_step: u32,
    renderer: String,
    antialias: bool,
    device_pixel_ratio_max: f32,
    guide: GuideConfig
});
config_struct!(GuideConfig {
    dash_length: f32,
    gap_length: f32,
    line_width: f32,
    line_color: String,
    line_alpha: f32,
    endpoint_radius: f32,
    endpoint_alpha: f32
});
config_struct!(LayoutConfig {
    left_width: u32,
    right_width: u32,
    left_min_width: u32,
    center_min_width: u32,
    right_min_width: u32,
    resize_handle_width: u32
});
config_struct!(FilesConfig { thumbnail_size: u32, import_formats: Vec<String>, export_formats: Vec<String> });
config_struct!(RingsConfig {
    thumbnail_size: u32,
    request_debounce_ms: u64,
    frontend_cache_entries: usize,
    backend_cache_entries: usize,
    max_upload_bytes: u64,
    max_source_dimension: u32,
    custom_scale_min: f32,
    custom_scale_max: f32
});
config_struct!(HistoryConfig {
    maximum_entries: usize
});
config_struct!(NotificationsConfig {
    toast_duration_ms: u64
});
config_struct!(DiagnosticsConfig {
    log_directory: String
});
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    default,
    deny_unknown_fields,
    rename_all(serialize = "camelCase", deserialize = "snake_case")
)]
pub struct ForegroundSegmentationConfig {
    pub enabled: bool,
    pub model: String,
    pub device: String,
    pub worker_threads: usize,
    pub intra_threads: usize,
    pub inter_threads: usize,
    pub download_missing_models: bool,
    pub download_timeout_seconds: u64,
    pub model_cache_directory: String,
    pub output_suffix: String,
    pub max_source_dimension: u32,
    pub max_source_pixels: u64,
    #[serde(skip_serializing)]
    pub model_id: Option<String>,
    #[serde(skip_serializing)]
    pub model_resource: Option<String>,
    #[serde(skip_serializing)]
    pub backend: Option<String>,
    #[serde(skip_serializing)]
    pub device_id: Option<u32>,
}

impl Default for ForegroundSegmentationConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            model: "birefnet-general".into(),
            device: "auto".into(),
            worker_threads: 1,
            intra_threads: 0,
            inter_threads: 1,
            download_missing_models: true,
            download_timeout_seconds: 600,
            model_cache_directory: "./models/foreground-segmentation".into(),
            output_suffix: "-foreground".into(),
            max_source_dimension: 16_384,
            max_source_pixels: 67_108_864,
            model_id: None,
            model_resource: None,
            backend: None,
            device_id: None,
        }
    }
}

impl ForegroundSegmentationConfig {
    pub fn resolved_model(&self) -> &str {
        self.model_id.as_deref().unwrap_or(&self.model)
    }

    pub fn resolved_device(&self) -> &str {
        self.backend.as_deref().unwrap_or(&self.device)
    }
}
config_struct!(HandoutExportConfig {
    default_scale: f32,
    min_scale: f32,
    raw_rgba_ipc_max_bytes: u64,
    defaults: HandoutExportDefaults,
    limits: HandoutExportLimits,
    rendering: HandoutExportRendering,
    webp_strength_profiles: Vec<WebpStrengthProfile>
});
config_struct!(HandoutExportDefaults {
    format: String,
    png_optimization_level: u8,
    png_optimize_alpha: bool,
    png_preserve_metadata: bool,
    png_zopfli: bool,
    jpeg_quality: u8,
    jpeg_progressive: bool,
    jpeg_deringing: bool,
    jpeg_chroma_subsampling: String,
    webp_quality: u8,
    webp_lossless: bool,
    webp_encoding_strength: String,
    jxl_lossless: bool,
    jxl_distance: f32,
    jxl_effort: u8,
    jxl_progressive: bool,
    jxl_decoding_speed: u8
});
config_struct!(HandoutExportLimits {
    png_optimization_level_min: u8,
    png_optimization_level_max: u8,
    jpeg_quality_min: u8,
    jpeg_quality_max: u8,
    webp_quality_min: u8,
    webp_quality_max: u8,
    jxl_distance_min: f32,
    jxl_distance_max: f32,
    jxl_effort_min: u8,
    jxl_effort_max: u8,
    jxl_decoding_speed_min: u8,
    jxl_decoding_speed_max: u8,
    max_canvas_dimension: u32,
    max_canvas_pixels: u64
});
config_struct!(HandoutExportRendering {
    jpeg_matte_color: String
});

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigurationResponse {
    pub configuration: AppConfiguration,
    pub user_override_loaded: bool,
    pub user_override_path: String,
    pub warnings: Vec<String>,
}

fn valid_color(value: &str) -> bool {
    value.starts_with('#')
        && matches!(value.len(), 7 | 9)
        && value[1..].bytes().all(|b| b.is_ascii_hexdigit())
}

fn in_range(value: f32, min: f32, max: f32) -> bool {
    value.is_finite() && value >= min && value <= max
}

impl AppConfiguration {
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 {
            return Err("仅支持 schema_version = 1".into());
        }
        if self.application.title.trim().is_empty()
            || !matches!(self.application.locale.as_str(), "auto" | "zh-CN" | "en-US")
        {
            return Err("application.title 或 application.locale 无效".into());
        }
        if self.window.width == 0
            || self.window.height == 0
            || self.window.min_width == 0
            || self.window.min_height == 0
        {
            return Err("窗口尺寸必须大于零".into());
        }
        let d = &self.token.defaults;
        let l = &self.token.limits;
        if l.scale_step <= 0.0
            || l.scale_min > l.scale_max
            || l.offset_min > l.offset_max
            || l.ring_stretch_min <= 0.0
            || l.ring_stretch_min > l.ring_stretch_max
            || l.split_angle_min > l.split_angle_max
            || l.split_height_min > l.split_height_max
        {
            return Err("Token 参数范围无效".into());
        }
        if d.design_size == 0
            || d.ring_inner_radius < 0
            || d.ring_inner_radius >= d.ring_outer_radius
            || d.ring_outer_radius > (d.design_size / 2) as i32
        {
            return Err("默认圆环半径无效".into());
        }
        for (name, value, min, max) in [
            ("scale", d.scale, l.scale_min, l.scale_max),
            ("offset_x", d.offset_x, l.offset_min, l.offset_max),
            ("offset_y", d.offset_y, l.offset_min, l.offset_max),
            (
                "ring_stretch_x",
                d.ring_stretch_x,
                l.ring_stretch_min,
                l.ring_stretch_max,
            ),
            (
                "ring_stretch_y",
                d.ring_stretch_y,
                l.ring_stretch_min,
                l.ring_stretch_max,
            ),
            (
                "split_angle",
                d.split_angle,
                l.split_angle_min,
                l.split_angle_max,
            ),
            (
                "split_height",
                d.split_height,
                l.split_height_min,
                l.split_height_max,
            ),
        ] {
            if !in_range(value, min, max) {
                return Err(format!("默认 {name} 超出范围"));
            }
        }
        if !valid_color(&d.background_color)
            || !valid_color(&d.ring_color)
            || !valid_color(&self.export.rendering.jpeg_matte_color)
            || !valid_color(&self.preview.guide.line_color)
        {
            return Err("颜色必须是 #RRGGBB 或 #RRGGBBAA".into());
        }
        let random = &self.export.random_colors;
        if random.palette.len() < 2
            || random
                .palette
                .iter()
                .any(|color| color.len() != 7 || !valid_color(color))
            || !in_range(random.minimum_contrast_ratio, 1.0, 21.0)
            || !in_range(random.minimum_oklab_distance, 0.0, 1.0)
        {
            return Err("随机导出颜色配置无效".into());
        }
        let el = &self.export.limits;
        let ed = &self.export.defaults;
        if el.size_min == 0
            || el.size_min > el.size_max
            || el.png_optimization_level_min > el.png_optimization_level_max
            || el.png_optimization_level_max > 6
            || el.jpeg_quality_min == 0
            || el.jpeg_quality_min > el.jpeg_quality_max
            || el.jpeg_quality_max > 100
            || el.webp_quality_min == 0
            || el.webp_quality_min > el.webp_quality_max
            || !in_range(el.jxl_distance_min, 0.0, 5.0)
            || !in_range(el.jxl_distance_max, el.jxl_distance_min, 5.0)
            || el.jxl_effort_min < 1
            || el.jxl_effort_min > el.jxl_effort_max
            || el.jxl_effort_max > 9
            || el.jxl_decoding_speed_min > el.jxl_decoding_speed_max
            || el.jxl_decoding_speed_max > 4
            || el.max_canvas_size < el.size_max
            || ed.size < el.size_min
            || ed.size > el.size_max
            || ed.png_optimization_level < el.png_optimization_level_min
            || ed.png_optimization_level > el.png_optimization_level_max
            || ed.jpeg_quality < el.jpeg_quality_min
            || ed.jpeg_quality > el.jpeg_quality_max
            || ed.webp_quality < el.webp_quality_min
            || ed.webp_quality > el.webp_quality_max
            || !in_range(ed.jxl_distance, el.jxl_distance_min, el.jxl_distance_max)
            || ed.jxl_effort < el.jxl_effort_min
            || ed.jxl_effort > el.jxl_effort_max
            || ed.jxl_decoding_speed < el.jxl_decoding_speed_min
            || ed.jxl_decoding_speed > el.jxl_decoding_speed_max
        {
            return Err("导出范围或默认值无效".into());
        }
        if !matches!(ed.jpeg_chroma_subsampling.as_str(), "444" | "422" | "420") {
            return Err("JPEG 色度抽样仅支持 444、422 或 420".into());
        }
        let mut profile_ids = std::collections::HashSet::new();
        if self.export.webp_strength_profiles.is_empty()
            || self.export.webp_strength_profiles.iter().any(|profile| {
                profile.id.trim().is_empty()
                    || profile.label.trim().is_empty()
                    || profile.method > 6
                    || !(1..=10).contains(&profile.passes)
                    || !profile_ids.insert(profile.id.as_str())
            })
            || !profile_ids.contains(ed.webp_encoding_strength.as_str())
        {
            return Err("WebP 编码强度配置无效".into());
        }
        const IMPORT: &[&str] = &["png", "jpg", "jpeg", "webp", "bmp"];
        const EXPORT: &[&str] = &["png", "jpg", "webp", "jxl"];
        if self.files.import_formats.is_empty()
            || self
                .files
                .import_formats
                .iter()
                .any(|v| !IMPORT.contains(&v.as_str()))
            || self.files.export_formats.is_empty()
            || self
                .files
                .export_formats
                .iter()
                .any(|v| !EXPORT.contains(&v.as_str()))
            || !self.files.export_formats.contains(&ed.format)
        {
            return Err("文件格式包含未编译支持的值".into());
        }
        if self.preview.renderer != "webgl" || self.export.rendering.resample_filter != "lanczos3" {
            return Err("渲染器或重采样方式不受支持".into());
        }
        if self.preview.display_token_size <= 0.0
            || self.preview.minimum_world_size == 0
            || self.preview.world_size_step == 0
            || self.preview.device_pixel_ratio_max <= 0.0
            || self.preview.guide.dash_length <= 0.0
            || self.preview.guide.gap_length < 0.0
            || !(0.0..=1.0).contains(&self.preview.guide.line_alpha)
            || !(0.0..=1.0).contains(&self.preview.guide.endpoint_alpha)
        {
            return Err("预览配置无效".into());
        }
        if self.layout.left_width < self.layout.left_min_width
            || self.layout.right_width < self.layout.right_min_width
            || self.layout.center_min_width == 0
            || self.layout.resize_handle_width == 0
            || self.window.min_width
                < self.layout.left_min_width
                    + self.layout.center_min_width
                    + self.layout.right_min_width
                    + self.layout.resize_handle_width * 2
        {
            return Err("窗口最小宽度不足以容纳布局".into());
        }
        if self.files.thumbnail_size == 0
            || self.rings.thumbnail_size == 0
            || self.rings.frontend_cache_entries == 0
            || self.rings.backend_cache_entries == 0
            || self.rings.max_upload_bytes == 0
            || self.rings.max_source_dimension == 0
            || self.rings.custom_scale_min <= 0.0
            || self.rings.custom_scale_min > self.rings.custom_scale_max
            || self.history.maximum_entries == 0
            || self.notifications.toast_duration_ms == 0
            || self.export.naming.collision_start < 2
            || self.export.naming.collision_separator.contains(['/', '\\'])
        {
            return Err("文件、历史、通知或命名配置无效".into());
        }
        let segmentation = &self.foreground_segmentation;
        if !matches!(
            segmentation.resolved_model(),
            "birefnet-general" | "u2net" | "ben2" | "macos-vision"
        ) || !matches!(
            segmentation.resolved_device(),
            "auto" | "cpu" | "coreml" | "directml" | "cuda"
        ) || segmentation.worker_threads == 0
            || segmentation.inter_threads == 0
            || segmentation.download_timeout_seconds == 0
            || segmentation.model_cache_directory.trim().is_empty()
            || Path::new(&segmentation.model_cache_directory).is_absolute()
            || Path::new(&segmentation.model_cache_directory)
                .components()
                .any(|component| matches!(component, std::path::Component::ParentDir))
            || segmentation.output_suffix.trim().is_empty()
            || segmentation.output_suffix.contains(['/', '\\'])
            || segmentation.max_source_dimension == 0
            || segmentation.max_source_pixels == 0
        {
            return Err("前景分割配置无效".into());
        }
        Ok(())
    }
}

impl HandoutExportConfig {
    fn validate(&self) -> Result<(), String> {
        let defaults = &self.defaults;
        let limits = &self.limits;
        if !self.default_scale.is_finite()
            || !self.min_scale.is_finite()
            || self.default_scale < self.min_scale
            || self.min_scale <= 0.0
            || self.raw_rgba_ipc_max_bytes == 0
            || limits.max_canvas_dimension == 0
            || limits.max_canvas_pixels == 0
            || limits.png_optimization_level_min > limits.png_optimization_level_max
            || limits.png_optimization_level_max > 6
            || limits.jpeg_quality_min == 0
            || limits.jpeg_quality_min > limits.jpeg_quality_max
            || limits.jpeg_quality_max > 100
            || limits.webp_quality_min == 0
            || limits.webp_quality_min > limits.webp_quality_max
            || limits.webp_quality_max > 100
            || !in_range(limits.jxl_distance_min, 0.0, 5.0)
            || !in_range(limits.jxl_distance_max, limits.jxl_distance_min, 5.0)
            || limits.jxl_effort_min < 1
            || limits.jxl_effort_min > limits.jxl_effort_max
            || limits.jxl_effort_max > 9
            || limits.jxl_decoding_speed_min > limits.jxl_decoding_speed_max
            || limits.jxl_decoding_speed_max > 4
            || defaults.png_optimization_level < limits.png_optimization_level_min
            || defaults.png_optimization_level > limits.png_optimization_level_max
            || defaults.jpeg_quality < limits.jpeg_quality_min
            || defaults.jpeg_quality > limits.jpeg_quality_max
            || defaults.webp_quality < limits.webp_quality_min
            || defaults.webp_quality > limits.webp_quality_max
            || !in_range(
                defaults.jxl_distance,
                limits.jxl_distance_min,
                limits.jxl_distance_max,
            )
            || defaults.jxl_effort < limits.jxl_effort_min
            || defaults.jxl_effort > limits.jxl_effort_max
            || defaults.jxl_decoding_speed < limits.jxl_decoding_speed_min
            || defaults.jxl_decoding_speed > limits.jxl_decoding_speed_max
        {
            return Err("Handout 导出范围或默认值无效".into());
        }
        if !matches!(defaults.format.as_str(), "png" | "jpg" | "webp" | "jxl")
            || !matches!(
                defaults.jpeg_chroma_subsampling.as_str(),
                "444" | "422" | "420"
            )
            || !valid_color(&self.rendering.jpeg_matte_color)
        {
            return Err("Handout 导出格式或 JPEG 配置无效".into());
        }
        let mut profile_ids = std::collections::HashSet::new();
        if self.webp_strength_profiles.is_empty()
            || self.webp_strength_profiles.iter().any(|profile| {
                profile.id.trim().is_empty()
                    || profile.label.trim().is_empty()
                    || profile.method > 6
                    || !(1..=10).contains(&profile.passes)
                    || !profile_ids.insert(profile.id.as_str())
            })
            || !profile_ids.contains(defaults.webp_encoding_strength.as_str())
        {
            return Err("Handout WebP 编码强度配置无效".into());
        }
        Ok(())
    }
}

fn merge_values(base: &mut toml::Value, overlay: toml::Value) {
    match (base, overlay) {
        (toml::Value::Table(base), toml::Value::Table(overlay)) => {
            for (key, value) in overlay {
                match base.get_mut(&key) {
                    Some(current) => merge_values(current, value),
                    None => {
                        base.insert(key, value);
                    }
                }
            }
        }
        (base, overlay) => *base = overlay,
    }
}

pub fn parse_configuration(source: &str) -> Result<AppConfiguration, String> {
    let value: toml::Value = toml::from_str(source).map_err(|e| format!("TOML 解析失败: {e}"))?;
    let config: AppConfiguration = value.try_into().map_err(|e| format!("配置结构错误: {e}"))?;
    config.validate()?;
    Ok(config)
}

pub fn parse_handout_configuration(source: &str) -> Result<AppConfiguration, String> {
    let root: toml::Value =
        toml::from_str(source).map_err(|error| format!("Handout TOML 解析失败: {error}"))?;
    let token = root
        .get("token")
        .and_then(toml::Value::as_table)
        .ok_or_else(|| "配置缺少 [token.*] 子树".to_string())?;
    parse_handout_export_configuration(source)?;
    let required = |name: &str| {
        token
            .get(name)
            .cloned()
            .ok_or_else(|| format!("配置缺少 [token.{name}]"))
    };
    let mut value = toml::map::Map::new();
    for name in [
        "schema_version",
        "application",
        "window",
        "diagnostics",
        "foreground_segmentation",
    ] {
        value.insert(
            name.into(),
            root.get(name)
                .cloned()
                .ok_or_else(|| format!("配置缺少 {name}"))?,
        );
    }
    value.insert(
        "token".into(),
        toml::Value::Table(toml::map::Map::from_iter([
            ("defaults".into(), required("defaults")?),
            ("limits".into(), required("limits")?),
        ])),
    );
    value.insert("export".into(), required("export")?);
    value.insert("preview".into(), required("preview")?);
    value.insert("layout".into(), required("layout")?);
    value.insert("files".into(), required("files")?);
    value.insert("rings".into(), required("rings")?);
    value.insert("history".into(), required("history")?);
    value.insert("notifications".into(), required("notifications")?);

    let config: AppConfiguration = toml::Value::Table(value)
        .try_into()
        .map_err(|error| format!("Token 配置结构错误: {error}"))?;
    config.validate()?;
    Ok(config)
}

pub fn parse_handout_export_configuration(source: &str) -> Result<HandoutExportConfig, String> {
    let root: toml::Value =
        toml::from_str(source).map_err(|error| format!("Handout TOML 解析失败: {error}"))?;
    let export = root
        .get("export")
        .cloned()
        .ok_or_else(|| "配置缺少 [export]".to_string())?;
    let config: HandoutExportConfig = export
        .try_into()
        .map_err(|error| format!("Handout 导出配置结构错误: {error}"))?;
    config.validate()?;
    Ok(config)
}

pub fn merge_and_parse(base: &str, overlay: &str) -> Result<AppConfiguration, String> {
    let mut base: toml::Value =
        toml::from_str(base).map_err(|e| format!("基础 TOML 解析失败: {e}"))?;
    let handout_root = base.get("paths").is_some() || base.get("mask").is_some();
    let overlay: toml::Value =
        toml::from_str(overlay).map_err(|e| format!("用户 TOML 解析失败: {e}"))?;
    merge_values(&mut base, overlay);
    if handout_root {
        return parse_handout_configuration(
            &toml::to_string(&base).map_err(|e| format!("配置序列化失败: {e}"))?,
        );
    }
    let config: AppConfiguration = base.try_into().map_err(|e| format!("配置结构错误: {e}"))?;
    config.validate()?;
    Ok(config)
}

pub fn load_from_strings(
    base: &str,
    overlay: Option<&str>,
    override_path: &str,
) -> Result<ConfigurationResponse, String> {
    let base_value: toml::Value =
        toml::from_str(base).map_err(|e| format!("基础 TOML 解析失败: {e}"))?;
    let base_config = if base_value.get("paths").is_some() || base_value.get("mask").is_some() {
        parse_handout_configuration(base)?
    } else {
        parse_configuration(base)?
    };
    let Some(overlay) = overlay else {
        return Ok(ConfigurationResponse {
            configuration: base_config,
            user_override_loaded: false,
            user_override_path: override_path.into(),
            warnings: vec![],
        });
    };
    match merge_and_parse(base, overlay) {
        Ok(configuration) => Ok(ConfigurationResponse {
            configuration,
            user_override_loaded: true,
            user_override_path: override_path.into(),
            warnings: vec![],
        }),
        Err(error) => Ok(ConfigurationResponse {
            configuration: base_config,
            user_override_loaded: false,
            user_override_path: override_path.into(),
            warnings: vec![format!("已忽略无效用户配置 {override_path}: {error}")],
        }),
    }
}

pub fn load_configuration(user_path: PathBuf) -> Result<ConfigurationResponse, String> {
    let base = include_str!("../../../configuration.toml");
    let overlay = match fs::read_to_string(&user_path) {
        Ok(value) => Some(value),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => {
            return load_from_strings(
                base,
                Some("invalid = true"),
                &format!("{} ({e})", user_path.display()),
            );
        }
    };
    load_from_strings(base, overlay.as_deref(), &user_path.to_string_lossy())
}

pub fn write_warnings(response: &ConfigurationResponse) {
    if response.warnings.is_empty() {
        return;
    }
    let directory = Path::new(&response.configuration.diagnostics.log_directory);
    let _ = fs::create_dir_all(directory);
    let text = response.warnings.join("\n") + "\n";
    let _ = fs::write(directory.join("configuration.log"), text);
    for warning in &response.warnings {
        eprintln!("[configuration] {warning}");
    }
}

static ACTIVE_CONFIGURATION: OnceLock<AppConfiguration> = OnceLock::new();
static ACTIVE_HANDOUT_EXPORT_CONFIGURATION: OnceLock<HandoutExportConfig> = OnceLock::new();

pub fn set_active_configuration(configuration: AppConfiguration) -> Result<(), String> {
    ACTIVE_CONFIGURATION
        .set(configuration)
        .map_err(|_| "配置已经初始化".into())
}

pub fn active_configuration() -> &'static AppConfiguration {
    ACTIVE_CONFIGURATION.get_or_init(|| {
        parse_handout_configuration(include_str!("../../../configuration.toml"))
            .expect("项目 configuration.toml 的 [token.*] 必须有效")
    })
}

pub fn set_active_handout_export_configuration(
    configuration: HandoutExportConfig,
) -> Result<(), String> {
    ACTIVE_HANDOUT_EXPORT_CONFIGURATION
        .set(configuration)
        .map_err(|_| "Handout 导出配置已经初始化".into())
}

pub fn active_handout_export_configuration() -> &'static HandoutExportConfig {
    ACTIVE_HANDOUT_EXPORT_CONFIGURATION.get_or_init(|| {
        parse_handout_export_configuration(include_str!("../../../configuration.toml"))
            .expect("项目 configuration.toml 的 [export.*] 必须有效")
    })
}

#[tauri::command]
pub fn get_configuration(state: tauri::State<'_, ConfigurationResponse>) -> ConfigurationResponse {
    state.inner().clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    const BASE: &str = include_str!("../../../configuration.toml");

    #[test]
    fn handout_token_subtree_is_strictly_valid() {
        let config = parse_handout_configuration(include_str!("../../../configuration.toml"))
            .expect("handout token configuration");
        assert_eq!(config.token.defaults.design_size, 512);
        assert_eq!(config.export.webp_strength_profiles.len(), 4);
        assert!(config.files.export_formats.contains(&"jxl".to_string()));
    }
    #[test]
    fn bundled_configuration_parses_and_matches_current_defaults() {
        let c = parse_handout_configuration(BASE).unwrap();
        assert_eq!(c.schema_version, 1);
        assert_eq!(c.application.locale, "auto");
        assert_eq!(c.token.defaults.design_size, 512);
        assert_eq!(c.token.defaults.ring_inner_radius, 225);
        assert_eq!(c.token.defaults.ring_outer_radius, 250);
        assert_eq!(c.export.defaults.size, 512);
        assert!(!c.export.defaults.jxl_lossless);
        assert_eq!(c.export.defaults.jxl_distance, 1.0);
        assert_eq!(c.export.defaults.jxl_effort, 7);
        assert!(c.export.defaults.jxl_progressive);
        assert!(!c.export.defaults.random_background);
        assert!(!c.export.defaults.random_ring_color);
        assert_eq!(c.export.random_colors.palette.len(), 18);
        assert_eq!(c.export.random_colors.minimum_contrast_ratio, 4.5);
        assert_eq!(c.export.random_colors.minimum_oklab_distance, 0.12);
        assert_eq!(c.export.limits.jxl_distance_min, 0.0);
        assert_eq!(c.export.limits.jxl_distance_max, 5.0);
        assert_eq!(c.export.limits.jxl_effort_min, 1);
        assert_eq!(c.export.limits.jxl_effort_max, 9);
        assert!(c.files.export_formats.contains(&"jxl".to_string()));
        assert_eq!(c.preview.minimum_world_size, 512);
        assert_eq!(c.foreground_segmentation.model, "birefnet-general");
        assert_eq!(c.foreground_segmentation.device, "auto");
        assert_eq!(c.foreground_segmentation.worker_threads, 1);
        assert_eq!(c.foreground_segmentation.inter_threads, 1);
    }

    #[test]
    fn validates_foreground_segmentation_configuration() {
        assert!(merge_and_parse(BASE, "[foreground_segmentation]\ndevice='metal'").is_err());
        assert!(merge_and_parse(BASE, "[foreground_segmentation]\nworker_threads=0").is_err());
        assert!(merge_and_parse(BASE, "[foreground_segmentation]\nmax_source_pixels=0").is_err());
        assert!(
            merge_and_parse(
                BASE,
                "[foreground_segmentation]\nmodel_cache_directory='../models'"
            )
            .is_err()
        );
    }

    #[test]
    fn accepts_legacy_foreground_segmentation_fields() {
        let config = merge_and_parse(
            BASE,
            "[foreground_segmentation]\nmodel_id='birefnet-general'\nbackend='cpu'\ndevice_id=0\nmodel_resource='resources/models/legacy.onnx'",
        )
        .unwrap();
        assert_eq!(
            config.foreground_segmentation.resolved_model(),
            "birefnet-general"
        );
        assert_eq!(config.foreground_segmentation.resolved_device(), "cpu");
    }

    #[test]
    fn rejects_unsupported_application_locale() {
        assert!(merge_and_parse(BASE, "[application]\nlocale='fr-FR'").is_err());
    }

    #[test]
    fn bundled_configuration_contains_advanced_encoder_settings() {
        let c = parse_handout_configuration(BASE).unwrap();
        let value = serde_json::to_value(c.export).unwrap();
        assert_eq!(value["defaults"]["pngOptimizationLevel"], 3);
        assert_eq!(value["defaults"]["jpegQuality"], 85);
        assert_eq!(value["defaults"]["jpegChromaSubsampling"], "422");
        assert_eq!(value["defaults"]["webpEncodingStrength"], "balanced");
        assert_eq!(value["defaults"]["jxlDecodingSpeed"], 0);
        assert_eq!(value["limits"]["jxlDistanceMin"], 0.0);
        assert_eq!(value["limits"]["jxlDistanceMax"], 5.0);
        assert_eq!(value["webpStrengthProfiles"].as_array().unwrap().len(), 4);
    }

    #[test]
    fn handout_export_configuration_is_strict_and_validated() {
        let configuration = parse_handout_export_configuration(BASE).unwrap();
        assert_eq!(configuration.raw_rgba_ipc_max_bytes, 134_217_728);
        assert_eq!(configuration.limits.max_canvas_dimension, 16_384);
        assert_eq!(configuration.limits.max_canvas_pixels, 67_108_864);
        assert_eq!(configuration.webp_strength_profiles.len(), 4);

        let invalid_limit = BASE.replace("max_canvas_pixels = 67108864", "max_canvas_pixels = 0");
        assert!(parse_handout_export_configuration(&invalid_limit).is_err());
        let invalid_profile = BASE.replace(
            "webp_encoding_strength = \"balanced\"",
            "webp_encoding_strength = \"missing\"",
        );
        assert!(parse_handout_export_configuration(&invalid_profile).is_err());
        let unknown_field = BASE.replace(
            "raw_rgba_ipc_max_bytes = 134217728",
            "raw_rgba_ipc_max_bytes = 134217728\nunknown_export_key = 1",
        );
        assert!(parse_handout_export_configuration(&unknown_field).is_err());
    }

    #[test]
    fn rejects_invalid_jxl_defaults_and_limits() {
        assert!(merge_and_parse(BASE, "[token.export.defaults]\njxl_effort=10").is_err());
        assert!(merge_and_parse(BASE, "[token.export.defaults]\njxl_distance=5.01").is_err());
        assert!(merge_and_parse(BASE, "[token.export.limits]\njxl_effort_min=0").is_err());
    }

    #[test]
    fn rejects_invalid_encoder_profiles_and_defaults() {
        assert!(
            merge_and_parse(BASE, "[token.export.defaults]\npng_optimization_level=7").is_err()
        );
        assert!(merge_and_parse(BASE, "[token.export.defaults]\njpeg_quality=0").is_err());
        assert!(
            merge_and_parse(
                BASE,
                "[token.export.defaults]\njpeg_chroma_subsampling='411'"
            )
            .is_err()
        );
        assert!(
            merge_and_parse(
                BASE,
                "[token.export.defaults]\nwebp_encoding_strength='missing'"
            )
            .is_err()
        );
        assert!(merge_and_parse(BASE, "[token.export.defaults]\njxl_decoding_speed=5").is_err());
    }
    #[test]
    fn rejects_invalid_random_color_configuration() {
        assert!(
            merge_and_parse(BASE, "[token.export.random_colors]\npalette=['#000000']").is_err()
        );
        assert!(
            merge_and_parse(
                BASE,
                "[token.export.random_colors]\npalette=['#000000', '#GGGGGG']"
            )
            .is_err()
        );
        assert!(
            merge_and_parse(
                BASE,
                "[token.export.random_colors]\nminimum_contrast_ratio=22.0"
            )
            .is_err()
        );
        assert!(
            merge_and_parse(
                BASE,
                "[token.export.random_colors]\nminimum_oklab_distance=1.1"
            )
            .is_err()
        );
    }
    #[test]
    fn partial_override_merges_tables_and_replaces_arrays() {
        let c = merge_and_parse(
            BASE,
            r##"[window]
width=1200
[token.defaults]
ring_color="#11223344"
[token.files]
import_formats=["png"]"##,
        )
        .unwrap();
        assert_eq!(c.window.width, 1200);
        assert_eq!(c.window.height, 920);
        assert_eq!(c.token.defaults.ring_color, "#11223344");
        assert_eq!(c.files.import_formats, vec!["png"]);
    }
    #[test]
    fn invalid_override_falls_back_with_warning() {
        let c = load_from_strings(BASE, Some("[window]\nwidth=-1"), "/tmp/user.toml").unwrap();
        assert!(!c.user_override_loaded);
        assert_eq!(c.configuration.window.width, 1440);
        assert_eq!(c.warnings.len(), 1);
    }
    #[test]
    fn unknown_fields_and_cross_field_errors_are_rejected() {
        assert!(merge_and_parse(BASE, "[window]\nwidht=1200").is_err());
        assert!(merge_and_parse(BASE, "[token.defaults]\nring_inner_radius=251").is_err());
        assert!(merge_and_parse(BASE, "schema_version=2").is_err());
    }
}
