use crate::token::types::TokenParams;
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, Rgba, RgbaImage};

/// 解析颜色字符串 "#RRGGBB" 或 "#RRGGBBAA" 为 Rgba<u8>
pub fn parse_color(hex: &str) -> Rgba<u8> {
    let hex = hex.trim_start_matches('#');
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
    let a = if hex.len() >= 8 {
        u8::from_str_radix(&hex[6..8], 16).unwrap_or(255)
    } else {
        255
    };
    Rgba([r, g, b, a])
}

/// Alpha 混合: fg over bg
pub fn alpha_blend(fg: Rgba<u8>, bg: Rgba<u8>) -> Rgba<u8> {
    let fa = fg.0[3] as f32 / 255.0;
    let ba = bg.0[3] as f32 / 255.0;
    let out_alpha = fa + ba * (1.0 - fa);
    if out_alpha <= f32::EPSILON {
        return Rgba([0, 0, 0, 0]);
    }

    let blend_channel = |foreground: u8, background: u8| {
        ((foreground as f32 * fa + background as f32 * ba * (1.0 - fa)) / out_alpha)
            .round()
            .clamp(0.0, 255.0) as u8
    };

    Rgba([
        blend_channel(fg.0[0], bg.0[0]),
        blend_channel(fg.0[1], bg.0[1]),
        blend_channel(fg.0[2], bg.0[2]),
        (out_alpha * 255.0).round().clamp(0.0, 255.0) as u8,
    ])
}

/// 根据 scale/offset 计算裁剪区域 (x, y, size, size)
/// scale=100: 图片短边映射到 token 内径 = 2*ringInnerRadius
#[allow(dead_code)]
pub fn calculate_crop_rect(
    img_width: u32,
    img_height: u32,
    scale: f32,
    offset_x: f32,
    offset_y: f32,
    ring_inner_radius: i32,
    output_size: u32,
) -> (u32, u32, u32, u32) {
    let min_dim = img_width.min(img_height) as f32;
    let inner_dia = (ring_inner_radius * 2) as f32;
    // scale=100: minDim → reference diameter (输出像素)
    // crop → outputSize (输出像素)
    // crop = minDim * outputSize / reference diameter (at scale=100)
    let crop_at_100 = min_dim * output_size as f32 / inner_dia.max(1.0);
    let mut crop_size = (crop_at_100 * 100.0 / scale.max(1.0)) as u32;
    // 钳制：crop 不能超出图片
    crop_size = crop_size.max(1).min(img_width).min(img_height);

    let center_x = img_width as f32 / 2.0;
    let center_y = img_height as f32 / 2.0;
    let offset_x_px = (offset_x / 100.0)
        * inner_dia
        * (output_size as f32 / inner_dia.max(1.0))
        * (img_width as f32 / output_size as f32);
    let offset_y_px = (offset_y / 100.0)
        * inner_dia
        * (output_size as f32 / inner_dia.max(1.0))
        * (img_height as f32 / output_size as f32);

    let x = (center_x + offset_x_px - crop_size as f32 / 2.0).max(0.0) as u32;
    let y = (center_y + offset_y_px - crop_size as f32 / 2.0).max(0.0) as u32;

    let max_x = img_width.saturating_sub(crop_size);
    let max_y = img_height.saturating_sub(crop_size);

    (x.min(max_x), y.min(max_y), crop_size, crop_size)
}

/// 裁剪图片为正方形
#[allow(dead_code)]
pub fn crop_square(img: &DynamicImage, x: u32, y: u32, size: u32) -> DynamicImage {
    img.crop_imm(x, y, size, size)
}

/// 应用圆形遮罩（透明背景）：圆形内保留头像，圆形外透明
#[allow(dead_code)]
pub fn circle_mask_avatar(img: &DynamicImage, size: u32) -> RgbaImage {
    let scaled = img.resize_exact(size, size, FilterType::Nearest);
    let mut output = RgbaImage::from_pixel(size, size, Rgba([0, 0, 0, 0]));
    let center = size as f32 / 2.0;
    let radius = size as f32 / 2.0;
    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 + 0.5 - center;
            let dy = y as f32 + 0.5 - center;
            if dx * dx + dy * dy <= radius * radius {
                output.put_pixel(x, y, scaled.get_pixel(x, y));
            }
        }
    }
    output
}

