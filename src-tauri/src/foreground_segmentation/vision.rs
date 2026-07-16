use std::{io::Cursor, path::Path, slice, time::Instant};

use image::{
    DynamicImage, GenericImageView, ImageDecoder, ImageFormat, ImageReader, imageops::FilterType,
};
use objc2::{
    AnyThread,
    rc::autoreleasepool,
    runtime::{AnyClass, AnyObject},
};
use objc2_core_video::{
    CVPixelBuffer, CVPixelBufferGetBaseAddress, CVPixelBufferGetBytesPerRow,
    CVPixelBufferGetHeight, CVPixelBufferGetPixelFormatType, CVPixelBufferGetWidth,
    CVPixelBufferLockBaseAddress, CVPixelBufferLockFlags, CVPixelBufferUnlockBaseAddress,
    kCVPixelFormatType_OneComponent32Float, kCVReturnSuccess,
};
use objc2_foundation::{NSArray, NSDictionary, NSString, NSURL};
use objc2_vision::{
    VNGenerateForegroundInstanceMaskRequest, VNImageOption, VNImageRequestHandler, VNRequest,
};

use super::engine::{SegmentationOutput, apply_soft_mask};

pub(crate) fn is_available() -> bool {
    AnyClass::get(c"VNGenerateForegroundInstanceMaskRequest").is_some()
}

pub(crate) fn segment_path(source_path: &Path) -> Result<SegmentationOutput, String> {
    if !is_available() {
        return Err("当前 macOS 版本不支持 Vision 前景实例分割".into());
    }

    autoreleasepool(|_| segment_path_inner(source_path))
}

fn segment_path_inner(source_path: &Path) -> Result<SegmentationOutput, String> {
    let decode_started = Instant::now();
    let mut decoder = ImageReader::open(source_path)
        .map_err(|error| format!("读取源图片失败 {}: {error}", source_path.display()))?
        .with_guessed_format()
        .map_err(|error| format!("图片格式识别失败: {error}"))?
        .into_decoder()
        .map_err(|error| format!("图片解码器创建失败: {error}"))?;
    let orientation = decoder
        .orientation()
        .unwrap_or(image::metadata::Orientation::NoTransforms);
    let mut image =
        DynamicImage::from_decoder(decoder).map_err(|error| format!("图片解码失败: {error}"))?;
    image.apply_orientation(orientation);
    let source = image.to_rgba8();
    let (width, height) = image.dimensions();
    let decode_ms = elapsed_ms(decode_started);

    let source_string = NSString::from_str(
        source_path
            .to_str()
            .ok_or_else(|| "Vision 输入路径不是有效 UTF-8".to_string())?,
    );
    let source_url = NSURL::fileURLWithPath(&source_string);
    let options = NSDictionary::<VNImageOption, AnyObject>::dictionary();
    let handler = unsafe {
        VNImageRequestHandler::initWithURL_options(
            VNImageRequestHandler::alloc(),
            &source_url,
            &options,
        )
    };
    let request = unsafe { VNGenerateForegroundInstanceMaskRequest::new() };
    let base_request: objc2::rc::Retained<VNRequest> = request.clone().into_super().into_super();
    let requests = NSArray::from_retained_slice(&[base_request]);

    let inference_started = Instant::now();
    handler
        .performRequests_error(&requests)
        .map_err(|error| format!("Vision 前景分割请求失败: {}", error.localizedDescription()))?;
    let observation = unsafe { request.results() }
        .and_then(|results| results.firstObject())
        .ok_or_else(|| "Vision 未返回前景实例".to_string())?;
    let instances = unsafe { observation.allInstances() };
    let mask_buffer = unsafe {
        observation
            .generateScaledMaskForImageForInstances_fromRequestHandler_error(&instances, &handler)
    }
    .map_err(|error| {
        format!(
            "Vision 前景 mask 生成失败: {}",
            error.localizedDescription()
        )
    })?;
    let inference_ms = elapsed_ms(inference_started);

    let postprocess_started = Instant::now();
    let (mask_width, mask_height, float_mask) = read_float_mask(&mask_buffer)?;
    let mask_bytes = float_mask
        .into_iter()
        .map(|value| (value.clamp(0.0, 1.0) * 255.0).round() as u8)
        .collect::<Vec<_>>();
    let mask = image::GrayImage::from_raw(mask_width, mask_height, mask_bytes)
        .ok_or_else(|| "Vision mask 像素尺寸无效".to_string())?;
    let mask = if mask_width != width || mask_height != height {
        image::imageops::resize(&mask, width, height, FilterType::Lanczos3)
    } else {
        mask
    };
    let output = apply_soft_mask(&source, mask.as_raw(), width, height)?;
    let mut png_bytes = Vec::new();
    DynamicImage::ImageRgba8(output)
        .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .map_err(|error| format!("透明 PNG 编码失败: {error}"))?;
    let postprocess_ms = elapsed_ms(postprocess_started);

    Ok(SegmentationOutput {
        png_bytes,
        width,
        height,
        model: "macos-vision".into(),
        device: "vision".into(),
        decode_ms,
        preprocess_ms: 0,
        session_load_ms: 0,
        inference_ms,
        postprocess_ms,
    })
}

fn read_float_mask(buffer: &CVPixelBuffer) -> Result<(u32, u32, Vec<f32>), String> {
    if CVPixelBufferGetPixelFormatType(buffer) != kCVPixelFormatType_OneComponent32Float {
        return Err(format!(
            "Vision 返回了不支持的 mask 像素格式: {}",
            CVPixelBufferGetPixelFormatType(buffer)
        ));
    }
    let flags = CVPixelBufferLockFlags::ReadOnly;
    let status = unsafe { CVPixelBufferLockBaseAddress(buffer, flags) };
    if status != kCVReturnSuccess {
        return Err(format!("Vision mask 内存锁定失败: {status}"));
    }

    let result = (|| {
        let width = CVPixelBufferGetWidth(buffer);
        let height = CVPixelBufferGetHeight(buffer);
        let bytes_per_row = CVPixelBufferGetBytesPerRow(buffer);
        let base = CVPixelBufferGetBaseAddress(buffer).cast::<u8>();
        if base.is_null() || bytes_per_row < width.saturating_mul(size_of::<f32>()) {
            return Err("Vision mask 内存布局无效".to_string());
        }
        let mut values = Vec::with_capacity(width.saturating_mul(height));
        for y in 0..height {
            let row = unsafe { base.add(y.saturating_mul(bytes_per_row)).cast::<f32>() };
            values.extend_from_slice(unsafe { slice::from_raw_parts(row, width) });
        }
        let width = u32::try_from(width).map_err(|_| "Vision mask 宽度超限".to_string())?;
        let height = u32::try_from(height).map_err(|_| "Vision mask 高度超限".to_string())?;
        Ok((width, height, values))
    })();

    let unlock_status = unsafe { CVPixelBufferUnlockBaseAddress(buffer, flags) };
    if unlock_status != kCVReturnSuccess {
        return Err(format!("Vision mask 内存解锁失败: {unlock_status}"));
    }
    result
}

fn elapsed_ms(started: Instant) -> u64 {
    started.elapsed().as_millis().try_into().unwrap_or(u64::MAX)
}
