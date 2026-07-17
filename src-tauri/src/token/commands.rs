use image::Rgba;
use rand::rng;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::ipc::Channel;
use walkdir::WalkDir;

use crate::token::configuration::active_configuration;
use crate::token::encoding::encode_image;
use crate::token::engine;
use crate::token::export_colors::apply_random_colors;
use crate::token::rings;
use crate::token::types::*;

fn is_valid_hex_color(value: &str) -> bool {
    let hex = value.strip_prefix('#').unwrap_or(value);
    (hex.len() == 6 || hex.len() == 8) && hex.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn validate_params(params: &TokenParams) -> Result<(), String> {
    let config = active_configuration();
    let limits = &config.token.limits;
    let export = &config.export.limits;
    if params.size != config.token.defaults.design_size {
        return Err(format!(
            "内部 Token 设计尺寸必须为 {}",
            config.token.defaults.design_size
        ));
    }
    if !(export.size_min..=export.size_max).contains(&params.export_size) {
        return Err(format!(
            "导出基础尺寸必须介于 {} 和 {} 之间",
            export.size_min, export.size_max
        ));
    }
    if !(export.webp_quality_min..=export.webp_quality_max).contains(&params.webp_quality) {
        return Err(format!(
            "WebP 质量必须介于 {} 和 {} 之间",
            export.webp_quality_min, export.webp_quality_max
        ));
    }
    if !(export.png_optimization_level_min..=export.png_optimization_level_max)
        .contains(&params.png_optimization_level)
    {
        return Err("PNG 压缩等级超出配置范围".into());
    }
    if !(export.jpeg_quality_min..=export.jpeg_quality_max).contains(&params.jpeg_quality) {
        return Err("JPEG 质量超出配置范围".into());
    }
    if !matches!(
        params.jpeg_chroma_subsampling.as_str(),
        "444" | "422" | "420"
    ) {
        return Err("JPEG 色度抽样仅支持 444、422 或 420".into());
    }
    if !config
        .export
        .webp_strength_profiles
        .iter()
        .any(|profile| profile.id == params.webp_encoding_strength)
    {
        return Err("WebP 编码强度不存在".into());
    }
    if !params.jxl_distance.is_finite()
        || !(export.jxl_distance_min..=export.jxl_distance_max).contains(&params.jxl_distance)
    {
        return Err(format!(
            "JXL Distance 必须介于 {} 和 {} 之间",
            export.jxl_distance_min, export.jxl_distance_max
        ));
    }
    if !(export.jxl_effort_min..=export.jxl_effort_max).contains(&params.jxl_effort) {
        return Err(format!(
            "JXL Effort 必须介于 {} 和 {} 之间",
            export.jxl_effort_min, export.jxl_effort_max
        ));
    }
    if !(export.jxl_decoding_speed_min..=export.jxl_decoding_speed_max)
        .contains(&params.jxl_decoding_speed)
    {
        return Err("JXL Decoding Speed 超出配置范围".into());
    }
    if params.ring_inner_radius < 0
        || params.ring_outer_radius <= params.ring_inner_radius
        || params.ring_outer_radius > (params.size / 2) as i32
    {
        return Err("圆环半径必须满足 0 <= 内径 < 外径 <= size/2".into());
    }
    if params.avatar_radius < 0 || params.avatar_radius > (params.size / 2) as i32 {
        return Err("图片半径必须满足 0 <= 图片半径 <= size/2".into());
    }
    if params.background_style != "solid" && !params.background_style.starts_with("asset:") {
        return Err("背景样式无效".into());
    }
    if !is_valid_hex_color(&params.background) || !is_valid_hex_color(&params.ring_color) {
        return Err("颜色必须是 #RRGGBB 或 #RRGGBBAA".into());
    }
    if !config.files.export_formats.contains(&params.export_format) {
        return Err("导出格式仅支持 png、jpg、webp 或 jxl".into());
    }

    let finite_values = [
        ("scale", params.scale),
        ("offsetX", params.offset_x),
        ("offsetY", params.offset_y),
        ("ringStretchX", params.ring_stretch_x),
        ("ringStretchY", params.ring_stretch_y),
        ("ringImageScaleX", params.ring_image_scale_x),
        ("ringImageScaleY", params.ring_image_scale_y),
        ("ringImageOffsetX", params.ring_image_offset_x),
        ("ringImageOffsetY", params.ring_image_offset_y),
        ("backgroundImageOffsetX", params.background_image_offset_x),
        ("backgroundImageOffsetY", params.background_image_offset_y),
        ("splitAngle", params.split_angle),
        ("splitHeight", params.split_height),
    ];
    if finite_values.iter().any(|(_, value)| !value.is_finite()) {
        return Err("所有数值参数必须是有限数值".into());
    }
    if !(limits.scale_min..=limits.scale_max).contains(&params.scale) {
        return Err("缩放必须介于 10 和 500 之间".into());
    }
    if !(limits.offset_min..=limits.offset_max).contains(&params.offset_x)
        || !(limits.offset_min..=limits.offset_max).contains(&params.offset_y)
    {
        return Err("偏移必须介于 -100 和 100 之间".into());
    }
    if !(limits.split_angle_min..=limits.split_angle_max).contains(&params.split_angle)
        || !(limits.split_height_min..=limits.split_height_max).contains(&params.split_height)
    {
        return Err("分割角度必须介于 0 和 359，分割高度必须介于 -100 和 100".into());
    }
    if !(limits.ring_stretch_min..=limits.ring_stretch_max).contains(&params.ring_stretch_x)
        || !(limits.ring_stretch_min..=limits.ring_stretch_max).contains(&params.ring_stretch_y)
    {
        return Err("圆环拉伸必须大于 0 且不超过 4".into());
    }
    if !(config.rings.custom_scale_min..=config.rings.custom_scale_max)
        .contains(&params.ring_image_scale_x)
        || !(config.rings.custom_scale_min..=config.rings.custom_scale_max)
            .contains(&params.ring_image_scale_y)
        || params.ring_image_offset_x.abs() > params.size as f32
        || params.ring_image_offset_y.abs() > params.size as f32
    {
        return Err("自定义圆环图片变换无效".into());
    }
    if !(config.backgrounds.offset_min..=config.backgrounds.offset_max)
        .contains(&params.background_image_offset_x)
        || !(config.backgrounds.offset_min..=config.backgrounds.offset_max)
            .contains(&params.background_image_offset_y)
    {
        return Err("自定义背景位移无效".into());
    }
    let half_size = params.size as f32 / 2.0;
    if params.ring_outer_radius as f32 * params.ring_stretch_x > half_size
        || params.ring_outer_radius as f32 * params.ring_stretch_y > half_size
    {
        return Err("拉伸后的圆环不能超出 Token 基础画布".into());
    }

    Ok(())
}

fn render_params_for_export(params: &TokenParams) -> Result<TokenParams, String> {
    let factor = params.export_size as f64 / params.size as f64;
    let scale_radius = |radius: i32| -> Result<i32, String> {
        let scaled = (radius as f64 * factor).round();
        if !scaled.is_finite() || scaled < i32::MIN as f64 || scaled > i32::MAX as f64 {
            return Err("导出尺寸导致圆环半径无效".into());
        }
        Ok(scaled as i32)
    };

    let mut render = params.clone();
    render.size = params.export_size;
    render.ring_inner_radius = scale_radius(params.ring_inner_radius)?;
    render.ring_outer_radius = scale_radius(params.ring_outer_radius)?;
    render.avatar_radius = scale_radius(params.avatar_radius)?;
    render.render_background_radius =
        Some(((params.ring_outer_radius - 1).max(0) as f64 * factor) as f32);
    render.ring_image_offset_x = params.ring_image_offset_x * factor as f32;
    render.ring_image_offset_y = params.ring_image_offset_y * factor as f32;
    render.background_image_offset_x = params.background_image_offset_x * factor as f32;
    render.background_image_offset_y = params.background_image_offset_y * factor as f32;

    if render.ring_outer_radius <= render.ring_inner_radius
        || render.ring_outer_radius > (render.size / 2) as i32
    {
        return Err("导出尺寸过小，无法保留当前圆环几何".into());
    }

    Ok(render)
}

fn plan_batch_output_paths(items: &[BatchGenerateItem], output_dir: &Path) -> Vec<PathBuf> {
    let mut occurrences = HashMap::<String, usize>::new();
    items
        .iter()
        .map(|item| {
            let input = Path::new(&item.input);
            let stem = input
                .file_stem()
                .and_then(|stem| stem.to_str())
                .filter(|stem| !stem.is_empty())
                .unwrap_or("token");
            let config = active_configuration();
            let export_format = if config
                .files
                .export_formats
                .contains(&item.params.export_format)
            {
                item.params.export_format.as_str()
            } else {
                "png"
            };
            let occurrence_key = format!("{stem}.{export_format}");
            let count = occurrences.entry(occurrence_key).or_insert(0);
            *count += 1;
            let suffix = if *count == 1 {
                String::new()
            } else {
                let number = config.export.naming.collision_start + count.saturating_sub(2);
                format!("{}{}", config.export.naming.collision_separator, number)
            };
            output_dir.join(format!("{stem}_token{suffix}.{export_format}"))
        })
        .collect()
}

fn scaled_avatar_dimensions(
    img_width: u32,
    img_height: u32,
    inner_diameter: u64,
    scale: f32,
) -> Result<(u64, u64), String> {
    if img_width == 0 || img_height == 0 {
        return Err("输入图片尺寸必须大于 0".into());
    }

    let requested_short = (inner_diameter as f64 * f64::from(scale) / 100.0).floor();
    if !requested_short.is_finite() || requested_short > u64::MAX as f64 {
        return Err("缩放后的图片尺寸无效".into());
    }
    let requested_short = (requested_short as u64).max(1);
    let (long_side, short_side) = if img_width >= img_height {
        (u64::from(img_width), u64::from(img_height))
    } else {
        (u64::from(img_height), u64::from(img_width))
    };
    let other_side = requested_short
        .checked_mul(short_side)
        .ok_or_else(|| "缩放后的图片尺寸过大".to_string())?
        .checked_div(long_side)
        .unwrap_or(0)
        .max(1);

    if img_width >= img_height {
        Ok((requested_short, other_side))
    } else {
        Ok((other_side, requested_short))
    }
}

fn offset_pixels(offset: f32, inner_diameter: u64) -> Result<i64, String> {
    let pixels = f64::from(offset) * inner_diameter as f64 / 100.0;
    if !pixels.is_finite() || pixels.abs() > i64::MAX as f64 {
        return Err("偏移量超出支持范围".into());
    }
    Ok(pixels.trunc() as i64)
}

fn calculate_canvas_size(
    scaled_width: u64,
    scaled_height: u64,
    offset_x: i64,
    offset_y: i64,
    outer_radius: i32,
    token_size: u32,
) -> Result<u32, String> {
    let offset_x_space = offset_x
        .unsigned_abs()
        .checked_mul(2)
        .ok_or_else(|| "画布尺寸溢出".to_string())?;
    let offset_y_space = offset_y
        .unsigned_abs()
        .checked_mul(2)
        .ok_or_else(|| "画布尺寸溢出".to_string())?;
    let avatar_width = scaled_width
        .checked_add(offset_x_space)
        .ok_or_else(|| "画布尺寸溢出".to_string())?;
    let avatar_height = scaled_height
        .checked_add(offset_y_space)
        .ok_or_else(|| "画布尺寸溢出".to_string())?;
    let ring_extent = u64::try_from(outer_radius)
        .map_err(|_| "圆环外径不能为负数".to_string())?
        .checked_mul(4)
        .ok_or_else(|| "画布尺寸溢出".to_string())?;
    let mut canvas_size = avatar_width
        .max(avatar_height)
        .max(ring_extent)
        .max(u64::from(token_size));

    // 保持工作画布与 Token 基础尺寸同奇偶，后续对称裁剪不会引入半像素中心偏移。
    if (canvas_size & 1) != (u64::from(token_size) & 1) {
        canvas_size = canvas_size
            .checked_add(1)
            .ok_or_else(|| "画布尺寸溢出".to_string())?;
    }

    let max_canvas = u64::from(active_configuration().export.limits.max_canvas_size);
    if canvas_size > max_canvas {
        return Err(format!("输出画布不能超过 {}px", max_canvas));
    }

    u32::try_from(canvas_size).map_err(|_| "画布尺寸无效".into())
}

#[allow(dead_code)]
fn save_layer(img: &image::RgbaImage, name: &str) {
    let directory = &active_configuration().diagnostics.log_directory;
    let _ = std::fs::create_dir_all(directory);
    let _ = img.save(Path::new(directory).join(name));
}

/// 将各图层画到统一的 500×500 画布上，保持实际位置
#[allow(dead_code)]
fn save_debug_canvas(
    bg: &image::RgbaImage,
    ring_back: &image::RgbaImage,
    avatar: &image::RgbaImage,
    ring_front: &image::RgbaImage,
    params: &TokenParams,
    output_size: u32,
) {
    let canvas_size = 500u32;
    let mut canvas = image::RgbaImage::from_pixel(canvas_size, canvas_size, Rgba([0, 0, 0, 0]));
    let scale = canvas_size as f32 / output_size as f32;

    // 辅助函数：将输出坐标的图层画到画布上（缩放并居中）
    let mut blit = |layer: &image::RgbaImage, alpha: f32| {
        if layer.width() != output_size || layer.height() != output_size {
            return;
        }
        let offset = (canvas_size as i32 - output_size as i32 * scale as i32) / 2;
        for y in 0..output_size {
            for x in 0..output_size {
                let px = layer.get_pixel(x, y);
                if px.0[3] == 0 {
                    continue;
                }
                let dx = (x as f32 * scale) as u32 + offset as u32;
                let dy = (y as f32 * scale) as u32 + offset as u32;
                if dx < canvas_size && dy < canvas_size {
                    let existing = canvas.get_pixel(dx, dy);
                    let a = px.0[3] as f32 / 255.0 * alpha;
                    let r = (px.0[0] as f32 * a + existing.0[0] as f32 * (1.0 - a)) as u8;
                    let g = (px.0[1] as f32 * a + existing.0[1] as f32 * (1.0 - a)) as u8;
                    let b = (px.0[2] as f32 * a + existing.0[2] as f32 * (1.0 - a)) as u8;
                    let out_a = (a + (1.0 - a) * existing.0[3] as f32 / 255.0).min(1.0);
                    canvas.put_pixel(dx, dy, Rgba([r, g, b, (out_a * 255.0) as u8]));
                }
            }
        }
    };

    // 合成顺序: bg → ring_back → avatar → ring_front
    blit(bg, 1.0);
    blit(ring_back, 1.0);
    blit(avatar, 1.0);
    blit(ring_front, 1.0);

    // 画参考线标记中心和内/外径
    let cx = canvas_size / 2;
    let cy = canvas_size / 2;
    let inner_r = (params.ring_inner_radius as f32 * scale) as i32;
    // 十字线
    for i in 0..canvas_size {
        let px = cx;
        if i < canvas_size {
            canvas.put_pixel(px, i, Rgba([0, 255, 0, 64]));
            canvas.put_pixel(i, px, Rgba([0, 255, 0, 64]));
        }
    }

    // 内径圆（虚线效果：每隔几个像素画一个点）
    for angle in (0..360).step_by(5) {
        let rad = angle as f32 * std::f32::consts::PI / 180.0;
        let px = (cx as f32 + rad.cos() * inner_r as f32) as u32;
        let py = (cy as f32 + rad.sin() * inner_r as f32) as u32;
        if px < canvas_size && py < canvas_size {
            canvas.put_pixel(px, py, Rgba([0, 255, 255, 200]));
        }
    }

    let _ = canvas.save(
        Path::new(&active_configuration().diagnostics.log_directory).join("debug_canvas_500.png"),
    );
}

fn log_msg(msg: &str) {
    use std::io::Write;
    let directory = &active_configuration().diagnostics.log_directory;
    let _ = std::fs::create_dir_all(directory);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(Path::new(directory).join("token.log"))
    {
        let _ = writeln!(f, "{}", msg);
    }
}

fn collect_files_internal(path: PathBuf) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = Vec::new();
    if path.is_dir() {
        for entry in WalkDir::new(&path).into_iter().filter_map(|e| e.ok()) {
            let p = entry.path();
            if p.is_file()
                && let Some(ext) = p.extension().and_then(|e| e.to_str())
                && active_configuration()
                    .files
                    .import_formats
                    .contains(&ext.to_lowercase())
            {
                files.push(p.to_path_buf());
            }
        }
    } else if path.is_file()
        && let Some(ext) = path.extension().and_then(|e| e.to_str())
        && active_configuration()
            .files
            .import_formats
            .contains(&ext.to_lowercase())
    {
        files.push(path);
    }
    files.sort();
    files.dedup();
    files
}

