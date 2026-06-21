use std::io::Cursor;

use image::{DynamicImage, ImageFormat};

use crate::AppError;

#[derive(Debug, Clone, Copy)]
pub enum ExportImageFormat {
    Png,
    Jpeg,
    Webp,
}

impl ExportImageFormat {
    pub fn parse(value: &str) -> Result<Self, AppError> {
        match value.to_ascii_lowercase().as_str() {
            "png" | "image/png" => Ok(Self::Png),
            "jpg" | "jpeg" | "image/jpeg" => Ok(Self::Jpeg),
            "webp" | "image/webp" => Ok(Self::Webp),
            _ => Err(AppError::InvalidImageFormat(value.to_string())),
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Webp => "webp",
        }
    }
}

pub fn encode_export_image(
    input: &[u8],
    format: ExportImageFormat,
    quality: Option<u8>,
) -> Result<Vec<u8>, AppError> {
    let image = image::load_from_memory(input)?;
    match format {
        ExportImageFormat::Png => encode_png(&image),
        ExportImageFormat::Jpeg => encode_jpeg(&image, quality.unwrap_or(90)),
        ExportImageFormat::Webp => encode_webp(&image, quality.unwrap_or(90)),
    }
}

fn encode_png(image: &DynamicImage) -> Result<Vec<u8>, AppError> {
    let mut output = Cursor::new(Vec::new());
    image.write_to(&mut output, ImageFormat::Png)?;
    Ok(output.into_inner())
}

fn encode_jpeg(image: &DynamicImage, quality: u8) -> Result<Vec<u8>, AppError> {
    let mut output = Vec::new();
    let rgb = image.to_rgb8();
    let mut encoder =
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, quality.clamp(1, 100));
    encoder.encode_image(&DynamicImage::ImageRgb8(rgb))?;
    Ok(output)
}

fn encode_webp(image: &DynamicImage, quality: u8) -> Result<Vec<u8>, AppError> {
    let rgba = image.to_rgba8();
    let encoder = webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height());
    Ok(encoder.encode(quality.clamp(1, 100) as f32).to_vec())
}

pub fn normalize_export_file_name(file_name: &str, extension: &str) -> String {
    let stem = file_name
        .rsplit_once('.')
        .map(|(name, _)| name)
        .unwrap_or(file_name)
        .trim();
    let stem = if stem.is_empty() { "handout" } else { stem };
    format!("{stem}.{extension}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_png_bytes() -> Vec<u8> {
        let image = DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
            2,
            2,
            image::Rgba([255, 0, 0, 255]),
        ));
        encode_png(&image).expect("sample png")
    }

    #[test]
    fn encodes_real_webp_header() {
        let bytes = encode_export_image(&sample_png_bytes(), ExportImageFormat::Webp, Some(80))
            .expect("webp encode");
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WEBP");
    }

    #[test]
    fn encodes_real_png_header() {
        let bytes = encode_export_image(&sample_png_bytes(), ExportImageFormat::Png, None)
            .expect("png encode");
        assert_eq!(&bytes[0..8], b"\x89PNG\r\n\x1a\n");
    }
}
