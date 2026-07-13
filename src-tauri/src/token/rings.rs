use image::{Rgba, RgbaImage};
use resvg::render;
use resvg::tiny_skia::Pixmap;
use resvg::usvg::Tree;
use serde::{Deserialize, Serialize};
use usvg::Transform;

const BUILTIN_RINGS: &[(&str, &str)] = &[
    ("solid", include_str!("rings/solid.svg")),
    ("double", include_str!("rings/double.svg")),
    ("dashed", include_str!("rings/dashed.svg")),
    ("gradient_inner", include_str!("rings/gradient_inner.svg")),
    ("bevel", include_str!("rings/bevel.svg")),
    ("dots", include_str!("rings/dots.svg")),
    ("segmented", include_str!("rings/segmented.svg")),
    ("circuit", include_str!("rings/circuit.svg")),
    ("arcane", include_str!("rings/arcane.svg")),
    ("notched", include_str!("rings/notched.svg")),
    ("braided", include_str!("rings/braided.svg")),
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CustomRingGeometry {
    pub design_size: u32,
    pub inner_radius: i32,
    pub outer_radius: i32,
    pub image_scale_x: f32,
    pub image_scale_y: f32,
    pub image_offset_x: f32,
    pub image_offset_y: f32,
}

impl CustomRingGeometry {
    pub fn validate(&self) -> Result<(), String> {
        if self.design_size == 0
            || self.inner_radius < 0
            || self.outer_radius <= self.inner_radius
            || self.outer_radius > (self.design_size / 2) as i32
            || !(10.0..=500.0).contains(&self.image_scale_x)
            || !(10.0..=500.0).contains(&self.image_scale_y)
            || self.image_offset_x.abs() > self.design_size as f32
            || self.image_offset_y.abs() > self.design_size as f32
        {
            return Err("自定义圆环几何参数无效".into());
        }
        Ok(())
    }
}

pub fn get_builtin_ring_names() -> Vec<String> {
    BUILTIN_RINGS.iter().map(|(n, _)| n.to_string()).collect()
}

pub fn get_ring_svg(name: &str) -> Option<&'static str> {
    BUILTIN_RINGS
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(_, s)| *s)
}

/// 将 SVG 圆环光栅化为 RGBA 像素图
/// ring_color 替换 SVG 中的 currentColor
pub fn rasterize_ring_svg(
    svg_content: &str,
    size: u32,
    ring_inner_radius: i32,
    ring_outer_radius: i32,
    ring_color: &str,
    stretch_x: f32,
    stretch_y: f32,
) -> Option<RgbaImage> {
    let color = crate::token::engine::parse_color(ring_color);
    let rgb = format!("#{:02X}{:02X}{:02X}", color.0[0], color.0[1], color.0[2]);
    let svg = svg_content.replace("currentColor", &rgb);

    let opt = usvg::Options::default();
    let rtree = Tree::from_str(&svg, &opt).ok()?;

    let scale = size as f32 / 512.0;
    let mut pixmap = Pixmap::new(size, size)?;
    let transform = Transform::from_scale(scale, scale);
    render(&rtree, transform, &mut pixmap.as_mut());

    let rgba = RgbaImage::from_raw(size, size, pixmap.take_demultiplied())?;
    let mut output = map_to_ring_band(
        &rgba,
        ring_inner_radius,
        ring_outer_radius,
        stretch_x,
        stretch_y,
    )?;
    for pixel in output.pixels_mut() {
        pixel.0[3] = ((u16::from(pixel.0[3]) * u16::from(color.0[3]) + 127) / 255) as u8;
    }
    Some(output)
}