/// 绘制纯色圆环到已有图像上（使用内径/外径）
pub fn draw_solid_ring(img: &mut RgbaImage, params: &TokenParams) {
    let size = params.size;
    let center = size as f32 / 2.0;
    let inner_r = params.ring_inner_radius.max(0) as f32;
    let outer_r = params.ring_outer_radius.max(0) as f32;
    let color = parse_color(&params.ring_color);

    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 + 0.5 - center;
            let dy = y as f32 + 0.5 - center;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist >= inner_r && dist <= outer_r {
                let existing = img.get_pixel(x, y);
                let blended = alpha_blend(color, *existing);
                img.put_pixel(x, y, blended);
            }
        }
    }
}

/// 获取分割线法向量 (指向"允许侧")
/// split_angle=0 → 水平线，上方允许
fn split_normal(angle_deg: f32) -> (f32, f32) {
    // 0°=水平线上方允许, 90°=垂直线右边允许 (顺时针)
    let rad = (angle_deg - 90.0).to_radians();
    (rad.cos(), rad.sin())
}

/// 出框模式: 根据分割线分离头像
/// 允许侧 (side >= 0) — 头像完全可见（可出框）
/// 限制侧 (side < 0) — 仅内径圆形内可见
/// canvas_size: 画布尺寸（可能大于 params.size）
pub fn apply_split_ring(img: &RgbaImage, params: &TokenParams, canvas_size: u32) -> RgbaImage {
    let size = canvas_size;
    let center = size as f32 / 2.0;
    let radius = params.avatar_radius.max(0) as f32;
    let height_offset = (params.split_height / 100.0) * params.size as f32;

    let (normal_x, normal_y) = split_normal(params.split_angle);

    let mut output = RgbaImage::from_pixel(size, size, Rgba([0, 0, 0, 0]));

    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 + 0.5 - center;
            let dy = y as f32 + 0.5 - center;

            let side = normal_x * dx + normal_y * dy + height_offset;
            let in_circle = (dx * dx + dy * dy).sqrt() <= radius;

            if side >= 0.0 || in_circle {
                output.put_pixel(x, y, *img.get_pixel(x, y));
            }
        }
    }

    output
}

/// 生成背景圆形（用于出框模式的背景层）
pub fn generate_background_circle(params: &TokenParams) -> RgbaImage {
    let size = params.size;
    let bg = parse_color(&params.background);
    let center = size as f32 / 2.0;
    let radius = params
        .render_background_radius
        .unwrap_or_else(|| (params.ring_outer_radius - 1).max(0) as f32);

    let mut output = RgbaImage::from_pixel(size, size, Rgba([0, 0, 0, 0]));
    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 + 0.5 - center;
            let dy = y as f32 + 0.5 - center;
            if dx * dx + dy * dy <= radius * radius {
                output.put_pixel(x, y, bg);
            }
        }
    }
    output
}

/// Cover-fit a custom background into the outer-radius-minus-one circle.
pub fn generate_custom_background(
    source: &RgbaImage,
    params: &TokenParams,
) -> Result<RgbaImage, String> {
    if source.width() == 0 || source.height() == 0 {
        return Err("自定义背景图片为空".into());
    }
    let radius = params
        .render_background_radius
        .unwrap_or_else(|| (params.ring_outer_radius - 1).max(0) as f32);
    let diameter = radius * 2.0;
    let cover = (diameter / source.width() as f32).max(diameter / source.height() as f32);
    let width = (source.width() as f32 * cover).round().max(1.0) as u32;
    let height = (source.height() as f32 * cover).round().max(1.0) as u32;
    let resized = image::imageops::resize(source, width, height, FilterType::Lanczos3);
    let center = i64::from(params.size) / 2;
    let x = center - i64::from(width) / 2 + params.background_image_offset_x.round() as i64;
    let y = center - i64::from(height) / 2 + params.background_image_offset_y.round() as i64;
    let mut output = RgbaImage::from_pixel(params.size, params.size, Rgba([0, 0, 0, 0]));
    image::imageops::overlay(&mut output, &resized, x, y);

    let center = params.size as f32 / 2.0;
    for y in 0..params.size {
        for x in 0..params.size {
            let dx = x as f32 + 0.5 - center;
            let dy = y as f32 + 0.5 - center;
            if dx * dx + dy * dy > radius * radius {
                output.put_pixel(x, y, Rgba([0, 0, 0, 0]));
            }
        }
    }
    Ok(output)
}