#[tauri::command]
pub fn collect_files(path: String) -> Vec<String> {
    let files = collect_files_internal(PathBuf::from(&path));
    files
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect()
}

fn bounds_str(img: &image::RgbaImage, label: &str) -> String {
    let (w, h) = (img.width(), img.height());
    let mut min_x = w;
    let mut min_y = h;
    let mut max_x = 0u32;
    let mut max_y = 0u32;
    for y in 0..h {
        for x in 0..w {
            if img.get_pixel(x, y).0[3] > 0 {
                if x < min_x {
                    min_x = x;
                }
                if y < min_y {
                    min_y = y;
                }
                if x > max_x {
                    max_x = x;
                }
                if y > max_y {
                    max_y = y;
                }
            }
        }
    }
    if max_x < min_x {
        return format!("{}: {}×{} all-transparent", label, w, h);
    }
    format!(
        "{}: {}×{} non-transparent=({},{})-({},{}) size={}×{} center≈({:.0},{:.0})",
        label,
        w,
        h,
        min_x,
        min_y,
        max_x,
        max_y,
        max_x - min_x + 1,
        max_y - min_y + 1,
        (min_x + max_x) as f32 / 2.0,
        (min_y + max_y) as f32 / 2.0
    )
}

fn save_as_format(
    img: &image::RgbaImage,
    params: &TokenParams,
    path: &std::path::PathBuf,
) -> Result<(), String> {
    let bytes = encode_image(img, params, &active_configuration().export)?;
    std::fs::write(path, bytes).map_err(|error| format!("写入导出文件失败: {error}"))
}