pub fn render_custom_ring(
    source: &RgbaImage,
    geometry: &CustomRingGeometry,
    target_size: u32,
    opacity: u8,
) -> Result<RgbaImage, String> {
    geometry.validate()?;
    if source.width() == 0 || source.height() == 0 || target_size == 0 {
        return Err("自定义圆环素材尺寸无效".into());
    }
    let factor = target_size as f32 / geometry.design_size as f32;
    let base_long = geometry.outer_radius as f32 * 2.0 * factor;
    let source_long = source.width().max(source.height()) as f32;
    let fit = base_long / source_long;
    let width = (source.width() as f32 * fit * geometry.image_scale_x / 100.0)
        .round()
        .max(1.0) as u32;
    let height = (source.height() as f32 * fit * geometry.image_scale_y / 100.0)
        .round()
        .max(1.0) as u32;
    let scaled =
        image::imageops::resize(source, width, height, image::imageops::FilterType::Lanczos3);
    let mut output = RgbaImage::new(target_size, target_size);
    let x0 =
        (target_size as i64 - width as i64) / 2 + (geometry.image_offset_x * factor).round() as i64;
    let y0 = (target_size as i64 - height as i64) / 2
        + (geometry.image_offset_y * factor).round() as i64;
    let center = target_size as f32 / 2.0;
    let inner = geometry.inner_radius as f32 * factor;
    let outer = geometry.outer_radius as f32 * factor;
    for sy in 0..height {
        for sx in 0..width {
            let x = x0 + i64::from(sx);
            let y = y0 + i64::from(sy);
            if x < 0 || y < 0 || x >= i64::from(target_size) || y >= i64::from(target_size) {
                continue;
            }
            let dx = x as f32 + 0.5 - center;
            let dy = y as f32 + 0.5 - center;
            let radius = (dx * dx + dy * dy).sqrt();
            if radius < inner || radius > outer {
                continue;
            }
            let pixel = scaled.get_pixel(sx, sy);
            let alpha = ((u16::from(pixel.0[3]) * u16::from(opacity) + 127) / 255) as u8;
            output.put_pixel(
                x as u32,
                y as u32,
                Rgba([pixel.0[0], pixel.0[1], pixel.0[2], alpha]),
            );
        }
    }
    Ok(output)
}

fn radial_alpha_bounds(image: &RgbaImage) -> Option<(f32, f32)> {
    let center = image.width() as f32 / 2.0;
    let mut inner = f32::INFINITY;
    let mut outer = 0.0f32;

    for (x, y, pixel) in image.enumerate_pixels() {
        if pixel.0[3] == 0 {
            continue;
        }
        let dx = x as f32 + 0.5 - center;
        let dy = y as f32 + 0.5 - center;
        let radius = (dx * dx + dy * dy).sqrt();
        inner = inner.min(radius);
        outer = outer.max(radius);
    }

    (inner.is_finite() && outer > inner).then_some((inner, outer))
}

fn map_to_ring_band(
    source: &RgbaImage,
    ring_inner_radius: i32,
    ring_outer_radius: i32,
    stretch_x: f32,
    stretch_y: f32,
) -> Option<RgbaImage> {
    if ring_inner_radius < 0
        || ring_outer_radius <= ring_inner_radius
        || !stretch_x.is_finite()
        || !stretch_y.is_finite()
        || stretch_x <= 0.0
        || stretch_y <= 0.0
    {
        return None;
    }
    let (source_inner, source_outer) = radial_alpha_bounds(source)?;
    let target_inner = ring_inner_radius as f32;
    let target_outer = ring_outer_radius as f32;
    let target_width = target_outer - target_inner;
    let source_width = source_outer - source_inner;
    let size = source.width();
    let center = size as f32 / 2.0;
    let mut output = RgbaImage::new(size, size);

    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 + 0.5 - center;
            let dy = y as f32 + 0.5 - center;
            let base_x = dx / stretch_x;
            let base_y = dy / stretch_y;
            let target_radius = (base_x * base_x + base_y * base_y).sqrt();
            if target_radius < target_inner || target_radius > target_outer {
                continue;
            }

            let progress = (target_radius - target_inner) / target_width;
            let source_radius = source_inner + progress * source_width;
            let source_x = (center + base_x / target_radius * source_radius).round() as i32;
            let source_y = (center + base_y / target_radius * source_radius).round() as i32;
            if source_x >= 0 && source_y >= 0 && source_x < size as i32 && source_y < size as i32 {
                output.put_pixel(x, y, *source.get_pixel(source_x as u32, source_y as u32));
            }
        }
    }

    Some(output)
}

