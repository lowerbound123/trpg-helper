use image::{ExtendedColorType, ImageEncoder, RgbaImage, codecs::png::PngEncoder};
use jpegxl_rs::encode::{EncoderFrame, EncoderSpeed};
use jpegxl_sys::encoder::encode::JxlEncoderFrameSettingId;
use mozjpeg_rs::{Encoder as JpegEncoder, Preset, Subsampling};
use oxipng::{Deflater, Options, StripChunks, ZopfliOptions, optimize_from_memory};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageEncodingOptions {
    pub format: String,
    pub png_optimization_level: u8,
    pub png_optimize_alpha: bool,
    pub png_preserve_metadata: bool,
    pub png_zopfli: bool,
    pub jpeg_quality: u8,
    pub jpeg_progressive: bool,
    pub jpeg_deringing: bool,
    pub jpeg_chroma_subsampling: String,
    pub webp_quality: u8,
    pub webp_lossless: bool,
    pub webp_encoding_strength: String,
    pub jxl_lossless: bool,
    pub jxl_distance: f32,
    pub jxl_effort: u8,
    pub jxl_progressive: bool,
    pub jxl_decoding_speed: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebpEncodingProfile {
    pub id: String,
    pub method: u8,
    pub passes: u8,
}

pub struct ImageEncodingContext<'a> {
    pub jpeg_matte_color: &'a str,
    pub webp_strength_profiles: &'a [WebpEncodingProfile],
}

impl ImageEncodingOptions {
    fn validate(&self) -> Result<(), String> {
        if !matches!(
            self.format.as_str(),
            "png" | "jpg" | "jpeg" | "webp" | "jxl"
        ) || self.png_optimization_level > 6
            || !(1..=100).contains(&self.jpeg_quality)
            || !matches!(self.jpeg_chroma_subsampling.as_str(), "444" | "422" | "420")
            || !(1..=100).contains(&self.webp_quality)
            || !self.jxl_distance.is_finite()
            || !(0.0..=5.0).contains(&self.jxl_distance)
            || !(1..=9).contains(&self.jxl_effort)
            || self.jxl_decoding_speed > 4
        {
            return Err("图片编码参数超出支持范围".into());
        }
        Ok(())
    }
}

pub fn encode_rgba_image(
    image: &RgbaImage,
    options: &ImageEncodingOptions,
    context: &ImageEncodingContext<'_>,
) -> Result<Vec<u8>, String> {
    options.validate()?;
    match options.format.as_str() {
        "png" => encode_png(image, options),
        "jpg" | "jpeg" => encode_jpeg(image, options, context.jpeg_matte_color),
        "webp" => encode_webp(image, options, context.webp_strength_profiles),
        "jxl" => encode_jxl(image, options),
        _ => Err("导出格式仅支持 png、jpg、webp 或 jxl".into()),
    }
}

pub fn optimize_png_bytes(data: &[u8], options: &ImageEncodingOptions) -> Result<Vec<u8>, String> {
    options.validate()?;
    let oxipng = png_options(options);
    optimize_from_memory(data, &oxipng).map_err(|error| format!("OxiPNG 优化失败: {error}"))
}

fn png_options(options: &ImageEncodingOptions) -> Options {
    let mut result = Options::from_preset(options.png_optimization_level);
    result.optimize_alpha = options.png_optimize_alpha;
    result.strip = if options.png_preserve_metadata {
        StripChunks::None
    } else {
        StripChunks::Safe
    };
    if options.png_zopfli {
        result.deflater = Deflater::Zopfli(ZopfliOptions::default());
    }
    result
}

