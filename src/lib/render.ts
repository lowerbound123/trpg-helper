import Konva from 'konva'

import { appendDebugLog, fileUrl, fontRecordFamily, readProjectFileDataUrl, type LibraryIndex, type LibraryRecord } from './backend'
import { appConfiguration } from './configuration'
import { hasVisibleEffects, konvaEffectConfig } from './effects'
import type { HandoutDocument, HandoutLayer, ImageLayer, LayerMask, PaintLayer, ShapeLayer, TextLayer } from './handout'
import { isCurveShape, isLayerEffectivelyVisible } from './handout'
import { applyGrayMaskToCanvas, applyLayerMaskToCanvas, createLayerLocalMaskCanvas, downsampleDataUrl, loadImageFromDataUrl } from './mask'
import { paintSceneFunc } from './paint-rendering'
import { curveSceneFunc, lineDash, polygonPoints } from './shape-rendering'

type ImageCache = Record<string, HTMLImageElement>
type CanvasSize = { width: number; height: number }
export type ProjectFileTarget = { projectId?: string; projectDir?: string }
export type RenderMaskOptions = {
  masksEnabled?: boolean
  projectTarget?: ProjectFileTarget
  maskDataUrls?: Record<string, string>
  maxMaskEdge?: number
  maxCompositeEdge?: number
  usePixiMaskPreview?: boolean
}

const PREVIEW_TARGET_BYTES = 512 * 1024
const PREVIEW_MAX_BYTES = 1024 * 1024
const PREVIEW_MAX_EDGE = 256

function resolveImageRecord(library: LibraryIndex, assetId?: string) {
  return library.backgrounds.find((record) => record.id === assetId)
    || library.assets.find((record) => record.id === assetId)
}

function isImageLayer(layer: HandoutLayer): layer is ImageLayer {
  return layer.type === 'image'
}

function isTextLayer(layer: HandoutLayer): layer is TextLayer {
  return layer.type === 'text'
}

function isShapeLayer(layer: HandoutLayer): layer is ShapeLayer {
  return layer.type === 'shape'
}

function isPaintLayer(layer: HandoutLayer): layer is PaintLayer {
  return layer.type === 'paint'
}

function fontFamily(font: LibraryRecord) {
  return fontRecordFamily(font)
}

async function loadImage(record: LibraryRecord, cache: ImageCache) {
  if (cache[record.id]) return cache[record.id]
  const image = new window.Image()
  image.crossOrigin = 'anonymous'
  const src = fileUrl(record.path)
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`Failed to load ${record.name}`))
    image.src = src
  })
  cache[record.id] = image
  return image
}

