use image::{ExtendedColorType, ImageEncoder, RgbaImage, codecs::png::PngEncoder};
use jpegxl_rs::encode::{EncoderFrame, EncoderSpeed};
use jpegxl_sys::encoder::encode::JxlEncoderFrameSettingId;
use mozjpeg_rs::{Encoder as JpegEncoder, Preset, Subsampling};
use oxipng::{Deflater, Options, StripChunks, ZopfliOptions, optimize_from_memory};

use crate::token::{configuration::ExportConfig, types::TokenParams};

pub fn encode_image(
    image: &RgbaImage,
    params: &TokenParams,
    config: &ExportConfig,
) -> Result<Vec<u8>, String> {
    match params.export_format.as_str() {
        "png" => encode_png(image, params),
        "jpg" | "jpeg" => encode_jpeg(image, params, config),
        "webp" => encode_webp(image, params, config),
        "jxl" => encode_jxl(image, params),
        _ => Err("导出格式仅支持 png、jpg、webp 或 jxl".into()),
    }
}

fn encode_png(image: &RgbaImage, params: &TokenParams) -> Result<Vec<u8>, String> {
    let mut initial = Vec::new();
    PngEncoder::new(&mut initial)
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            ExtendedColorType::Rgba8,
        )
        .map_err(|error| format!("PNG 初始编码失败: {error}"))?;
    let mut options = Options::from_preset(params.png_optimization_level);
    options.optimize_alpha = params.png_optimize_alpha;
    options.strip = if params.png_preserve_metadata {
        StripChunks::None
    } else {
        StripChunks::Safe
    };
    if params.png_zopfli {
        options.deflater = Deflater::Zopfli(ZopfliOptions::default());
    }
    optimize_from_memory(&initial, &options).map_err(|error| format!("OxiPNG 优化失败: {error}"))
}

fn matte_rgb(value: &str) -> Result<[u8; 3], String> {
    let hex = value
        .strip_prefix('#')
        .ok_or_else(|| "JPEG 哑光颜色必须以 # 开头".to_string())?;
    if !matches!(hex.len(), 6 | 8) {
        return Err("JPEG 哑光颜色必须是 #RRGGBB 或 #RRGGBBAA".into());
    }
    let channel = |start| {
        u8::from_str_radix(&hex[start..start + 2], 16)
            .map_err(|error| format!("JPEG 哑光颜色无效: {error}"))
    };
    Ok([channel(0)?, channel(2)?, channel(4)?])
}

fn encode_jpeg(
    image: &RgbaImage,
    params: &TokenParams,
    config: &ExportConfig,
) -> Result<Vec<u8>, String> {
    let matte = matte_rgb(&config.rendering.jpeg_matte_color)?;
    let mut rgb = Vec::with_capacity(image.width() as usize * image.height() as usize * 3);
    for pixel in image.pixels() {
        let alpha = u16::from(pixel[3]);
        for channel in 0..3 {
            let value = (u16::from(pixel[channel]) * alpha
                + u16::from(matte[channel]) * (255 - alpha)
                + 127)
                / 255;
            rgb.push(value as u8);
        }
    }
    let subsampling = match params.jpeg_chroma_subsampling.as_str() {
        "444" => Subsampling::S444,
        "422" => Subsampling::S422,
        "420" => Subsampling::S420,
        _ => return Err("JPEG 色度抽样仅支持 444、422 或 420".into()),
    };
    JpegEncoder::new(Preset::BaselineBalanced)
        .quality(params.jpeg_quality)
        .progressive(params.jpeg_progressive)
        .overshoot_deringing(params.jpeg_deringing)
        .subsampling(subsampling)
        .encode_rgb(&rgb, image.width(), image.height())
        .map_err(|error| format!("MozJPEG 编码失败: {error}"))
}

fn encode_webp(
    image: &RgbaImage,
    params: &TokenParams,
    config: &ExportConfig,
) -> Result<Vec<u8>, String> {
    let profile = config
        .webp_strength_profiles
        .iter()
        .find(|profile| profile.id == params.webp_encoding_strength)
        .ok_or_else(|| format!("未知 WebP 编码强度: {}", params.webp_encoding_strength))?;
    let mut webp_config =
        webp::WebPConfig::new().map_err(|error| format!("创建 WebP 高级配置失败: {error:?}"))?;
    webp_config.lossless = i32::from(params.webp_lossless);
    webp_config.quality = f32::from(params.webp_quality);
    webp_config.method = i32::from(profile.method);
    webp_config.pass = i32::from(profile.passes);
    webp_config.alpha_compression = 1;
    webp_config.alpha_quality = 100;
    let encoder = webp::Encoder::from_rgba(image.as_raw(), image.width(), image.height());
    encoder
        .encode_advanced(&webp_config)
        .map(|memory| memory.to_vec())
        .map_err(|error| format!("WebP 高级编码失败: {error:?}"))
}

