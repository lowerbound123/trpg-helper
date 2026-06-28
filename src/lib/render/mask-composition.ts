import Konva from 'konva'

import { appendDebugLog, readProjectFileDataUrl, type LibraryIndex } from '@/lib/backend'
import { appConfiguration } from '@/lib/configuration'
import type { HandoutLayer, LayerMask } from '@/lib/handout'
import { applyLayerMaskToCanvas, createLayerLocalMaskCanvas, createSolidMaskDataUrl, downsampleDataUrl, drawMaskStrokes, loadImageFromDataUrl } from '@/lib/mask'

import { createLayerNode } from './nodes'
import { localLayer, maskedImageConfig } from './shared'
import type { ImageCache, RenderMaskOptions } from './types'

async function loadMaskImage(mask: LayerMask, options?: RenderMaskOptions) {
  const inMemory = options?.maskDataUrls?.[mask.id]
  const maskPath = mask.path
  let dataUrl = inMemory || (maskPath
    ? await readProjectFileDataUrl(options?.projectTarget ?? {}, maskPath, 'image/png')
    : '')
  if (!dataUrl) dataUrl = createSolidMaskDataUrl(mask.width, mask.height, mask.defaultAlpha)
  if (mask.strokes.length) dataUrl = await drawMaskStrokes(dataUrl, mask.width, mask.height, mask.strokes)
  if (options?.maxMaskEdge) dataUrl = await downsampleDataUrl(dataUrl, options.maxMaskEdge)
  return loadImageFromDataUrl(dataUrl)
}

function downsampleCanvasForComposite(canvas: HTMLCanvasElement, maxEdge?: number) {
  if (!maxEdge) return { canvas, scale: 1 }
  const largest = Math.max(canvas.width, canvas.height)
  if (largest <= maxEdge) return { canvas, scale: 1 }
  const scale = Math.max(0.01, maxEdge / largest)
  const nextCanvas = globalThis.document.createElement('canvas')
  nextCanvas.width = Math.max(1, Math.round(canvas.width * scale))
  nextCanvas.height = Math.max(1, Math.round(canvas.height * scale))
  nextCanvas.getContext('2d')?.drawImage(canvas, 0, 0, nextCanvas.width, nextCanvas.height)
  void appendDebugLog('mask', 'downsample-composite-source', {
    source: { width: canvas.width, height: canvas.height },
    target: { width: nextCanvas.width, height: nextCanvas.height },
    maxEdge,
  })
  return { canvas: nextCanvas, scale }
}

async function composeMaskedLayerCanvas(
  source: HTMLCanvasElement,
  maskImage: HTMLImageElement,
  layer: HandoutLayer,
  mask: LayerMask,
  sourceScale: number,
  options?: RenderMaskOptions,
) {
  const usePixi = options?.usePixiMaskPreview === true && appConfiguration.mask.usePixiPreview
  void appendDebugLog('mask', 'compose-masked-layer-canvas-start', {
    layerId: layer.id,
    layerType: layer.type,
    maskId: mask.id,
    usePixi,
    sourceScale,
    source: { width: source.width, height: source.height },
    maskImage: { width: maskImage.width, height: maskImage.height },
    layer: { x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotation: layer.rotation, flipX: layer.flipX },
    mask: {
      x: mask.x,
      y: mask.y,
      width: mask.width,
      height: mask.height,
      scaleX: mask.scaleX,
      scaleY: mask.scaleY,
      rotation: mask.rotation,
      flipX: mask.flipX,
      sourceVersion: mask.sourceVersion,
      version: mask.version,
    },
  })
  if (!usePixi) {
    const result = applyLayerMaskToCanvas(source, maskImage, layer, mask, sourceScale)
    void appendDebugLog('mask', 'compose-masked-layer-canvas2d-complete', {
      layerId: layer.id,
      maskId: mask.id,
      output: { width: result.width, height: result.height },
      reason: 'pixi-disabled',
    })
    return result
  }

  try {
    const localMask = createLayerLocalMaskCanvas(maskImage, layer, mask, source.width, source.height, sourceScale)
    void appendDebugLog('mask', 'compose-masked-layer-local-mask-created', {
      layerId: layer.id,
      maskId: mask.id,
      localMask: { width: localMask.width, height: localMask.height },
    })
    const { composeMaskPreview } = await import('../pixi/PixiMaskBridge')
    const result = await composeMaskPreview({
      layerId: layer.id,
      maskId: mask.id,
      sourceCanvas: source,
      localMaskCanvas: localMask,
      sourceVersion: mask.sourceVersion,
    })
    void appendDebugLog('mask', 'pixi-mask-compose-complete', {
      layerId: layer.id,
      maskId: mask.id,
      source: { width: source.width, height: source.height },
      output: { width: result.canvas.width, height: result.canvas.height },
      durationMs: result.durationMs,
    })
    return result.canvas
  } catch (error) {
    void appendDebugLog('mask', 'pixi-mask-compose-fallback-canvas2d', {
      layerId: layer.id,
      maskId: mask.id,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    })
    const fallback = applyLayerMaskToCanvas(source, maskImage, layer, mask, sourceScale)
    void appendDebugLog('mask', 'compose-masked-layer-canvas2d-complete', {
      layerId: layer.id,
      maskId: mask.id,
      output: { width: fallback.width, height: fallback.height },
      reason: 'pixi-fallback',
    })
    return fallback
  }
}

