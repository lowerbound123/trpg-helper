import { describe, expect, it } from 'vitest'

import type { ForegroundSegmentationProgress } from './backend'
import { segmentationProgressText } from './segmentation-progress'
import type { MessageKey } from '@/i18n'

const translate = (key: MessageKey, values: Record<string, unknown> = {}) =>
  `${key}:${JSON.stringify(values)}`

function progress(patch: Partial<ForegroundSegmentationProgress>): ForegroundSegmentationProgress {
  return {
    phase: 'processing',
    stage: 'inference-start',
    current: 0,
    total: 1,
    successCount: 0,
    failureCount: 0,
    ...patch,
  }
}

describe('segmentation progress text', () => {
  it('reports model download bytes and percentage', () => {
    const text = segmentationProgressText(progress({
      phase: 'downloading',
      stage: 'model-download-progress',
      model: 'birefnet-general',
      completedBytes: 512 * 1024 * 1024,
      totalBytes: 1024 * 1024 * 1024,
    }), translate)

    expect(text).toContain('SEGMENTATION_STAGE_MODEL_DOWNLOAD_PROGRESS')
    expect(text).toContain('"percent":50')
    expect(text).toContain('"completedMiB":"512"')
  })

  it('reports the selected execution provider', () => {
    const text = segmentationProgressText(progress({
      stage: 'device-selected',
      model: 'birefnet-general',
      device: 'coreml',
    }), translate)
    expect(text).toContain('SEGMENTATION_STAGE_DEVICE_SELECTED')
    expect(text).toContain('coreml')
  })

  it('reports when persisted model verification is reused', () => {
    const text = segmentationProgressText(progress({
      phase: 'downloading',
      stage: 'model-verification-cache-hit',
      model: 'birefnet-general',
    }), translate)

    expect(text).toContain('SEGMENTATION_STAGE_MODEL_VERIFICATION_CACHE_HIT')
  })
})
