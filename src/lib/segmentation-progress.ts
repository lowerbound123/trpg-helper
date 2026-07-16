import type { ForegroundSegmentationProgress } from './backend'
import type { MessageKey } from '@/i18n'

type Translate = (key: MessageKey, values?: Record<string, unknown>) => string

function formatMiB(bytes?: number | null) {
  if (bytes == null || !Number.isFinite(bytes)) return '0'
  return (bytes / 1024 / 1024).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)
}

function transferValues(progress: ForegroundSegmentationProgress) {
  const completed = progress.completedBytes ?? 0
  const total = progress.totalBytes ?? 0
  return {
    completedMiB: formatMiB(completed),
    totalMiB: formatMiB(total),
    percent: total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0,
  }
}

export function segmentationProgressText(
  progress: ForegroundSegmentationProgress,
  translate: Translate,
) {
  const values = {
    current: progress.current,
    total: progress.total,
    success: progress.successCount,
    failure: progress.failureCount,
    model: progress.model ?? '',
    device: progress.device ?? '',
    elapsed: progress.elapsedMs ?? 0,
    error: progress.error ?? '',
    ...transferValues(progress),
  }
  const stageKeys: Record<string, MessageKey> = {
    'batch-preparing': 'SEGMENTATION_STAGE_PREPARING',
    'source-validation-complete': 'SEGMENTATION_STAGE_SOURCE_READY',
    'model-cache-check': 'SEGMENTATION_STAGE_MODEL_CACHE_CHECK',
    'model-lock-wait': 'SEGMENTATION_STAGE_MODEL_LOCK_WAIT',
    'model-verify-start': 'SEGMENTATION_STAGE_MODEL_VERIFY',
    'model-verify-progress': 'SEGMENTATION_STAGE_MODEL_VERIFY_PROGRESS',
    'model-verify-complete': 'SEGMENTATION_STAGE_MODEL_VERIFY_COMPLETE',
    'model-verification-cache-hit': 'SEGMENTATION_STAGE_MODEL_VERIFICATION_CACHE_HIT',
    'model-cache-hit': 'SEGMENTATION_STAGE_MODEL_CACHE_HIT',
    'model-download-start': 'SEGMENTATION_STAGE_MODEL_DOWNLOAD_START',
    'model-download-progress': 'SEGMENTATION_STAGE_MODEL_DOWNLOAD_PROGRESS',
    'model-download-complete': 'SEGMENTATION_STAGE_MODEL_DOWNLOAD_COMPLETE',
    'source-decode-start': 'SEGMENTATION_STAGE_SOURCE_DECODE',
    'preprocess-start': 'SEGMENTATION_STAGE_PREPROCESS',
    'runtime-initialization-start': 'SEGMENTATION_STAGE_RUNTIME_INITIALIZATION',
    'runtime-initialization-complete': 'SEGMENTATION_STAGE_RUNTIME_READY',
    'device-selection-start': 'SEGMENTATION_STAGE_DEVICE_SELECTION',
    'device-available': 'SEGMENTATION_STAGE_DEVICE_AVAILABLE',
    'device-unavailable': 'SEGMENTATION_STAGE_DEVICE_UNAVAILABLE',
    'device-selected': 'SEGMENTATION_STAGE_DEVICE_SELECTED',
    'device-cache-hit': 'SEGMENTATION_STAGE_DEVICE_SELECTED',
    'device-fallback-cpu': 'SEGMENTATION_STAGE_DEVICE_FALLBACK',
    'device-session-failed': 'SEGMENTATION_STAGE_DEVICE_SESSION_FAILED',
    'coreml-compilation-required': 'SEGMENTATION_STAGE_COREML_COMPILATION_REQUIRED',
    'coreml-compilation-persisted': 'SEGMENTATION_STAGE_COREML_COMPILATION_PERSISTED',
    'coreml-native-model-ready': 'SEGMENTATION_STAGE_COREML_NATIVE_MODEL_READY',
    'session-load-start': 'SEGMENTATION_STAGE_SESSION_LOADING',
    'session-load-complete': 'SEGMENTATION_STAGE_SESSION_READY',
    'inference-start': 'SEGMENTATION_STAGE_INFERENCE',
    'vision-inference-start': 'SEGMENTATION_STAGE_INFERENCE',
    'postprocess-start': 'SEGMENTATION_STAGE_POSTPROCESS',
    'library-write-start': 'SEGMENTATION_STAGE_WRITING',
    'item-processing-failed': 'SEGMENTATION_STAGE_FAILED',
  }
  const key = stageKeys[progress.stage]
  if (key) return translate(key, values)
  return translate('SEGMENTATION_BATCH_PROGRESS', values)
}
