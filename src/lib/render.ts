import Konva from 'konva'

import { appendDebugLog, fontRecordFamily, readFileDataUrl, type LibraryIndex, type LibraryRecord } from './backend'
import { hasVisibleEffects, konvaEffectConfig } from './effects'
import type { HandoutDocument, HandoutLayer, ImageLayer, ShapeLayer, TextLayer } from './handout'

type ImageCache = Record<string, HTMLImageElement>
type CanvasSize = { width: number; height: number }

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

function fontFamily(font: LibraryRecord) {
  return fontRecordFamily(font)
}

async function loadImage(record: LibraryRecord, cache: ImageCache) {
  if (cache[record.id]) return cache[record.id]
  const image = new window.Image()
  image.crossOrigin = 'anonymous'
  const src = await readFileDataUrl(record.path, record.mediaType)
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`Failed to load ${record.name}`))
    image.src = src
  })
  cache[record.id] = image
  return image
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
  const source = await readFileDataUrl(font.path, font.mediaType)
  logText('render-font-load-start', {
    id: font.id,
    name: font.name,
    family,
    recordFamily: font.fontFamily,
    mediaType: font.mediaType,
    sourceLength: source.length,
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

function shapeNode(layer: ShapeLayer) {
  const { width: _width, height: _height, ...config } = {
    ...commonConfig(layer),
    fill: layer.fill,
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth,
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

function polygonPoints(layer: ShapeLayer) {
  if (layer.shape === 'diamond') {
    return [layer.width / 2, 0, layer.width, layer.height / 2, layer.width / 2, layer.height, 0, layer.height / 2]
  }
  if (layer.shape === 'hexagon-v') {
    return [
      layer.width / 2, 0,
      layer.width, layer.height * 0.25,
      layer.width, layer.height * 0.75,
      layer.width / 2, layer.height,
      0, layer.height * 0.75,
      0, layer.height * 0.25,
    ]
  }
  return [
    layer.width * 0.25, 0,
    layer.width * 0.75, 0,
    layer.width, layer.height / 2,
    layer.width * 0.75, layer.height,
    layer.width * 0.25, layer.height,
    0, layer.height / 2,
  ]
}

function lineDash(layer: ShapeLayer) {
  if (layer.lineStyle === 'dashed') return [18, 12]
  if (layer.lineStyle === 'dotted') {
    const gap = Math.max(8, layer.strokeWidth * 3)
    return [0.001, gap]
  }
  return []
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

export async function renderHandoutToDataUrl(
  document: HandoutDocument,
  library: LibraryIndex,
  scale = 1,
  cache: ImageCache = {},
) {
  const { stage, destroy } = await renderHandoutStage(document, library, cache)
  try {
    return compressedStageDataUrl(stage, 'image/png', Math.max(0.1, Number(scale) || 1))
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

async function renderHandoutStage(
  document: HandoutDocument,
  library: LibraryIndex,
  cache: ImageCache,
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

  content.add(new Konva.Rect({
    x: 0,
    y: 0,
    width: document.canvas.width,
    height: document.canvas.height,
    fill: document.canvas.backgroundColor,
  }))

  const background = resolveImageRecord(library, document.canvas.backgroundAssetId)
  if (background) {
    content.add(new Konva.Image({
      image: await loadImage(background, cache),
      x: 0,
      y: 0,
      width: document.canvas.width,
      height: document.canvas.height,
      listening: false,
    }))
  }

  for (const item of [...document.layers].sort((a, b) => a.zIndex - b.zIndex)) {
    if (isImageLayer(item)) {
      const record = resolveImageRecord(library, item.assetId)
      if (!record) continue
      content.add(prepareEffectNode(new Konva.Image({
        ...commonConfig(item),
        image: await loadImage(record, cache),
      }), item.effects))
    }
    if (isTextLayer(item)) {
      const font = library.fonts.find((record) => record.id === item.fontId)
      if (font) await ensureFont(font)
      const resolvedFontFamily = font ? fontFamily(font) : item.fontFamily
      const node = new Konva.Text({
        ...commonConfig(item),
        text: item.text,
        fontFamily: resolvedFontFamily,
        fontSize: item.fontSize,
        fontStyle: fontStyle(item),
        fill: item.fill,
        align: item.align,
        lineHeight: item.lineHeight,
        textDecoration: textDecoration(item),
        verticalAlign: 'top',
      })
      logText('render-text-node', {
        layerId: item.id,
        text: item.text,
        fontId: item.fontId,
        fontFamily: item.fontFamily,
        recordFontFamily: font?.fontFamily,
        renderFontFamily: resolvedFontFamily,
        fontSize: item.fontSize,
        fontStyle: fontStyle(item),
        measuredWidth: node.textWidth,
        measuredHeight: node.textHeight,
        clientRect: node.getClientRect({ skipTransform: true }),
        fontCheck: globalThis.document.fonts?.check?.(`${item.fontSize}px "${resolvedFontFamily}"`),
      })
      content.add(prepareEffectNode(node, item.effects))
    }
    if (isShapeLayer(item)) {
      content.add(prepareEffectNode(shapeNode(item), item.effects))
    }
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
) {
  const { stage, destroy } = await renderHandoutStage(document, library, cache)
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

export function downloadFileName(title: string, date = new Date()) {
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
  return `${safeTitle}-${stamp}.png`
}