fn encode_png(image: &RgbaImage, options: &ImageEncodingOptions) -> Result<Vec<u8>, String> {
    let mut initial = Vec::new();
    PngEncoder::new(&mut initial)
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            ExtendedColorType::Rgba8,
        )
        .map_err(|error| format!("PNG 初始编码失败: {error}"))?;
    optimize_png_bytes(&initial, options)
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
    options: &ImageEncodingOptions,
    matte_color: &str,
) -> Result<Vec<u8>, String> {
    let matte = matte_rgb(matte_color)?;
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
    let subsampling = match options.jpeg_chroma_subsampling.as_str() {
        "444" => Subsampling::S444,
        "422" => Subsampling::S422,
        "420" => Subsampling::S420,
        _ => return Err("JPEG 色度抽样仅支持 444、422 或 420".into()),
    };
    JpegEncoder::new(Preset::BaselineBalanced)
        .quality(options.jpeg_quality)
        .progressive(options.jpeg_progressive)
        .overshoot_deringing(options.jpeg_deringing)
        .subsampling(subsampling)
        .encode_rgb(&rgb, image.width(), image.height())
        .map_err(|error| format!("MozJPEG 编码失败: {error}"))
}

fn encode_webp(
    image: &RgbaImage,
    options: &ImageEncodingOptions,
    profiles: &[WebpEncodingProfile],
) -> Result<Vec<u8>, String> {
    let profile = profiles
        .iter()
        .find(|profile| profile.id == options.webp_encoding_strength)
        .ok_or_else(|| format!("未知 WebP 编码强度: {}", options.webp_encoding_strength))?;
    let mut config =
        webp::WebPConfig::new().map_err(|error| format!("创建 WebP 高级配置失败: {error:?}"))?;
    config.lossless = i32::from(options.webp_lossless);
    config.quality = f32::from(options.webp_quality);
    config.method = i32::from(profile.method);
    config.pass = i32::from(profile.passes);
    config.alpha_compression = 1;
    config.alpha_quality = 100;
    webp::Encoder::from_rgba(image.as_raw(), image.width(), image.height())
        .encode_advanced(&config)
        .map(|memory| memory.to_vec())
        .map_err(|error| format!("WebP 高级编码失败: {error:?}"))
}

fn encode_jxl(image: &RgbaImage, options: &ImageEncodingOptions) -> Result<Vec<u8>, String> {
    let speed = match options.jxl_effort {
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
    let effective_lossless = options.jxl_lossless || options.jxl_distance == 0.0;
    let mut encoder = jpegxl_rs::encoder_builder()
        .has_alpha(true)
        .lossless(effective_lossless)
        .uses_original_profile(effective_lossless)
        .quality(options.jxl_distance)
        .speed(speed)
        .decoding_speed(i64::from(options.jxl_decoding_speed))
        .build()
        .map_err(|error| format!("创建 JPEG XL 编码器失败: {error}"))?;
    let progressive = i64::from(options.jxl_progressive);
    encoder
        .set_frame_option(JxlEncoderFrameSettingId::Responsive, progressive)
        .map_err(|error| format!("设置 JPEG XL 渐进模式失败: {error}"))?;
    encoder
        .set_frame_option(JxlEncoderFrameSettingId::ProgressiveAc, progressive)
        .map_err(|error| format!("设置 JPEG XL 渐进模式失败: {error}"))?;
    encoder
        .encode_frame::<u8, u8>(
            &EncoderFrame::new(image.as_raw()).num_channels(4),
            image.width(),
            image.height(),
        )
        .map(|encoded| encoded.data)
        .map_err(|error| format!("JPEG XL 编码失败: {error}"))
}

#[cfg(test)]
mod tests {
    use super::ImageEncodingOptions;

    fn options() -> ImageEncodingOptions {
        ImageEncodingOptions {
            format: "png".into(),
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
        }
    }

    #[test]
    fn rejects_out_of_range_untrusted_encoding_options() {
        assert!(options().validate().is_ok());
        let mut invalid = options();
        invalid.png_optimization_level = 7;
        assert!(invalid.validate().is_err());
        let mut invalid = options();
        invalid.jxl_distance = f32::NAN;
        assert!(invalid.validate().is_err());
        let mut invalid = options();
        invalid.jpeg_chroma_subsampling = "411".into();
        assert!(invalid.validate().is_err());
    }
}