fn crop_square_around_token_centre(
    img: &image::RgbaImage,
    token_centre: u32,
    minimum_size: u32,
) -> Result<image::RgbaImage, String> {
    if img.width() != img.height() {
        return Err("导出工作画布必须为正方形".into());
    }

    if token_centre >= img.width() {
        return Err("圆环中心不在导出工作画布内".into());
    }

    let mut min_x = img.width();
    let mut min_y = img.height();
    let mut max_x = 0;
    let mut max_y = 0;
    for (x, y, pixel) in img.enumerate_pixels() {
        if pixel.0[3] > 0 {
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
        }
    }

    let mut side = minimum_size;
    if (side & 1) != (img.width() & 1) {
        side = side
            .checked_add(1)
            .ok_or_else(|| "导出尺寸溢出".to_string())?;
    }

    if max_x >= min_x {
        let left_extent = token_centre.saturating_sub(min_x);
        let top_extent = token_centre.saturating_sub(min_y);
        let right_extent = max_x.saturating_sub(token_centre);
        let bottom_extent = max_y.saturating_sub(token_centre);
        let half_extent = if (img.width() & 1) == 0 {
            left_extent
                .max(top_extent)
                .max(right_extent.saturating_add(1))
                .max(bottom_extent.saturating_add(1))
        } else {
            left_extent
                .max(top_extent)
                .max(right_extent)
                .max(bottom_extent)
        };
        let content_side = if (img.width() & 1) == 0 {
            half_extent
                .checked_mul(2)
                .ok_or_else(|| "导出尺寸溢出".to_string())?
        } else {
            half_extent
                .checked_mul(2)
                .and_then(|value| value.checked_add(1))
                .ok_or_else(|| "导出尺寸溢出".to_string())?
        };
        side = side.max(content_side);
    }

    if side > img.width() {
        return Err(format!(
            "输出画布不能超过 {}px",
            active_configuration().export.limits.max_canvas_size
        ));
    }

    let start = (img.width() - side) / 2;
    let centre_in_output = token_centre.saturating_sub(start);
    if centre_in_output != side / 2 {
        return Err("圆环中心未对齐到导出图片中心".into());
    }
    Ok(image::imageops::crop_imm(img, start, start, side, side).to_image())
}