/// 合成最终图像: 背景 → 圆环上层 → 头像 → 圆环下层
pub fn compose_final(
    background: &RgbaImage,
    ring_back: &RgbaImage,
    avatar: &RgbaImage,
    ring_front: &RgbaImage,
) -> RgbaImage {
    let size = avatar.width();
    let mut output = RgbaImage::from_pixel(size, size, Rgba([0, 0, 0, 0]));

    for (x, y, p) in background.enumerate_pixels() {
        output.put_pixel(x, y, *p);
    }
    for (x, y, p) in ring_back.enumerate_pixels() {
        if p.0[3] > 0 {
            let blended = alpha_blend(*p, *output.get_pixel(x, y));
            output.put_pixel(x, y, blended);
        }
    }
    for (x, y, p) in avatar.enumerate_pixels() {
        if p.0[3] > 0 {
            let blended = alpha_blend(*p, *output.get_pixel(x, y));
            output.put_pixel(x, y, blended);
        }
    }
    for (x, y, p) in ring_front.enumerate_pixels() {
        if p.0[3] > 0 {
            let blended = alpha_blend(*p, *output.get_pixel(x, y));
            output.put_pixel(x, y, blended);
        }
    }

    output
}

/// 裁剪透明边框，保留有效像素区域（居中裁正方形）
pub fn trim_to_content(img: &DynamicImage) -> DynamicImage {
    let (w, h) = (img.width(), img.height());
    let rgba = img.to_rgba8();
    let mut min_x = w;
    let mut min_y = h;
    let mut max_x = 0u32;
    let mut max_y = 0u32;

    for y in 0..h {
        for x in 0..w {
            if rgba.get_pixel(x, y).0[3] > 0 {
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
        return img.clone(); // 全透明
    }

    let content_w = max_x - min_x + 1;
    let content_h = max_y - min_y + 1;
    img.crop_imm(min_x, min_y, content_w, content_h)
}

/// 遮罩半边：将指定侧像素设为透明
/// invert=false → 保留允许侧（normal 指向侧）
/// invert=true  → 保留限制侧（normal 反向侧）
pub fn mask_half_plane(
    img: &RgbaImage,
    angle_deg: f32,
    height_pct: f32,
    size: u32,
    reference_size: u32,
    invert: bool,
) -> RgbaImage {
    let center = size as f32 / 2.0;
    let height_offset = (height_pct / 100.0) * reference_size as f32;
    let (normal_x, normal_y) = split_normal(angle_deg);

    let mut out = img.clone();
    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 + 0.5 - center;
            let dy = y as f32 + 0.5 - center;
            let side = normal_x * dx + normal_y * dy + height_offset;
            let keep = if invert { side < 0.0 } else { side >= 0.0 };
            if !keep {
                out.put_pixel(x, y, Rgba([0, 0, 0, 0]));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_params() -> TokenParams {
        TokenParams {
            size: 100,
            ring_inner_radius: 40,          // 内径
            ring_outer_radius: 50,          // 外径
            avatar_radius: 40,              // 图片裁切半径
            background: "#FFFFFFFF".into(), // 白色背景
            ring_color: "#FF0000FF".into(), // 红色圆环
            split_ring: true,
            split_angle: 0.0, // 水平分割线
            split_height: 0.0,
            ..TokenParams::default()
        }
    }

    #[test]
    fn test_parse_color_rgb() {
        assert_eq!(parse_color("#FF8040"), Rgba([255, 128, 64, 255]));
    }

    #[test]
    fn test_parse_color_rgba() {
        assert_eq!(parse_color("#FF804088"), Rgba([255, 128, 64, 136]));
    }

    #[test]
    fn alpha_blend_keeps_straight_foreground_color_over_transparent_background() {
        let blended = alpha_blend(Rgba([255, 0, 0, 128]), Rgba([0, 0, 0, 0]));

        assert_eq!(blended.0[0], 255);
        assert_eq!(blended.0[1], 0);
        assert_eq!(blended.0[2], 0);
        assert!((i16::from(blended.0[3]) - 128).abs() <= 1);
    }

    #[test]
    fn alpha_blend_unpremultiplies_over_a_semitransparent_background() {
        let blended = alpha_blend(Rgba([255, 0, 0, 128]), Rgba([0, 0, 255, 128]));

        assert!((i16::from(blended.0[0]) - 170).abs() <= 1);
        assert_eq!(blended.0[1], 0);
        assert!((i16::from(blended.0[2]) - 85).abs() <= 1);
        assert!((i16::from(blended.0[3]) - 191).abs() <= 1);
    }

    #[test]
    fn solid_ring_uses_the_requested_inner_and_outer_radii() {
        let mut params = make_test_params();
        params.size = 120;
        params.ring_inner_radius = 30;
        params.ring_outer_radius = 40;
        let mut ring = RgbaImage::from_pixel(params.size, params.size, Rgba([0, 0, 0, 0]));

        draw_solid_ring(&mut ring, &params);

        assert_eq!(ring.get_pixel(60, 30).0[3], 0, "inside the inner radius");
        assert!(ring.get_pixel(60, 25).0[3] > 0, "inside the requested band");
        assert_eq!(ring.get_pixel(60, 15).0[3], 0, "outside the outer radius");
    }

    #[test]
    fn background_uses_outer_radius_minus_one() {
        let mut params = make_test_params();
        params.size = 120;
        params.ring_inner_radius = 10;
        params.ring_outer_radius = 40;

        let background = generate_background_circle(&params);

        assert!(background.get_pixel(60, 21).0[3] > 0, "inside radius 39");
        assert_eq!(background.get_pixel(60, 20).0[3], 0, "outside radius 39");
    }

    #[test]
    fn custom_background_cover_preserves_alpha_and_circle_boundary() {
        let mut params = make_test_params();
        params.size = 120;
        params.ring_outer_radius = 40;
        let mut source = RgbaImage::from_pixel(2, 1, Rgba([0, 0, 0, 0]));
        source.put_pixel(1, 0, Rgba([255, 0, 0, 255]));

        let background = generate_custom_background(&source, &params).unwrap();

        assert!(
            background.get_pixel(60, 60).0[3] > 0,
            "cover keeps source alpha"
        );
        assert_eq!(
            background.get_pixel(60, 20).0[3],
            0,
            "outer-radius-minus-one clips the image"
        );
    }

    #[test]
    fn split_restricted_side_uses_avatar_radius_not_ring_inner_radius() {
        let mut params = make_test_params();
        params.ring_inner_radius = 10;
        params.avatar_radius = 30;
        let avatar = solid_square(params.size, Rgba([0, 0, 255, 255]));

        let masked = apply_split_ring(&avatar, &params, params.size);

        assert!(
            masked.get_pixel(50, 75).0[3] > 0,
            "restricted side keeps pixels inside avatar radius"
        );
        assert_eq!(
            masked.get_pixel(50, 85).0[3],
            0,
            "restricted side clips beyond avatar radius"
        );
        assert!(
            masked.get_pixel(50, 0).0[3] > 0,
            "allowed side ignores avatar radius"
        );
    }

    #[test]
    fn test_split_normal_0() {
        let (nx, ny) = split_normal(0.0);
        assert!((nx - 0.0).abs() < 0.01);
        assert!((ny + 1.0).abs() < 0.01);
    }

    // ===== split ring 层级测试 =====

    /// 创建纯色填充的方形测试图
    fn solid_square(size: u32, color: Rgba<u8>) -> RgbaImage {
        RgbaImage::from_pixel(size, size, color)
    }

    /// 创建圆环测试图（内径到外径填充指定颜色）
    fn ring_image(size: u32, inner_r: f32, outer_r: f32, color: Rgba<u8>) -> RgbaImage {
        let center = size as f32 / 2.0;
        let mut img = RgbaImage::from_pixel(size, size, Rgba([0, 0, 0, 0]));
        for y in 0..size {
            for x in 0..size {
                let dx = x as f32 + 0.5 - center;
                let dy = y as f32 + 0.5 - center;
                let dist = (dx * dx + dy * dy).sqrt();
                if dist >= inner_r && dist <= outer_r {
                    img.put_pixel(x, y, color);
                }
            }
        }
        img
    }

    #[test]
    fn test_split_ring_allowed_top() {
        let p = make_test_params();
        let avatar = solid_square(p.size, Rgba([0, 255, 0, 255]));
        let result = apply_split_ring(&avatar, &p, p.size);

        // 上方允许侧 (20,0): 圆外，应保留（出框）
        assert_eq!(result.get_pixel(20, 0).0[1], 255);
        // 下方限制侧 (30,99): 圆外，应透明
        assert_eq!(result.get_pixel(30, 99).0[3], 0);
    }

    #[test]
    fn test_half_plane_mask() {
        let p = make_test_params();
        let ring = ring_image(p.size, 40.0, 50.0, Rgba([255, 0, 0, 255]));
        let cx = p.size / 2;

        let allowed = mask_half_plane(&ring, p.split_angle, p.split_height, p.size, p.size, false);
        assert!(allowed.get_pixel(cx, 5).0[3] > 0, "top ring should be kept");
        assert_eq!(
            allowed.get_pixel(cx, 95).0[3],
            0,
            "bottom ring should be masked"
        );

        let restricted =
            mask_half_plane(&ring, p.split_angle, p.split_height, p.size, p.size, true);
        assert_eq!(
            restricted.get_pixel(cx, 5).0[3],
            0,
            "top ring should be masked"
        );
        assert!(
            restricted.get_pixel(cx, 95).0[3] > 0,
            "bottom ring should be kept"
        );
    }

    #[test]
    fn test_split_height_uses_token_size_on_expanded_canvas() {
        let canvas_size = 200;
        let token_size = 100;
        let image = solid_square(canvas_size, Rgba([255, 0, 0, 255]));
        let allowed = mask_half_plane(&image, 0.0, 25.0, canvas_size, token_size, false);

        assert!(
            allowed.get_pixel(100, 124).0[3] > 0,
            "positive height expands the top allowed side"
        );
        assert_eq!(
            allowed.get_pixel(100, 126).0[3],
            0,
            "height offset must use token size"
        );
    }

    #[test]
    fn test_compose_final_layer_order() {
        let p = make_test_params();
        let size = p.size;

        let bg = generate_background_circle(&p);
        let full_ring = ring_image(size, 40.0, 50.0, Rgba([255, 0, 0, 255]));
        let ring_allowed = mask_half_plane(
            &full_ring,
            p.split_angle,
            p.split_height,
            size,
            p.size,
            false,
        );
        let ring_restricted = mask_half_plane(
            &full_ring,
            p.split_angle,
            p.split_height,
            size,
            p.size,
            true,
        );

        let blue = Rgba([0, 0, 255, 255]);
        let avatar_raw = solid_square(size, blue);
        let avatar = apply_split_ring(&avatar_raw, &p, size);

        let result = compose_final(&bg, &ring_allowed, &avatar, &ring_restricted);
        let cx = size / 2;

        // 顶部出框 (20,0): 允许侧 + 圆外 → 蓝色出框
        let t = result.get_pixel(20, 0);
        assert_eq!(t.0[2], 255, "top-out: avatar blue should break out");

        // 顶部环内 (50,7): dx=0,dy=-42.5, r=42.5→环内, 允许侧 → 蓝在红前
        let tr = result.get_pixel(cx, 7);
        assert!(tr.0[2] > tr.0[0], "top-ring: blue should cover red");

        // 底部环内 (50,93): dx=0,dy=42.5, r=42.5→环内, 限制侧 → 红在蓝前
        let br = result.get_pixel(cx, 93);
        assert!(br.0[0] > br.0[2], "bot-ring: red should cover blue");

        // 底部圆外 (30,99): dx=-19.5,dy=48.5, r≈52.3>50 → 应透明
        let bo = result.get_pixel(30, 99);
        assert_eq!(bo.0[3], 0, "bot-out: should be transparent");
    }

    /// 模拟简化后的 calcDisplay: 始终全图，缩放改变显示尺寸
    fn test_calc_display(
        img_w: u32,
        img_h: u32,
        scale: f32,
        _offset_pct: f32,
        inner_dia: u32,
        output_size: u32,
        preview_size: u32,
    ) -> (u32, u32) {
        let aspect = img_w as f32 / img_h as f32;
        let base_short = preview_size * inner_dia / output_size;
        let req_short = (base_short as f32 * scale / 100.0) as u32;
        let dw = if aspect >= 1.0 {
            req_short
        } else {
            (req_short as f32 * aspect) as u32
        };
        let dh = if aspect >= 1.0 {
            (req_short as f32 / aspect) as u32
        } else {
            req_short
        };
        (dw, dh)
    }

    #[test]
    fn test_calc_display_scale_100() {
        let (dw, dh) = test_calc_display(1000, 1000, 100.0, 0.0, 220, 250, 500);
        assert_eq!(dw, 440); // baseShort = innerDia in preview
        assert_eq!(dh, 440);
    }

    #[test]
    fn test_calc_display_scale_50() {
        let (dw, dh) = test_calc_display(1000, 1000, 50.0, 0.0, 220, 250, 500);
        assert_eq!(dw, 220);
        assert_eq!(dh, 220);
    }

    #[test]
    fn test_calc_display_scale_200() {
        let (dw, dh) = test_calc_display(1000, 1000, 200.0, 0.0, 220, 250, 500);
        assert_eq!(dw, 880); // 2× innerDia, can exceed canvas
        assert_eq!(dh, 880);
    }

    #[test]
    fn test_calc_display_scale_250() {
        let (dw, dh) = test_calc_display(1000, 1000, 250.0, 0.0, 220, 250, 500);
        assert_eq!(dw, 1100); // 2.5× innerDia
        assert_eq!(dh, 1100);
    }

    #[test]
    fn test_non_split_compose() {
        // 非出框: bg(内径) → 空 → avatar(圆内) → ring
        let p = make_test_params();
        let size = p.size;

        let bg = generate_background_circle(&p); // 白色, r=40
        let full_ring = ring_image(size, 40.0, 50.0, Rgba([255, 0, 0, 255])); // 红色, r=40-50
        let empty = RgbaImage::from_pixel(size, size, Rgba([0, 0, 0, 0]));

        let blue = Rgba([0, 0, 255, 255]);
        let avatar_raw = solid_square(size, blue);
        let avatar = DynamicImage::ImageRgba8(avatar_raw);
        let avatar_circle = circle_mask_avatar(&avatar, size);

        let result = compose_final(&bg, &empty, &avatar_circle, &full_ring);
        let cx = size / 2;

        // 圆心 (50,50): r=0 → 蓝
        let cp = result.get_pixel(cx, cx);
        assert_eq!(cp.0[2], 255, "center: should be blue");

        // 环内 (50,5): dx=0.5,dy=-44.5, r≈45 → 环内 → 红盖蓝
        let rp = result.get_pixel(cx, 5);
        assert!(
            rp.0[0] > rp.0[2],
            "ring(r=45): red should cover blue (got R={} B={})",
            rp.0[0],
            rp.0[2]
        );

        // 环外 (10,10): dx=-39.5,dy=-39.5, r≈56 → 圆外 → 透明
        let op = result.get_pixel(10, 10);
        assert_eq!(op.0[3], 0, "outside(r=56): should be transparent");

        // 内径内 (50,70): dx=0.5,dy=19.5, r≈20 → 背景+头像
        let bp = result.get_pixel(cx, 70);
        assert!(bp.0[2] > 200, "bg area(r=20): avatar should show");
    }

    #[test]
    fn test_ring_centered() {
        let p = make_test_params();
        let full_ring = ring_image(p.size, 40.0, 50.0, Rgba([255, 0, 0, 255]));
        let cx = p.size / 2;
        let cy = p.size / 2;
        let top = full_ring.get_pixel(cx, cy - 45);
        let bot = full_ring.get_pixel(cx, cy + 45);
        assert!(top.0[0] > 0, "top ring");
        assert!(bot.0[0] > 0, "bot ring");
    }

    #[test]
    fn test_svg_ring_centered() {
        use crate::token::rings;
        let size = 100u32;
        let svg = rings::get_ring_svg("solid").expect("built-in solid SVG");
        let ring = rings::rasterize_ring_svg(svg, size, 40, 50, "#FF0000FF", 1.0, 1.0)
            .expect("SVG ring rendering failed");
        let cx = size / 2;
        // 检查四边对称
        let t = ring.get_pixel(cx, 6); // r≈44→环区域
        let b = ring.get_pixel(cx, 94); // r≈44→环区域
        assert!(
            t.0[0] > 10,
            "top SVG ring should have red, got R={}",
            t.0[0]
        );
        assert!(
            b.0[0] > 10,
            "bot SVG ring should have red, got R={}",
            b.0[0]
        );
        // 圆心应透明
        let c = ring.get_pixel(cx, cx);
        assert_eq!(c.0[3], 0, "center should be transparent");
    }
}
