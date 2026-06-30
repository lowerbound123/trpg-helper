import Konva from 'konva'

import { appendDebugLog, type LibraryIndex } from '@/lib/backend'
import { hasVisibleEffects, konvaEffectConfig } from '@/lib/effects'
import type { HandoutDocument } from '@/lib/handout'
import { isLayerEffectivelyVisible } from '@/lib/handout'
import { applyGrayMaskToCanvas } from '@/lib/mask'
import { appendSpeedLog } from '@/lib/speed-log'

import { loadImage, resolveImageRecord } from './image-loading'
import { loadMaskImage, maskedLayerImageNode } from './mask-composition'
import type { ImageCache, RenderMaskOptions } from './types'

export async function renderHandoutToDataUrl(
  document: HandoutDocument,
  library: LibraryIndex,
  scale = 1,
  cache: ImageCache = {},
  mimeType = 'image/png',
  quality?: number,
  options?: RenderMaskOptions,
) {
  const startedAt = performance.now()
  const { stage, destroy } = await renderHandoutStage(document, library, cache, options)
  try {
    const pixelRatio = Math.max(0.1, Number(scale) || 1)
    const dataUrl = compressedStageDataUrl(stage, mimeType, pixelRatio, quality)
    appendSpeedLog('handout-render-data-url', {
      canvasWidth: document.canvas.width,
      canvasHeight: document.canvas.height,
      mimeType,
      pixelRatio,
      durationMs: Math.round(performance.now() - startedAt),
    })
    return dataUrl
  } finally {
    destroy()
  }
}

export async function renderHandoutToBlob(
  document: HandoutDocument,
  library: LibraryIndex,
  scale = 1,
  cache: ImageCache = {},
  mimeType = 'image/png',
  quality?: number,
  options?: RenderMaskOptions,
) {
  const startedAt = performance.now()
  const { stage, destroy } = await renderHandoutStage(document, library, cache, options)
  try {
    const pixelRatio = Math.max(0.1, Number(scale) || 1)
    const canvas = stage.toCanvas({
      pixelRatio,
    })
    const blob = await canvasToBlob(canvas, mimeType, quality)
    appendSpeedLog('handout-render-blob', {
      canvasWidth: document.canvas.width,
      canvasHeight: document.canvas.height,
      mimeType,
      pixelRatio,
      bytes: blob.size,
      durationMs: Math.round(performance.now() - startedAt),
    })
    return blob
  } finally {
    destroy()
  }
}

export function compressedStageDataUrl(stage: Konva.Stage, mimeType: string, pixelRatio: number, quality?: number) {
  return stage.toDataURL({
    pixelRatio,
    mimeType,
    quality,
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error(`Failed to encode ${mimeType}`))
    }, mimeType, quality)
  })
}