/// 单张 Token 生成
fn process_token_with_progress<F>(
    input: &PathBuf,
    output: &PathBuf,
    params: &TokenParams,
    mut progress: F,
) -> Result<(), String>
where
    F: FnMut(ExportProgressPhase, f32),
{
    progress(ExportProgressPhase::Preparing, 0.0);
    validate_params(params)?;
    let render_params = render_params_for_export(params)?;
    let _ = std::fs::create_dir_all(&active_configuration().diagnostics.log_directory);

    let raw = image::open(input).map_err(|e| format!("打开图片失败: {}", e))?;
    // save_layer(&raw.to_rgba8(), "0_raw.png");  // debug
    let img = if active_configuration()
        .export
        .rendering
        .trim_transparent_bounds
    {
        engine::trim_to_content(&raw)
    } else {
        raw
    };
    progress(ExportProgressPhase::Decoding, 0.1);
    let (iw, ih) = (img.width(), img.height());
    // save_layer(&img.to_rgba8(), "1_trimmed.png");  // debug
    log_msg(&format!(
        "1_trimmed: {}×{} {}",
        iw,
        ih,
        bounds_str(&img.to_rgba8(), "")
    ));

    let full_ring = {
        let mut ring = image::RgbaImage::from_pixel(
            render_params.size,
            render_params.size,
            Rgba([0, 0, 0, 0]),
        );
        if let Some(asset_path) = render_params.ring_asset_path.as_deref() {
            let alpha = engine::parse_color(&render_params.ring_color).0[3];
            let source = image::open(asset_path)
                .map_err(|error| format!("打开自定义圆环失败: {error}"))?
                .to_rgba8();
            ring = rings::render_custom_ring(
                &source,
                &rings::CustomRingGeometry {
                    design_size: render_params.size,
                    inner_radius: render_params.ring_inner_radius,
                    outer_radius: render_params.ring_outer_radius,
                    image_scale_x: render_params.ring_image_scale_x,
                    image_scale_y: render_params.ring_image_scale_y,
                    image_offset_x: render_params.ring_image_offset_x,
                    image_offset_y: render_params.ring_image_offset_y,
                },
                render_params.size,
                alpha,
            )?;
        } else if render_params.ring_style == "solid"
            && render_params.ring_stretch_x == 1.0
            && render_params.ring_stretch_y == 1.0
        {
            engine::draw_solid_ring(&mut ring, &render_params);
        } else if let Some(svg) = rings::get_ring_svg(&render_params.ring_style) {
            if let Some(r) = rings::rasterize_ring_svg(
                svg,
                render_params.size,
                render_params.ring_inner_radius,
                render_params.ring_outer_radius,
                &render_params.ring_color,
                render_params.ring_stretch_x,
                render_params.ring_stretch_y,
            ) {
                ring = r;
            }
        } else if render_params.ring_inner_radius < render_params.ring_outer_radius {
            engine::draw_solid_ring(&mut ring, &render_params);
        }
        ring
    };
    // save_layer(&full_ring, "5_ring_full.png");  // debug
    log_msg(&format!("5_ring: {}", bounds_str(&full_ring, "")));

    let bg = if render_params.background_style.starts_with("asset:") {
        match render_params
            .background_asset_path
            .as_deref()
            .and_then(|path| image::open(path).ok())
        {
            Some(source) => engine::generate_custom_background(&source.to_rgba8(), &render_params)?,
            None => {
                log_msg("custom background unavailable; using solid background");
                engine::generate_background_circle(&render_params)
            }
        }
    } else {
        engine::generate_background_circle(&render_params)
    };
    progress(ExportProgressPhase::Rendering, 0.5);
    // save_layer(&bg, "6_bg.png");  // debug
    log_msg(&format!("6_bg: {}", bounds_str(&bg, "")));

    // === 通用：计算头像缩放和画布尺寸 ===
    let image_dia = u64::try_from(render_params.ring_outer_radius)
        .map_err(|_| "圆环外径不能为负数".to_string())?
        .checked_mul(2)
        .ok_or_else(|| "圆环外径过大".to_string())?
        .max(1);
    let img_w = img.width();
    let img_h = img.height();
    let (dw, dh) = scaled_avatar_dimensions(img_w, img_h, image_dia, render_params.scale)?;
    let offset_x_px = offset_pixels(render_params.offset_x, image_dia)?;
    let offset_y_px = offset_pixels(render_params.offset_y, image_dia)?;
    let output_size = calculate_canvas_size(
        dw,
        dh,
        offset_x_px,
        offset_y_px,
        render_params.ring_outer_radius,
        render_params.size,
    )?;
    let dw = u32::try_from(dw).map_err(|_| "缩放后的宽度无效".to_string())?;
    let dh = u32::try_from(dh).map_err(|_| "缩放后的高度无效".to_string())?;
    log_msg(&format!(
        "canvas: output_size={} dw={} dh={} offset=({},{}) imageDia={} outerDia={} scale={}",
        output_size,
        dw,
        dh,
        offset_x_px,
        offset_y_px,
        image_dia,
        render_params.ring_outer_radius,
        render_params.scale
    ));

    // 头像缩放到扩展画布上（保持比例，居中+偏移）
    let mut avatar_on_canvas =
        image::RgbaImage::from_pixel(output_size, output_size, Rgba([0, 0, 0, 0]));
    let cropped_rgba = img.to_rgba8();
    let scaled =
        image::imageops::resize(&cropped_rgba, dw, dh, image::imageops::FilterType::Lanczos3);
    let ax = (i64::from(output_size) / 2 - i64::from(dw) / 2 + offset_x_px).max(0) as u32;
    let ay = (i64::from(output_size) / 2 - i64::from(dh) / 2 + offset_y_px).max(0) as u32;
    image::imageops::overlay(&mut avatar_on_canvas, &scaled, ax as i64, ay as i64);
    // save_layer(&avatar_on_canvas, "3a_avatar_on_canvas.png");  // debug

    // 背景和环扩展到画布中央
    let mut bg_expanded =
        image::RgbaImage::from_pixel(output_size, output_size, Rgba([0, 0, 0, 0]));
    let mut ring_expanded =
        image::RgbaImage::from_pixel(output_size, output_size, Rgba([0, 0, 0, 0]));
    let co = (output_size as i32 - render_params.size as i32) / 2;
    image::imageops::overlay(&mut bg_expanded, &bg, co as i64, co as i64);
    image::imageops::overlay(&mut ring_expanded, &full_ring, co as i64, co as i64);

    let final_img = if render_params.split_ring {
        // 出框模式: ringBack(允许侧, 头像下方) → avatar(允许侧全图+限制侧圆内) → ringFront(限制侧, 头像上方)
        let ring_allowed = engine::mask_half_plane(
            &ring_expanded,
            render_params.split_angle,
            render_params.split_height,
            output_size,
            render_params.size,
            false,
        );
        let ring_restricted = engine::mask_half_plane(
            &ring_expanded,
            render_params.split_angle,
            render_params.split_height,
            output_size,
            render_params.size,
            true,
        );
        let avatar = engine::apply_split_ring(&avatar_on_canvas, &render_params, output_size);
        // save_debug_canvas(&bg_expanded, &ring_allowed, &avatar, &ring_restricted, params, output_size);  // debug
        engine::compose_final(&bg_expanded, &ring_allowed, &avatar, &ring_restricted)
    } else {
        // 非出框: 内径圆形蒙版头像 + 完整环在上
        let center = output_size as f32 / 2.0;
        let inner_r = render_params.avatar_radius.max(0) as f32;
        let mut avatar_masked =
            image::RgbaImage::from_pixel(output_size, output_size, Rgba([0, 0, 0, 0]));
        for y in 0..output_size {
            for x in 0..output_size {
                let dx = x as f32 + 0.5 - center;
                let dy = y as f32 + 0.5 - center;
                if dx * dx + dy * dy <= inner_r * inner_r {
                    let p = avatar_on_canvas.get_pixel(x, y);
                    if p.0[3] > 0 {
                        avatar_masked.put_pixel(x, y, *p);
                    }
                }
            }
        }

        let empty = image::RgbaImage::from_pixel(output_size, output_size, Rgba([0, 0, 0, 0]));
        engine::compose_final(&bg_expanded, &empty, &avatar_masked, &ring_expanded)
    };
    // save_layer(&final_img, "7_composed.png");  // debug
    log_msg(&format!("7_composed: {}", bounds_str(&final_img, "")));

    let centred = crop_square_around_token_centre(&final_img, output_size / 2, render_params.size)?;
    progress(ExportProgressPhase::Compositing, 0.75);
    // save_layer(&centred, "8_final.png");  // debug
    log_msg(&format!("8_final: {}", bounds_str(&centred, "")));
    log_msg(&format!(
        "output: {}  format={}",
        output.display(),
        params.export_format
    ));

    progress(ExportProgressPhase::Encoding, 0.9);
    save_as_format(&centred, params, output)?;
    Ok(())
}

