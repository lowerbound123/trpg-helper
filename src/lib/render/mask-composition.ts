import Konva from 'konva'

import { appendDebugLog, readProjectFileDataUrl, type LibraryIndex } from '@/lib/backend'
import type { HandoutLayer, LayerMask } from '@/lib/handout'
import { applyLayerMaskToCanvas, createSolidMaskDataUrl, downsampleDataUrl, drawMaskEdits, loadImageFromDataUrl, maskHasPendingEdits } from '@/lib/mask'
import { editorMaskGpuRuntime } from '@/lib/mask-runtime'
import { appendSpeedLog, measureSpeed } from '@/lib/speed-log'

import { createLayerNode } from './nodes'
import { localLayer, maskedImageConfig } from './shared'
import type { ImageCache, RenderMaskOptions } from './types'

type LayerSourceCacheEntry = {
  signature: string
  canvas: HTMLCanvasElement
}

const layerSourceCanvasCache = new Map<string, LayerSourceCacheEntry>()
const MAX_LAYER_SOURCE_CANVAS_CACHE_ENTRIES = 48

function setLayerSourceCanvasCache(layerId: string, entry: LayerSourceCacheEntry) {
  layerSourceCanvasCache.delete(layerId)
  layerSourceCanvasCache.set(layerId, entry)
  while (layerSourceCanvasCache.size > MAX_LAYER_SOURCE_CANVAS_CACHE_ENTRIES) {
    const oldest = layerSourceCanvasCache.keys().next().value
    if (!oldest) break
    layerSourceCanvasCache.delete(oldest)
  }
}

export function disposeLayerSourceCanvasCache(layerIds?: Iterable<string>) {
  if (!layerIds) {
    layerSourceCanvasCache.clear()
    return
  }
  const allowed = new Set(layerIds)
  for (const layerId of layerSourceCanvasCache.keys()) {
    if (!allowed.has(layerId)) layerSourceCanvasCache.delete(layerId)
  }
}

export function layerSourceCanvasCacheSize() {
  return layerSourceCanvasCache.size
}

async function loadMaskImage(mask: LayerMask, options?: RenderMaskOptions, includeStrokes = true) {
  const inMemory = options?.maskDataUrls?.[mask.id]
  const maskPath = mask.path
  let dataUrl = inMemory || (maskPath
    ? await readProjectFileDataUrl(options?.projectTarget ?? {}, maskPath, 'image/png')
    : '')
  if (!dataUrl) dataUrl = createSolidMaskDataUrl(mask.width, mask.height, mask.defaultAlpha)
  const alreadyMaterialized = Boolean(inMemory && options?.maskRenderMode === 'export-deterministic')
  if (includeStrokes && maskHasPendingEdits(mask) && !alreadyMaterialized) {
    dataUrl = await drawMaskEdits(dataUrl, mask)
  }
  if (options?.maxMaskEdge) dataUrl = await downsampleDataUrl(dataUrl, options.maxMaskEdge)
  return loadImageFromDataUrl(dataUrl)
}

async function seedRuntimeMask(mask: LayerMask, options?: RenderMaskOptions) {
  const inMemory = options?.maskDataUrls?.[mask.id]
  const sourceKey = inMemory ? `memory:${mask.id}:${inMemory.length}` : mask.path ? `path:${mask.path}` : ''
  if (!sourceKey || editorMaskGpuRuntime.hasMaskSource(mask, sourceKey)) return
  const maskImage = await loadMaskImage(mask, options, false)
  editorMaskGpuRuntime.seedMask(mask, maskImage, sourceKey, Boolean(inMemory && options?.maskRenderMode === 'export-deterministic'))
}