/// 生成圆环 PNG 缩略图 (用于前端预览)
#[allow(dead_code)]
pub fn rasterize_ring_thumbnail(svg_content: &str, thumb_size: u32) -> Option<Vec<u8>> {
    let opt = usvg::Options::default();
    let rtree = Tree::from_str(svg_content, &opt).ok()?;

    let mut pixmap = Pixmap::new(thumb_size, thumb_size)?;
    let scale = thumb_size as f32 / 512.0;

    render(
        &rtree,
        Transform::from_scale(scale, scale),
        &mut pixmap.as_mut(),
    );

    pixmap.encode_png().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_svgs_are_color_independent() {
        assert_eq!(BUILTIN_RINGS.len(), 11);
        assert_eq!(
            get_builtin_ring_names(),
            vec![
                "solid",
                "double",
                "dashed",
                "gradient_inner",
                "bevel",
                "dots",
                "segmented",
                "circuit",
                "arcane",
                "notched",
                "braided",
            ]
        );
        for (name, svg) in BUILTIN_RINGS {
            assert!(svg.contains("currentColor"), "{name} must use currentColor");
            assert!(
                !svg.contains("stop-color=\"white\""),
                "{name} contains fixed white"
            );
            assert!(
                !svg.contains("stop-color=\"black\""),
                "{name} contains fixed black"
            );
        }
    }

    #[test]
    fn every_builtin_ring_has_a_distinct_visible_alpha_shape() {
        let mut signatures = std::collections::HashSet::new();
        for (name, svg) in BUILTIN_RINGS {
            let image = rasterize_ring_svg(svg, 256, 100, 125, "#000000FF", 1.0, 1.0)
                .unwrap_or_else(|| panic!("{name} rasterizes"));
            assert_eq!(
                image.get_pixel(128, 128).0[3],
                0,
                "{name} center is transparent"
            );
            let signature = image
                .pixels()
                .enumerate()
                .filter(|(_, pixel)| pixel.0[3] > 0)
                .fold((0usize, 0u64), |(count, hash), (index, pixel)| {
                    (
                        count + 1,
                        hash.wrapping_add((index as u64 + 1) * u64::from(pixel.0[3])),
                    )
                });
            assert!(signature.0 > 0, "{name} has visible pixels");
            assert!(
                signatures.insert(signature),
                "{name} has a duplicate alpha shape"
            );
        }
    }

    #[test]
    fn custom_ring_preserves_rgb_and_multiplies_alpha() {
        let mut source = RgbaImage::new(8, 4);
        source.fill(200);
        for pixel in source.pixels_mut() {
            *pixel = image::Rgba([20, 100, 220, 128]);
        }
        let config = CustomRingGeometry {
            design_size: 64,
            inner_radius: 20,
            outer_radius: 30,
            image_scale_x: 100.0,
            image_scale_y: 100.0,
            image_offset_x: 0.0,
            image_offset_y: 0.0,
        };
        let ring = render_custom_ring(&source, &config, 64, 128).unwrap();
        let visible = ring.pixels().find(|pixel| pixel.0[3] > 0).unwrap();
        assert_eq!(&visible.0[..3], &[20, 100, 220]);
        assert!((visible.0[3] as i16 - 64).abs() <= 1);
        assert_eq!(ring.get_pixel(32, 32).0[3], 0);
    }

    #[test]
    fn rasterized_pixels_are_straight_alpha_after_tiny_skia_conversion() {
        let svg = get_ring_svg("solid").expect("built-in solid SVG");
        let ring = rasterize_ring_svg(svg, 100, 40, 50, "#FF000080", 1.0, 1.0)
            .expect("solid ring rasterizes");
        let pixel = ring.get_pixel(50, 5);

        assert!(pixel.0[3] > 100 && pixel.0[3] < 150);
        assert!(
            pixel.0[0] > 240,
            "red must not remain premultiplied: {pixel:?}"
        );
        assert_eq!(pixel.0[1], 0);
        assert_eq!(pixel.0[2], 0);
    }

    #[test]
    fn non_solid_ring_maps_to_requested_band_and_stretches_from_center() {
        let svg = get_ring_svg("dots").expect("built-in dots SVG");
        let ring = rasterize_ring_svg(svg, 256, 40, 60, "#FF0000FF", 1.5, 0.5)
            .expect("dot ring rasterizes");
        let alpha_bounds = ring
            .enumerate_pixels()
            .filter(|(_, _, pixel)| pixel.0[3] > 0)
            .fold(
                None,
                |bounds: Option<(u32, u32, u32, u32)>, (x, y, _)| match bounds {
                    Some((min_x, min_y, max_x, max_y)) => {
                        Some((min_x.min(x), min_y.min(y), max_x.max(x), max_y.max(y)))
                    }
                    None => Some((x, y, x, y)),
                },
            );

        assert_eq!(ring.get_pixel(128, 128).0[3], 0, "center stays transparent");
        let (min_x, _, max_x, _) = alpha_bounds.expect("ring has visible pixels");
        assert!(
            min_x < 68 && max_x > 188,
            "horizontal stretch expands from center: {alpha_bounds:?}"
        );
        assert!(
            min_x >= 38 && max_x <= 218,
            "pixels stay inside the target outer radius: {alpha_bounds:?}"
        );
        assert_eq!(
            ring.get_pixel(128, 110).0[3],
            0,
            "inside the vertically stretched inner edge"
        );
        assert_eq!(
            ring.get_pixel(128, 95).0[3],
            0,
            "outside the vertically stretched outer edge"
        );
    }
}