fn process_token(input: &PathBuf, output: &PathBuf, params: &TokenParams) -> Result<(), String> {
    process_token_with_progress(input, output, params, |_, _| {})
}

fn randomize_export_items(items: &mut [BatchGenerateItem]) {
    let config = &active_configuration().export.random_colors;
    apply_random_colors(items, config, &mut rng(), representative_ring_color);
}

fn representative_ring_color(path: &str) -> Option<[u8; 3]> {
    let image = image::open(path).ok()?.to_rgba8();
    let mut alpha_sum = 0u64;
    let mut channels = [0u64; 3];
    for pixel in image.pixels() {
        let alpha = u64::from(pixel.0[3]);
        if alpha == 0 {
            continue;
        }
        alpha_sum += alpha;
        channels[0] += u64::from(pixel.0[0]) * alpha;
        channels[1] += u64::from(pixel.0[1]) * alpha;
        channels[2] += u64::from(pixel.0[2]) * alpha;
    }
    (alpha_sum > 0).then(|| {
        [
            (channels[0] / alpha_sum) as u8,
            (channels[1] / alpha_sum) as u8,
            (channels[2] / alpha_sum) as u8,
        ]
    })
}

#[tauri::command]
pub fn generate_single(input: String, output: String, params: TokenParams) -> GenerateResult {
    let input = PathBuf::from(&input);
    let output = PathBuf::from(&output);
    let mut items = vec![BatchGenerateItem {
        input: input.to_string_lossy().into_owned(),
        params,
    }];
    randomize_export_items(&mut items);
    let params = items.remove(0).params;

    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    match process_token(&input, &output, &params) {
        Ok(()) => GenerateResult {
            success: true,
            output_path: output.to_string_lossy().into(),
            error: None,
        },
        Err(e) => GenerateResult {
            success: false,
            output_path: String::new(),
            error: Some(e),
        },
    }
}