function downsampleCanvasForComposite(canvas: HTMLCanvasElement, maxEdge?: number, layerId?: string) {
  if (!maxEdge) return { canvas, scale: 1 }
  const largest = Math.max(canvas.width, canvas.height)
  if (largest <= maxEdge) return { canvas, scale: 1 }
  const startedAt = performance.now()
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
  appendSpeedLog('mask-downsample-composite-source', {
    layerId,
    sourceWidth: canvas.width,
    sourceHeight: canvas.height,
    targetWidth: nextCanvas.width,
    targetHeight: nextCanvas.height,
    maxEdge,
    durationMs: Math.round(performance.now() - startedAt),
  })
  return { canvas: nextCanvas, scale }
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

async function renderLayerSourceCanvas(layer: HandoutLayer, library: LibraryIndex, cache: ImageCache) {
  const signature = layerSourceCanvasSignature(layer)
  const existing = layerSourceCanvasCache.get(layer.id)
  if (existing?.signature === signature) {
    layerSourceCanvasCache.delete(layer.id)
    layerSourceCanvasCache.set(layer.id, existing)
    appendSpeedLog('mask-source-cache-hit', {
      layerId: layer.id,
      width: existing.canvas.width,
      height: existing.canvas.height,
    })
    return existing.canvas
  }
  const canvas = await measureSpeed('mask-source-render', {
    layerId: layer.id,
    layerType: layer.type,
    width: layer.width,
    height: layer.height,
  }, () => renderLayerToLocalCanvas(layer, library, cache))
  setLayerSourceCanvasCache(layer.id, { signature, canvas })
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
    if (options?.maskRenderMode === 'export-deterministic') {
      const [fullSource, maskImage] = await Promise.all([
        renderLayerSourceCanvas(layer, library, cache),
        loadMaskImage(layer.mask, options),
      ])
      const { canvas: source, scale } = downsampleCanvasForComposite(fullSource, options?.maxCompositeEdge, layer.id)
      const masked = await measureSpeed('mask-layer-compose-canvas2d', {
        layerId: layer.id,
        maskId: layer.mask.id,
        sourceWidth: source.width,
        sourceHeight: source.height,
        sourceScale: scale,
        mode: 'export-deterministic',
      }, async () => applyLayerMaskToCanvas(source, maskImage, layer, layer.mask!, scale))
      return new Konva.Image(maskedImageConfig(layer, masked))
    }
    await seedRuntimeMask(layer.mask, options)
    const fullSource = await renderLayerSourceCanvas(layer, library, cache)
    const { canvas: source, scale } = downsampleCanvasForComposite(fullSource, options?.maxCompositeEdge, layer.id)
    const masked = await measureSpeed('mask-layer-compose', {
      layerId: layer.id,
      maskId: layer.mask.id,
      sourceWidth: source.width,
      sourceHeight: source.height,
      sourceScale: scale,
    }, () => editorMaskGpuRuntime.composeLayerAsync(layer, source, scale))
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
    await seedRuntimeMask(layer.mask, options)
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
    const fullSource = await renderLayerSourceCanvas(layer, library, cache)
    void appendDebugLog('mask', 'render-masked-layer-image-loaded', {
      layerId: layer.id,
      maskId: layer.mask.id,
      fullSource: { width: fullSource.width, height: fullSource.height },
      maskRuntime: editorMaskGpuRuntime.ensureMask(layer.mask),
    })
    const { canvas: source, scale } = downsampleCanvasForComposite(fullSource, options?.maxCompositeEdge, layer.id)
    const result = await measureSpeed('mask-layer-compose', {
      layerId: layer.id,
      maskId: layer.mask.id,
      sourceWidth: source.width,
      sourceHeight: source.height,
      sourceScale: scale,
    }, () => editorMaskGpuRuntime.composeLayerAsync(layer, source, scale))
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

function layerSourceCanvasSignature(layer: HandoutLayer) {
  const {
    x: _x,
    y: _y,
    rotation: _rotation,
    flipX: _flipX,
    opacity: _opacity,
    visible: _visible,
    blendMode: _blendMode,
    zIndex: _zIndex,
    locked: _locked,
    mask: _mask,
    ...source
  } = layer as unknown as Record<string, unknown>
  return JSON.stringify(source)
}
