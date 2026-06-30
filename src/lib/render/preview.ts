import type { HandoutDocument } from '@/lib/handout'
import type { LibraryIndex } from '@/lib/backend'
import { appendSpeedLog } from '@/lib/speed-log'

import { compressedStageDataUrl, renderHandoutStage } from './stage'
import type { CanvasSize, ImageCache, RenderMaskOptions } from './types'
import { PREVIEW_MAX_BYTES, PREVIEW_MAX_EDGE, PREVIEW_TARGET_BYTES } from './types'

export function previewPixelRatio(size: CanvasSize, maxEdge = PREVIEW_MAX_EDGE) {
  const largest = Math.max(1, size.width, size.height)
  return Math.min(1, maxEdge / largest)
}

export function dataUrlByteSize(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] || ''
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

export async function renderHandoutPreviewToDataUrl(
  document: HandoutDocument,
  library: LibraryIndex,
  cache: ImageCache = {},
  options?: RenderMaskOptions,
) {
  const startedAt = performance.now()
  const { stage, destroy } = await renderHandoutStage(document, library, cache, options)
  const finish = (dataUrl: string, maxEdge: number, mimeType: string) => {
    appendSpeedLog('handout-preview-render', {
      canvasWidth: document.canvas.width,
      canvasHeight: document.canvas.height,
      maxEdge,
      mimeType,
      bytes: dataUrlByteSize(dataUrl),
      durationMs: Math.round(performance.now() - startedAt),
    })
    return dataUrl
  }
  try {
    let smallest = ''
    for (const maxEdge of [PREVIEW_MAX_EDGE, 240, 160]) {
      const pixelRatio = previewPixelRatio(document.canvas, maxEdge)
      const png = compressedStageDataUrl(stage, 'image/png', pixelRatio)
      if (!smallest || dataUrlByteSize(png) < dataUrlByteSize(smallest)) smallest = png
      if (dataUrlByteSize(png) <= PREVIEW_TARGET_BYTES) return finish(png, maxEdge, 'image/png')

      for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
        const webp = compressedStageDataUrl(stage, 'image/webp', pixelRatio, quality)
        if (webp.startsWith('data:image/webp')) {
          if (!smallest || dataUrlByteSize(webp) < dataUrlByteSize(smallest)) smallest = webp
          if (dataUrlByteSize(webp) <= PREVIEW_MAX_BYTES) return finish(webp, maxEdge, 'image/webp')
        }
      }

      const jpeg = compressedStageDataUrl(stage, 'image/jpeg', pixelRatio, 0.55)
      if (!smallest || dataUrlByteSize(jpeg) < dataUrlByteSize(smallest)) smallest = jpeg
      if (dataUrlByteSize(jpeg) <= PREVIEW_MAX_BYTES) return finish(jpeg, maxEdge, 'image/jpeg')
    }

    return finish(smallest, 160, 'smallest')
  } finally {
    destroy()
  }
}

export function downloadFileName(title: string, date = new Date(), extension = 'png') {
  const safeTitle = (title.trim() || 'handout')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'handout'
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    '-',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join('')
  return `${safeTitle}-${stamp}.${extension.replace(/^\./, '') || 'png'}`
}