fn encode_jxl(image: &RgbaImage, params: &TokenParams) -> Result<Vec<u8>, String> {
    let speed = match params.jxl_effort {
        1 => EncoderSpeed::Lightning,
        2 => EncoderSpeed::Thunder,
        3 => EncoderSpeed::Falcon,
        4 => EncoderSpeed::Cheetah,
        5 => EncoderSpeed::Hare,
        6 => EncoderSpeed::Wombat,
        7 => EncoderSpeed::Squirrel,
        8 => EncoderSpeed::Kitten,
        9 => EncoderSpeed::Tortoise,
        _ => return Err("JXL Effort 必须介于 1 和 9 之间".into()),
    };
    let effective_lossless = params.jxl_lossless || params.jxl_distance == 0.0;
    let mut encoder = jpegxl_rs::encoder_builder()
        .has_alpha(true)
        .lossless(effective_lossless)
        .uses_original_profile(effective_lossless)
        .quality(params.jxl_distance)
        .speed(speed)
        .decoding_speed(i64::from(params.jxl_decoding_speed))
        .build()
        .map_err(|error| format!("创建 JPEG XL 编码器失败: {error}"))?;
    let progressive = i64::from(params.jxl_progressive);
    encoder
        .set_frame_option(JxlEncoderFrameSettingId::Responsive, progressive)
        .map_err(|error| format!("设置 JPEG XL 渐进模式失败: {error}"))?;
    encoder
        .set_frame_option(JxlEncoderFrameSettingId::ProgressiveAc, progressive)
        .map_err(|error| format!("设置 JPEG XL 渐进模式失败: {error}"))?;
    let frame = EncoderFrame::new(image.as_raw()).num_channels(4);
    encoder
        .encode_frame::<u8, u8>(&frame, image.width(), image.height())
        .map(|encoded| encoded.data)
        .map_err(|error| format!("JPEG XL 编码失败: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::token::configuration::active_configuration;
    use image::{GenericImageView, Rgba, RgbaImage};

    fn sample() -> RgbaImage {
        RgbaImage::from_fn(16, 12, |x, y| {
            Rgba([
                (x * 11) as u8,
                (y * 17) as u8,
                120,
                if x < 4 { 0 } else { 255 },
            ])
        })
    }

    #[test]
    fn png_levels_and_zopfli_produce_decodable_rgba() {
        for (level, zopfli) in [(0, false), (3, false), (6, true)] {
            let params = TokenParams {
                export_format: "png".into(),
                png_optimization_level: level,
                png_zopfli: zopfli,
                ..TokenParams::default()
            };
            let bytes = encode_image(&sample(), &params, &active_configuration().export).unwrap();
            let decoded = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png)
                .unwrap()
                .to_rgba8();
            assert_eq!(decoded.dimensions(), (16, 12));
            assert_eq!(decoded.get_pixel(0, 0).0[3], 0);
        }
    }

    #[test]
    fn webp_profiles_produce_decodable_output() {
        for profile in ["fast", "balanced", "strong", "maximum"] {
            let params = TokenParams {
                export_format: "webp".into(),
                webp_encoding_strength: profile.into(),
                ..TokenParams::default()
            };
            let bytes = encode_image(&sample(), &params, &active_configuration().export).unwrap();
            assert_eq!(
                image::load_from_memory(&bytes).unwrap().dimensions(),
                (16, 12)
            );
        }
    }

    fn jpeg_sof(bytes: &[u8]) -> (u8, Vec<u8>) {
        let mut index = 2;
        while index + 4 <= bytes.len() {
            if bytes[index] != 0xff {
                index += 1;
                continue;
            }
            let marker = bytes[index + 1];
            index += 2;
            if marker == 0xd8 || marker == 0xd9 || marker == 0x01 {
                continue;
            }
            let length = u16::from_be_bytes([bytes[index], bytes[index + 1]]) as usize;
            if matches!(marker, 0xc0 | 0xc2) {
                let components = usize::from(bytes[index + 7]);
                let factors = (0..components)
                    .map(|component| bytes[index + 9 + component * 3])
                    .collect();
                return (marker, factors);
            }
            index += length;
        }
        panic!("JPEG SOF marker not found");
    }

    #[test]
    fn jpeg_progressive_and_subsampling_are_encoded_by_mozjpeg() {
        for (subsampling, expected_factor) in [("444", 0x11), ("422", 0x21), ("420", 0x22)] {
            let params = TokenParams {
                export_format: "jpg".into(),
                jpeg_progressive: true,
                jpeg_chroma_subsampling: subsampling.into(),
                ..TokenParams::default()
            };
            let bytes = encode_image(&sample(), &params, &active_configuration().export).unwrap();
            let (marker, factors) = jpeg_sof(&bytes);
            assert_eq!(marker, 0xc2);
            assert_eq!(factors[0], expected_factor);
            assert_eq!(
                image::load_from_memory(&bytes).unwrap().dimensions(),
                (16, 12)
            );
        }

        let params = TokenParams {
            export_format: "jpg".into(),
            jpeg_progressive: false,
            ..TokenParams::default()
        };
        let bytes = encode_image(&sample(), &params, &active_configuration().export).unwrap();
        assert_eq!(jpeg_sof(&bytes).0, 0xc0);
        let decoded = image::load_from_memory(&bytes).unwrap().to_rgb8();
        let transparent_matte = decoded.get_pixel(0, 0).0;
        assert!(transparent_matte.iter().all(|channel| *channel > 240));
    }

    #[test]
    fn jxl_decoding_speed_and_distance_boundaries_encode() {
        use jpegxl_rs::decode::PixelFormat;

        for (distance, decoding_speed) in [(0.0, 0), (5.0, 4)] {
            let params = TokenParams {
                export_format: "jxl".into(),
                jxl_distance: distance,
                jxl_decoding_speed: decoding_speed,
                ..TokenParams::default()
            };
            let bytes = encode_image(&sample(), &params, &active_configuration().export).unwrap();
            let decoder = jpegxl_rs::decoder_builder()
                .pixel_format(PixelFormat {
                    num_channels: 4,
                    ..PixelFormat::default()
                })
                .build()
                .unwrap();
            let (metadata, pixels) = decoder.decode_with::<u8>(&bytes).unwrap();
            assert_eq!((metadata.width, metadata.height), (16, 12));
            assert_eq!(pixels.len(), 16 * 12 * 4);
        }
    }
}
