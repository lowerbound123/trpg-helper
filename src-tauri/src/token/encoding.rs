use image::RgbaImage;

use crate::services::image_encoding::{
    ImageEncodingContext, ImageEncodingOptions, WebpEncodingProfile, encode_rgba_image,
};
use crate::token::{configuration::ExportConfig, types::TokenParams};

pub fn encode_image(
    image: &RgbaImage,
    params: &TokenParams,
    config: &ExportConfig,
) -> Result<Vec<u8>, String> {
    let options = ImageEncodingOptions {
        format: params.export_format.clone(),
        png_optimization_level: params.png_optimization_level,
        png_optimize_alpha: params.png_optimize_alpha,
        png_preserve_metadata: params.png_preserve_metadata,
        png_zopfli: params.png_zopfli,
        jpeg_quality: params.jpeg_quality,
        jpeg_progressive: params.jpeg_progressive,
        jpeg_deringing: params.jpeg_deringing,
        jpeg_chroma_subsampling: params.jpeg_chroma_subsampling.clone(),
        webp_quality: params.webp_quality,
        webp_lossless: params.webp_lossless,
        webp_encoding_strength: params.webp_encoding_strength.clone(),
        jxl_lossless: params.jxl_lossless,
        jxl_distance: params.jxl_distance,
        jxl_effort: params.jxl_effort,
        jxl_progressive: params.jxl_progressive,
        jxl_decoding_speed: params.jxl_decoding_speed,
    };
    let profiles = config
        .webp_strength_profiles
        .iter()
        .map(|profile| WebpEncodingProfile {
            id: profile.id.clone(),
            method: profile.method,
            passes: profile.passes,
        })
        .collect::<Vec<_>>();
    encode_rgba_image(
        image,
        &options,
        &ImageEncodingContext {
            jpeg_matte_color: &config.rendering.jpeg_matte_color,
            webp_strength_profiles: &profiles,
        },
    )
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