async function renderLayerToLocalCanvas(layer: HandoutLayer, library: LibraryIndex, cache: ImageCache) {
  const container = globalThis.document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-10000px'
  container.style.top = '-10000px'
  globalThis.document.body.appendChild(container)
  const stage = new Konva.Stage({
    container,
    width: Math.max(1, Math.round(layer.width)),
    height: Math.max(1, Math.round(layer.height)),
  })
  const konvaLayer = new Konva.Layer()
  stage.add(konvaLayer)
  const node = await createLayerNode(localLayer(layer), library, cache)
  if (node) konvaLayer.add(node)
  konvaLayer.draw()
  const canvas = stage.toCanvas({ pixelRatio: 1 })
  stage.destroy()
  container.remove()
  return canvas
}

async function maskedLayerImageNode(
  layer: HandoutLayer,
  library: LibraryIndex,
  cache: ImageCache,
  options?: RenderMaskOptions,
) {
  if (options?.masksEnabled === false || !layer.mask?.enabled) return createLayerNode(layer, library, cache)
  try {
    const [fullSource, maskImage] = await Promise.all([
      renderLayerToLocalCanvas(layer, library, cache),
      loadMaskImage(layer.mask, options),
    ])
    if (!maskImage) return createLayerNode(layer, library, cache)
    const { canvas: source, scale } = downsampleCanvasForComposite(fullSource, options?.maxCompositeEdge)
    const masked = await composeMaskedLayerCanvas(source, maskImage, layer, layer.mask, scale, options)
    return new Konva.Image(maskedImageConfig(layer, masked))
  } catch (error) {
    void appendDebugLog('mask', 'render-layer-mask-failed', {
      layerId: layer.id,
      maskId: layer.mask.id,
      path: layer.mask.path,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    })
    return createLayerNode(layer, library, cache)
  }
}

export async function renderMaskedLayerImage(
  layer: HandoutLayer,
  library: LibraryIndex,
  cache: ImageCache = {},
  options?: RenderMaskOptions,
) {
  if (options?.masksEnabled === false || !layer.mask?.enabled) return undefined
  try {
    void appendDebugLog('mask', 'render-masked-layer-image-start', {
      layerId: layer.id,
      layerType: layer.type,
      maskId: layer.mask.id,
      masksEnabled: options?.masksEnabled,
      usePixiMaskPreview: options?.usePixiMaskPreview,
      maxMaskEdge: options?.maxMaskEdge,
      maxCompositeEdge: options?.maxCompositeEdge,
      hasProvidedMaskDataUrl: Boolean(options?.maskDataUrls?.[layer.mask.id]),
      providedMaskDataUrlLength: options?.maskDataUrls?.[layer.mask.id]?.length || 0,
    })
    const [fullSource, maskImage] = await Promise.all([
      renderLayerToLocalCanvas(layer, library, cache),
      loadMaskImage(layer.mask, options),
    ])
    void appendDebugLog('mask', 'render-masked-layer-image-loaded', {
      layerId: layer.id,
      maskId: layer.mask.id,
      fullSource: { width: fullSource.width, height: fullSource.height },
      maskImage: maskImage ? { width: maskImage.width, height: maskImage.height } : null,
    })
    const { canvas: source, scale } = downsampleCanvasForComposite(fullSource, options?.maxCompositeEdge)
    const result = maskImage ? await composeMaskedLayerCanvas(source, maskImage, layer, layer.mask, scale, options) : undefined
    void appendDebugLog('mask', 'render-masked-layer-image-complete', {
      layerId: layer.id,
      maskId: layer.mask.id,
      result: result ? { width: result.width, height: result.height } : null,
    })
    return result
  } catch (error) {
    void appendDebugLog('mask', 'render-live-layer-mask-failed', {
      layerId: layer.id,
      maskId: layer.mask.id,
      path: layer.mask.path,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    })
    return undefined
  }
}

export { loadMaskImage, maskedLayerImageNode }