fn generate_batch_impl<F>(
    mut items: Vec<BatchGenerateItem>,
    output_dir: &Path,
    mut emit: F,
) -> Vec<GenerateResult>
where
    F: FnMut(ExportProgressEvent),
{
    let total = items.len();
    emit(ExportProgressEvent::Started { total });
    randomize_export_items(&mut items);
    let outputs = plan_batch_output_paths(&items, output_dir);
    let mut success_count = 0;
    let mut failure_count = 0;
    let mut results = Vec::with_capacity(total);

    for (index, (item, output)) in items.into_iter().zip(outputs).enumerate() {
        let input_label = item.input.clone();
        let result = {
            let input = PathBuf::from(item.input);
            if let Some(parent) = output.parent() {
                std::fs::create_dir_all(parent).ok();
            }

            match process_token_with_progress(
                &input,
                &output,
                &item.params,
                |phase, item_progress| {
                    emit(ExportProgressEvent::ItemProgress {
                        index,
                        total,
                        input: input_label.clone(),
                        phase,
                        item_progress,
                    });
                },
            ) {
                Ok(()) => GenerateResult {
                    success: true,
                    output_path: output.to_string_lossy().into(),
                    error: None,
                },
                Err(e) => GenerateResult {
                    success: false,
                    output_path: String::new(),
                    error: Some(e),
                },
            }
        };
        if result.success {
            success_count += 1;
        } else {
            failure_count += 1;
        }
        emit(ExportProgressEvent::ItemFinished {
            index,
            completed: index + 1,
            total,
            success: result.success,
        });
        results.push(result);
    }
    emit(ExportProgressEvent::Finished {
        completed: total,
        total,
        success_count,
        failure_count,
    });
    results
}