async function loadMaskImage(mask: LayerMask, options?: RenderMaskOptions) {
  const inMemory = options?.maskDataUrls?.[mask.id]
  const maskPath = mask.highResPath || mask.path
  let dataUrl = inMemory || (maskPath
    ? await readProjectFileDataUrl(options?.projectTarget ?? {}, maskPath, 'image/png')
    : '')
  if (!dataUrl) return undefined
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
    const { composeMaskPreview } = await import('./pixi/PixiMaskBridge')
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

async function ensureFont(font: LibraryRecord) {
  if (!font.path || !('FontFace' in window)) {
    logText('render-font-load-skipped', {
      id: font.id,
      name: font.name,
      path: font.path,
      hasFontFace: 'FontFace' in window,
    })
    return
  }
  const family = fontFamily(font)
  if (Array.from(globalThis.document.fonts).some((face) => face.family === family)) {
    logText('render-font-already-loaded', {
      id: font.id,
      name: font.name,
      family,
      check: globalThis.document.fonts.check(`16px "${family}"`),
    })
    return
  }
  const source = fileUrl(font.path)
  logText('render-font-load-start', {
    id: font.id,
    name: font.name,
    family,
    recordFamily: font.fontFamily,
    mediaType: font.mediaType,
    sourceUrl: source,
  })
  try {
    const face = new FontFace(family, `url("${source}")`)
    await face.load()
    globalThis.document.fonts.add(face)
    logText('render-font-load-success', {
      id: font.id,
      name: font.name,
      family,
      status: face.status,
      check: globalThis.document.fonts.check(`16px "${family}"`),
    })
  } catch (error) {
    logText('render-font-load-failed', {
      id: font.id,
      name: font.name,
      family,
      recordFamily: font.fontFamily,
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
    })
    throw error
  }
}

function logText(message: string, data?: Record<string, unknown>) {
  console.debug(`[text] ${message}`, data)
  void appendDebugLog('text', message, data)
}

function textDecoration(layer: TextLayer) {
  return [
    layer.underline ? 'underline' : '',
    layer.strikethrough ? 'line-through' : '',
  ].filter(Boolean).join(' ')
}

function fontStyle(layer: TextLayer) {
  return [
    layer.italic ? 'italic' : '',
    `${layer.fontWeight || 400}`,
  ].filter(Boolean).join(' ')
}

function commonConfig(layer: HandoutLayer) {
  return {
    x: layer.flipX ? layer.x + layer.width / 2 : layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    offsetX: layer.flipX ? layer.width / 2 : 0,
    scaleX: layer.flipX ? -1 : 1,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    globalCompositeOperation: layer.blendMode,
    ...konvaEffectConfig(layer.effects),
  }
}

function localLayer(layer: HandoutLayer): HandoutLayer {
  return {
    ...layer,
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    visible: true,
    blendMode: 'source-over',
    flipX: false,
  } as HandoutLayer
}

function maskedImageConfig(layer: HandoutLayer, canvas: HTMLCanvasElement) {
  return {
    x: layer.flipX ? layer.x + layer.width / 2 : layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    offsetX: layer.flipX ? layer.width / 2 : 0,
    scaleX: layer.flipX ? -1 : 1,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    globalCompositeOperation: layer.blendMode,
    image: canvas,
  }
}

function shapeNode(layer: ShapeLayer) {
  const { width: _width, height: _height, ...config } = {
    ...commonConfig(layer),
    fill: layer.fill,
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth,
  }

  if (isCurveShape(layer.shape)) {
    return new Konva.Shape({
      ...config,
      width: layer.width,
      height: layer.height,
      sceneFunc: curveSceneFunc(layer),
    })
  }

  if (layer.shape === 'ellipse') {
    return new Konva.Ellipse({
      ...config,
      x: config.x + layer.width / 2,
      y: config.y + layer.height / 2,
      radiusX: layer.width / 2,
      radiusY: layer.height / 2,
    })
  }

  if (layer.shape === 'line') {
    const group = new Konva.Group(commonConfig(layer))
    const addLine = (offsetY = 0) => {
      group.add(new Konva.Line({
        points: [0, layer.height / 2 + offsetY, layer.width, layer.height / 2 + offsetY],
        stroke: layer.stroke,
        strokeWidth: layer.strokeWidth,
        dash: lineDash(layer),
        dashEnabled: layer.lineStyle === 'dashed' || layer.lineStyle === 'dotted',
        lineCap: 'round',
        lineJoin: 'round',
      }))
    }
    if (layer.lineStyle === 'double') {
      const offset = Math.max(3, layer.strokeWidth * 1.2)
      addLine(-offset)
      addLine(offset)
    } else {
      group.add(new Konva.Arrow({
        points: [0, layer.height / 2, layer.width, layer.height / 2],
        stroke: layer.stroke,
        strokeWidth: layer.strokeWidth,
        dash: lineDash(layer),
        dashEnabled: layer.lineStyle === 'dashed' || layer.lineStyle === 'dotted',
        lineCap: 'round',
        lineJoin: 'round',
        pointerAtBeginning: layer.lineStartArrow === 'triangle',
        pointerAtEnding: layer.lineEndArrow === 'triangle',
        pointerLength: Math.max(8, 16 * Math.max(0.25, layer.lineArrowSize || 1)),
        pointerWidth: Math.max(8, 14 * Math.max(0.25, layer.lineArrowSize || 1)),
      }))
    }
    addArrow(group, layer, 'start')
    addArrow(group, layer, 'end')
    return group
  }

  if (['diamond', 'hexagon-h', 'hexagon-v'].includes(layer.shape)) {
    return new Konva.Line({
      ...config,
      points: polygonPoints(layer),
      closed: true,
    })
  }

  if (layer.shape === 'round-rect') {
    return new Konva.Rect({
      ...config,
      width: layer.width,
      height: layer.height,
      cornerRadius: layer.cornerRadius,
    })
  }

  return new Konva.Rect({
    ...config,
    width: layer.width,
    height: layer.height,
  })
}

function paintNode(layer: PaintLayer) {
  return new Konva.Shape({
    ...commonConfig(layer),
    sceneFunc: paintSceneFunc(layer),
  })
}

function addArrow(group: Konva.Group, layer: ShapeLayer, side: 'start' | 'end') {
  const kind = side === 'start' ? layer.lineStartArrow : layer.lineEndArrow
  if (kind === 'none' || (kind === 'triangle' && layer.lineStyle !== 'double')) return
  const y = layer.height / 2
  const size = Math.max(8, 16 * Math.max(0.25, layer.lineArrowSize || 1))
  const x = side === 'start' ? 0 : layer.width
  const direction = side === 'start' ? 1 : -1
  if (kind === 'dot') {
    group.add(new Konva.Circle({
      x,
      y,
      radius: Math.max(4, layer.strokeWidth * 1.8) * Math.max(0.25, layer.lineArrowSize || 1),
      fill: layer.stroke,
    }))
    return
  }
  const points = kind === 'triangle'
    ? [x, y, x + direction * size, y - size * 0.55, x + direction * size, y + size * 0.55]
    : kind === 'notched'
      ? [x, y, x + direction * size, y - size * 0.58, x + direction * size * 0.62, y, x + direction * size, y + size * 0.58]
      : [x, y - size * 0.6, x, y + size * 0.6]
  group.add(new Konva.Line({
    points,
    fill: kind === 'triangle' || kind === 'notched' ? layer.stroke : undefined,
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth,
    closed: kind === 'triangle' || kind === 'notched',
  }))
}

function prepareEffectNode<T extends Konva.Shape | Konva.Group>(node: T, effects?: HandoutLayer['effects']) {
  if (hasVisibleEffects(effects)) node.cache()
  return node
}

async function createLayerNode(layer: HandoutLayer, library: LibraryIndex, cache: ImageCache) {
  if (isImageLayer(layer)) {
    const record = resolveImageRecord(library, layer.assetId)
    if (!record) return undefined
    return prepareEffectNode(new Konva.Image({
      ...commonConfig(layer),
      image: await loadImage(record, cache),
    }), layer.effects)
  }
  if (isTextLayer(layer)) {
    const font = library.fonts.find((record) => record.id === layer.fontId)
    if (font) await ensureFont(font)
    const resolvedFontFamily = font ? fontFamily(font) : layer.fontFamily
    const node = new Konva.Text({
      ...commonConfig(layer),
      text: layer.text,
      fontFamily: resolvedFontFamily,
      fontSize: layer.fontSize,
      fontStyle: fontStyle(layer),
      fill: layer.fill,
      align: layer.align,
      lineHeight: layer.lineHeight,
      textDecoration: textDecoration(layer),
      verticalAlign: 'top',
    })
    logText('render-text-node', {
      layerId: layer.id,
      text: layer.text,
      fontId: layer.fontId,
      fontFamily: layer.fontFamily,
      recordFontFamily: font?.fontFamily,
      renderFontFamily: resolvedFontFamily,
      fontSize: layer.fontSize,
      fontStyle: fontStyle(layer),
      measuredWidth: node.textWidth,
      measuredHeight: node.textHeight,
      clientRect: node.getClientRect({ skipTransform: true }),
      fontCheck: globalThis.document.fonts?.check?.(`${layer.fontSize}px "${resolvedFontFamily}"`),
    })
    return prepareEffectNode(node, layer.effects)
  }
  if (isShapeLayer(layer)) return prepareEffectNode(shapeNode(layer), layer.effects)
  if (isPaintLayer(layer)) return prepareEffectNode(paintNode(layer), layer.effects)
  return undefined
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

export async function renderHandoutToDataUrl(
  document: HandoutDocument,
  library: LibraryIndex,
  scale = 1,
  cache: ImageCache = {},
  mimeType = 'image/png',
  quality?: number,
  options?: RenderMaskOptions,
) {
  const { stage, destroy } = await renderHandoutStage(document, library, cache, options)
  try {
    return compressedStageDataUrl(stage, mimeType, Math.max(0.1, Number(scale) || 1), quality)
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
  const { stage, destroy } = await renderHandoutStage(document, library, cache, options)
  try {
    const canvas = stage.toCanvas({
      pixelRatio: Math.max(0.1, Number(scale) || 1),
    })
    return canvasToBlob(canvas, mimeType, quality)
  } finally {
    destroy()
  }
}

export function previewPixelRatio(size: CanvasSize, maxEdge = PREVIEW_MAX_EDGE) {
  const largest = Math.max(1, size.width, size.height)
  return Math.min(1, maxEdge / largest)
}

export function dataUrlByteSize(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] || ''
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

function compressedStageDataUrl(stage: Konva.Stage, mimeType: string, pixelRatio: number, quality?: number) {
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

async function renderHandoutStage(
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

export async function renderHandoutPreviewToDataUrl(
  document: HandoutDocument,
  library: LibraryIndex,
  cache: ImageCache = {},
  options?: RenderMaskOptions,
) {
  const { stage, destroy } = await renderHandoutStage(document, library, cache, options)
  try {
    let smallest = ''
    for (const maxEdge of [PREVIEW_MAX_EDGE, 240, 160]) {
      const pixelRatio = previewPixelRatio(document.canvas, maxEdge)
      const png = compressedStageDataUrl(stage, 'image/png', pixelRatio)
      if (!smallest || dataUrlByteSize(png) < dataUrlByteSize(smallest)) smallest = png
      if (dataUrlByteSize(png) <= PREVIEW_TARGET_BYTES) return png

      for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
        const webp = compressedStageDataUrl(stage, 'image/webp', pixelRatio, quality)
        if (webp.startsWith('data:image/webp')) {
          if (!smallest || dataUrlByteSize(webp) < dataUrlByteSize(smallest)) smallest = webp
          if (dataUrlByteSize(webp) <= PREVIEW_MAX_BYTES) return webp
        }
      }

      const jpeg = compressedStageDataUrl(stage, 'image/jpeg', pixelRatio, 0.55)
      if (!smallest || dataUrlByteSize(jpeg) < dataUrlByteSize(smallest)) smallest = jpeg
      if (dataUrlByteSize(jpeg) <= PREVIEW_MAX_BYTES) return jpeg
    }

    return smallest
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