export async function renderHandoutStage(
  document: HandoutDocument,
  library: LibraryIndex,
  cache: ImageCache,
  options?: RenderMaskOptions,
) {
  const container = globalThis.document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-10000px'
  container.style.top = '-10000px'
  globalThis.document.body.appendChild(container)

  const stage = new Konva.Stage({
    container,
    width: document.canvas.width,
    height: document.canvas.height,
  })
  const layer = new Konva.Layer()
  const content = new Konva.Group({
    x: 0,
    y: 0,
    width: document.canvas.width,
    height: document.canvas.height,
    ...konvaEffectConfig(document.canvas.effects),
  })
  stage.add(layer)
  layer.add(content)

  if (document.canvas.backgroundVisible !== false) {
    const backgroundNodes = new Konva.Group({ x: 0, y: 0, width: document.canvas.width, height: document.canvas.height })
    backgroundNodes.add(new Konva.Rect({
      x: 0,
      y: 0,
      width: document.canvas.width,
      height: document.canvas.height,
      fill: document.canvas.backgroundColor,
    }))

    const background = resolveImageRecord(library, document.canvas.backgroundAssetId)
    if (background) {
      backgroundNodes.add(new Konva.Image({
        image: await loadImage(background, cache),
        x: 0,
        y: 0,
        width: document.canvas.width,
        height: document.canvas.height,
        listening: false,
      }))
    }
    if (options?.masksEnabled !== false && document.canvas.backgroundMask?.enabled) {
      try {
        const largestBackgroundEdge = Math.max(document.canvas.width, document.canvas.height)
        const backgroundPreviewScale = options?.maxCompositeEdge
          ? Math.min(1, options.maxCompositeEdge / largestBackgroundEdge)
          : 1
        if (backgroundPreviewScale < 1) {
          const previewWidth = Math.max(1, Math.round(document.canvas.width * backgroundPreviewScale))
          const previewHeight = Math.max(1, Math.round(document.canvas.height * backgroundPreviewScale))
          const backgroundCanvas = globalThis.document.createElement('canvas')
          backgroundCanvas.width = previewWidth
          backgroundCanvas.height = previewHeight
          const backgroundContext = backgroundCanvas.getContext('2d')
          if (backgroundContext) {
            backgroundContext.fillStyle = document.canvas.backgroundColor
            backgroundContext.fillRect(0, 0, previewWidth, previewHeight)
            if (background) {
              backgroundContext.drawImage(await loadImage(background, cache), 0, 0, previewWidth, previewHeight)
            }
          }
          const maskImage = await loadMaskImage(document.canvas.backgroundMask, options)
          void appendDebugLog('mask', 'render-background-mask-preview-composite', {
            source: { width: document.canvas.width, height: document.canvas.height },
            target: { width: previewWidth, height: previewHeight },
            maxEdge: options?.maxCompositeEdge,
          })
          content.add(new Konva.Image({
            x: 0,
            y: 0,
            width: document.canvas.width,
            height: document.canvas.height,
            image: maskImage ? applyGrayMaskToCanvas(backgroundCanvas, maskImage) : backgroundCanvas,
            listening: false,
          }))
        } else {
        const backgroundStageContainer = globalThis.document.createElement('div')
        backgroundStageContainer.style.position = 'fixed'
        backgroundStageContainer.style.left = '-10000px'
        backgroundStageContainer.style.top = '-10000px'
        globalThis.document.body.appendChild(backgroundStageContainer)
        const backgroundStage = new Konva.Stage({
          container: backgroundStageContainer,
          width: document.canvas.width,
          height: document.canvas.height,
        })
        const backgroundLayer = new Konva.Layer()
        backgroundStage.add(backgroundLayer)
        backgroundLayer.add(backgroundNodes)
        backgroundLayer.draw()
        const backgroundCanvas = backgroundStage.toCanvas({ pixelRatio: 1 })
        backgroundStage.destroy()
        backgroundStageContainer.remove()
        const maskImage = await loadMaskImage(document.canvas.backgroundMask, options)
        content.add(new Konva.Image({
          x: 0,
          y: 0,
          width: document.canvas.width,
          height: document.canvas.height,
          image: maskImage ? applyGrayMaskToCanvas(backgroundCanvas, maskImage) : backgroundCanvas,
          listening: false,
        }))
        }
      } catch (error) {
        void appendDebugLog('mask', 'render-background-mask-failed', {
          maskId: document.canvas.backgroundMask.id,
          path: document.canvas.backgroundMask.path,
          error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
        })
        content.add(backgroundNodes)
      }
    } else {
      content.add(backgroundNodes)
    }
  }

  for (const item of [...document.layers].sort((a, b) => a.zIndex - b.zIndex)) {
    if (!isLayerEffectivelyVisible(document, item)) continue
    const node = await maskedLayerImageNode(item, library, cache, options)
    if (node) content.add(node)
  }

  if (hasVisibleEffects(document.canvas.effects)) content.cache()
  layer.draw()

  return {
    stage,
    destroy: () => {
      stage.destroy()
      container.remove()
    },
  }
}