#[tauri::command]
pub async fn generate_token_batch(
    items: Vec<BatchGenerateItem>,
    output_dir: String,
    on_progress: Channel<ExportProgressEvent>,
) -> Result<Vec<GenerateResult>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        generate_batch_impl(items, Path::new(&output_dir), |event| {
            let _ = on_progress.send(event);
        })
    })
    .await
    .map_err(|error| format!("批量导出任务失败: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::GenericImageView;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEMPORARY_PATH_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    fn temporary_test_path(extension: &str) -> PathBuf {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let sequence = TEMPORARY_PATH_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "token-generator-test-{}-{}-{}.{}",
            std::process::id(),
            nonce,
            sequence,
            extension
        ))
    }

    fn write_test_source(path: &PathBuf) {
        image::RgbaImage::from_pixel(64, 64, Rgba([0, 180, 0, 255]))
            .save(path)
            .expect("test image");
    }

    #[test]
    fn default_params_expose_high_resolution_webp_export_settings() {
        let params = serde_json::to_value(TokenParams::default()).expect("serializable params");

        assert_eq!(params["size"], 512);
        assert_eq!(params["ringInnerRadius"], 225);
        assert_eq!(params["ringOuterRadius"], 250);
        assert_eq!(params["exportSize"], 512);
        assert_eq!(params["webpQuality"], 90);
        assert_eq!(params["webpLossless"], false);
        assert_eq!(params["jxlLossless"], false);
        assert_eq!(params["jxlDistance"], 1.0);
        assert_eq!(params["jxlEffort"], 7);
        assert_eq!(params["jxlProgressive"], true);
        assert_eq!(params["randomBackground"], false);
        assert_eq!(params["randomRingColor"], false);
    }

    #[test]
    fn derives_export_geometry_from_the_512px_design_space() {
        let render =
            render_params_for_export(&TokenParams::default()).expect("valid export params");

        assert_eq!(render.size, 512);
        assert_eq!(render.ring_inner_radius, 225);
        assert_eq!(render.ring_outer_radius, 250);
        assert_eq!(render.offset_x, 0.0);
        assert_eq!(render.split_height, 0.0);
    }

    #[test]
    fn scales_the_one_design_pixel_background_inset_for_export() {
        let params = TokenParams {
            export_size: 1024,
            ..TokenParams::default()
        };

        let render = render_params_for_export(&params).expect("valid export params");

        assert_eq!(render.ring_outer_radius, 500);
        assert_eq!(render.render_background_radius, Some(498.0));
    }

    #[test]
    fn centre_crop_uses_the_smallest_parity_preserving_square_that_contains_alpha() {
        let mut even = image::RgbaImage::from_pixel(12, 12, Rgba([0, 0, 0, 0]));
        even.put_pixel(1, 6, Rgba([255, 255, 255, 255]));
        even.put_pixel(10, 6, Rgba([255, 255, 255, 255]));
        let even_crop = crop_square_around_token_centre(&even, 6, 4).expect("even crop");
        assert_eq!(even_crop.dimensions(), (10, 10));
        assert_eq!(even_crop.get_pixel(0, 5).0[3], 255);
        assert_eq!(even_crop.get_pixel(9, 5).0[3], 255);

        let mut odd = image::RgbaImage::from_pixel(11, 11, Rgba([0, 0, 0, 0]));
        odd.put_pixel(1, 5, Rgba([255, 255, 255, 255]));
        odd.put_pixel(9, 5, Rgba([255, 255, 255, 255]));
        let odd_crop = crop_square_around_token_centre(&odd, 5, 3).expect("odd crop");
        assert_eq!(odd_crop.dimensions(), (9, 9));
        assert_eq!(odd_crop.get_pixel(0, 4).0[3], 255);
        assert_eq!(odd_crop.get_pixel(8, 4).0[3], 255);
    }

    #[test]
    fn renders_the_base_export_size_from_the_original_source() {
        let input = temporary_test_path("png");
        let output = temporary_test_path("png");
        write_test_source(&input);

        process_token(&input, &output, &TokenParams::default()).expect("export succeeds");
        let exported = image::open(&output).expect("read export");

        assert_eq!(exported.dimensions(), (512, 512));

        let _ = std::fs::remove_file(input);
        let _ = std::fs::remove_file(output);
    }

    #[test]
    fn expands_split_exports_symmetrically_around_the_ring_centre() {
        let input = temporary_test_path("png");
        let output = temporary_test_path("png");
        write_test_source(&input);
        let params = TokenParams {
            split_ring: true,
            scale: 500.0,
            ring_color: "#FF0000FF".into(),
            ..TokenParams::default()
        };

        process_token(&input, &output, &params).expect("split export succeeds");
        let exported = image::open(&output).expect("read export").to_rgba8();
        let (width, height) = exported.dimensions();
        let center = width / 2;

        assert!(width > params.export_size);
        assert_eq!(width, height);
        assert_eq!(exported.get_pixel(center, center + 249).0[0], 255);

        let _ = std::fs::remove_file(input);
        let _ = std::fs::remove_file(output);
    }

    #[test]
    fn webp_lossy_and_lossless_exports_are_decodable_and_keep_transparency() {
        let input = temporary_test_path("png");
        write_test_source(&input);

        for lossless in [false, true] {
            let output = temporary_test_path("webp");
            let params = TokenParams {
                export_format: "webp".into(),
                webp_lossless: lossless,
                webp_quality: 90,
                ..TokenParams::default()
            };

            process_token(&input, &output, &params).expect("WebP export succeeds");
            let exported = image::open(&output).expect("read WebP export").to_rgba8();

            assert_eq!(exported.dimensions(), (512, 512));
            assert_eq!(exported.get_pixel(0, 0).0[3], 0);
            assert!(exported.get_pixel(256, 6).0[3] > 0);

            let _ = std::fs::remove_file(output);
        }
        let _ = std::fs::remove_file(input);
    }

    #[test]
    fn jxl_lossy_and_lossless_exports_are_decodable_and_keep_transparency() {
        use jpegxl_rs::decode::PixelFormat;

        let input = temporary_test_path("png");
        write_test_source(&input);
        for lossless in [false, true] {
            let output = temporary_test_path("jxl");
            let params = TokenParams {
                export_format: "jxl".into(),
                jxl_lossless: lossless,
                jxl_distance: 1.0,
                jxl_effort: 7,
                jxl_progressive: true,
                ..TokenParams::default()
            };
            process_token(&input, &output, &params).expect("JXL export succeeds");
            let bytes = std::fs::read(&output).expect("read JXL export");
            let decoder = jpegxl_rs::decoder_builder()
                .pixel_format(PixelFormat {
                    num_channels: 4,
                    ..PixelFormat::default()
                })
                .build()
                .expect("create JXL decoder");
            let (metadata, pixels) = decoder.decode_with::<u8>(&bytes).expect("decode JXL");
            assert_eq!((metadata.width, metadata.height), (512, 512));
            assert_eq!(pixels.len(), 512 * 512 * 4);
            assert_eq!(pixels[3], 0);
            assert!(pixels[(6 * 512 + 256) * 4 + 3] > 0);
            let _ = std::fs::remove_file(output);
        }
        let _ = std::fs::remove_file(input);
    }

    #[test]
    fn batch_output_paths_follow_export_format_and_disambiguate_stems_in_input_order() {
        let items = ["first/avatar.png", "second/avatar.jpg", "third/avatar.webp"]
            .into_iter()
            .map(|input| BatchGenerateItem {
                input: input.into(),
                params: TokenParams {
                    export_format: "webp".into(),
                    ..TokenParams::default()
                },
            })
            .collect::<Vec<_>>();

        let paths = plan_batch_output_paths(&items, std::path::Path::new("exports"));

        assert_eq!(
            paths,
            vec![
                PathBuf::from("exports/avatar_token.webp"),
                PathBuf::from("exports/avatar_token_2.webp"),
                PathBuf::from("exports/avatar_token_3.webp"),
            ]
        );
    }

    #[test]
    fn batch_generation_uses_each_items_params_and_continues_after_invalid_entries() {
        let first_input = temporary_test_path("png");
        let invalid_input = temporary_test_path("png");
        let second_input = temporary_test_path("png");
        let output_dir = temporary_test_path("batch");
        write_test_source(&first_input);
        write_test_source(&invalid_input);
        write_test_source(&second_input);
        std::fs::create_dir_all(&output_dir).expect("batch output directory");

        let items = vec![
            BatchGenerateItem {
                input: first_input.to_string_lossy().into_owned(),
                params: TokenParams {
                    ring_color: "#FF0000FF".into(),
                    ..TokenParams::default()
                },
            },
            BatchGenerateItem {
                input: invalid_input.to_string_lossy().into_owned(),
                params: TokenParams {
                    size: 511,
                    ..TokenParams::default()
                },
            },
            BatchGenerateItem {
                input: second_input.to_string_lossy().into_owned(),
                params: TokenParams {
                    ring_color: "#0000FFFF".into(),
                    ..TokenParams::default()
                },
            },
        ];

        let mut events = Vec::new();
        let results = generate_batch_impl(items, &output_dir, |event| events.push(event));

        assert_eq!(results.len(), 3);
        assert!(results[0].success);
        assert!(!results[1].success);
        assert!(results[2].success);
        let first = image::open(&results[0].output_path)
            .expect("first batch output")
            .to_rgba8();
        let second = image::open(&results[2].output_path)
            .expect("second batch output")
            .to_rgba8();
        assert_eq!(first.get_pixel(256, 496).0[0], 255);
        assert_eq!(second.get_pixel(256, 496).0[2], 255);
        assert!(matches!(
            events.first(),
            Some(ExportProgressEvent::Started { total: 3 })
        ));
        assert_eq!(
            events
                .iter()
                .filter(|event| matches!(event, ExportProgressEvent::ItemFinished { .. }))
                .count(),
            3
        );
        assert!(matches!(
            events.last(),
            Some(ExportProgressEvent::Finished {
                completed: 3,
                total: 3,
                success_count: 2,
                failure_count: 1,
            })
        ));

        let first_progress = events
            .iter()
            .filter_map(|event| match event {
                ExportProgressEvent::ItemProgress {
                    index: 0,
                    item_progress,
                    ..
                } => Some(*item_progress),
                _ => None,
            })
            .collect::<Vec<_>>();
        assert_eq!(first_progress, vec![0.0, 0.1, 0.5, 0.75, 0.9]);

        let _ = std::fs::remove_file(first_input);
        let _ = std::fs::remove_file(invalid_input);
        let _ = std::fs::remove_file(second_input);
        let _ = std::fs::remove_dir_all(output_dir);
    }

    #[test]
    fn validation_rejects_invalid_export_colors_non_finite_and_out_of_range_values() {
        let invalid_params = [
            TokenParams {
                export_format: "gif".into(),
                ..TokenParams::default()
            },
            TokenParams {
                ring_color: "#12".into(),
                ..TokenParams::default()
            },
            TokenParams {
                background: "#12345Z".into(),
                ..TokenParams::default()
            },
            TokenParams {
                scale: f32::NAN,
                ..TokenParams::default()
            },
            TokenParams {
                scale: 501.0,
                ..TokenParams::default()
            },
            TokenParams {
                offset_x: 101.0,
                ..TokenParams::default()
            },
            TokenParams {
                split_angle: 360.0,
                ..TokenParams::default()
            },
            TokenParams {
                ring_inner_radius: 250,
                ring_outer_radius: 250,
                ..TokenParams::default()
            },
            TokenParams {
                ring_outer_radius: 257,
                ..TokenParams::default()
            },
            TokenParams {
                ring_inner_radius: 40,
                ring_outer_radius: 130,
                ring_stretch_x: 2.0,
                ..TokenParams::default()
            },
            TokenParams {
                export_size: 63,
                ..TokenParams::default()
            },
            TokenParams {
                export_size: 2049,
                ..TokenParams::default()
            },
            TokenParams {
                webp_quality: 0,
                ..TokenParams::default()
            },
            TokenParams {
                webp_quality: 101,
                ..TokenParams::default()
            },
            TokenParams {
                png_optimization_level: 7,
                ..TokenParams::default()
            },
            TokenParams {
                jpeg_quality: 0,
                ..TokenParams::default()
            },
            TokenParams {
                jpeg_chroma_subsampling: "411".into(),
                ..TokenParams::default()
            },
            TokenParams {
                webp_encoding_strength: "unknown".into(),
                ..TokenParams::default()
            },
            TokenParams {
                jxl_distance: 5.01,
                ..TokenParams::default()
            },
            TokenParams {
                jxl_decoding_speed: 5,
                ..TokenParams::default()
            },
        ];

        for params in invalid_params {
            assert!(validate_params(&params).is_err());
        }
    }

    #[test]
    fn validation_accepts_the_full_preview_wheel_scale_range() {
        for scale in [10.0, 500.0] {
            let params = TokenParams {
                scale,
                ..TokenParams::default()
            };
            assert!(
                validate_params(&params).is_ok(),
                "scale {scale} should be valid"
            );
        }
    }

    #[test]
    fn avatar_dimensions_never_round_an_extreme_aspect_ratio_down_to_zero() {
        assert_eq!(
            scaled_avatar_dimensions(1, 10_000, 20, 100.0).unwrap(),
            (1, 20)
        );
        assert_eq!(
            scaled_avatar_dimensions(10_000, 1, 20, 100.0).unwrap(),
            (20, 1)
        );
    }

    #[test]
    fn canvas_calculation_rejects_outputs_larger_than_4096() {
        let error = calculate_canvas_size(1, 1, 0, 0, 1_025, 250).unwrap_err();

        assert!(error.contains("4096"));
    }
}
