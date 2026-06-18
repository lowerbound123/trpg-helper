import Konva from 'konva'

import { readFileDataUrl, type LibraryIndex, type LibraryRecord } from './backend'
import { hasVisibleEffects, konvaEffectConfig } from './effects'
import type { HandoutDocument, HandoutLayer, ImageLayer, TextLayer } from './handout'

type ImageCache = Record<string, HTMLImageElement>

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

function fontFamily(font: LibraryRecord) {
  return font.name.replace(/\.[^.]+$/, '') || font.name
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
  if (!font.path || !('FontFace' in window)) return
  const family = fontFamily(font)
  if (Array.from(globalThis.document.fonts).some((face) => face.family === family)) return
  const source = await readFileDataUrl(font.path, font.mediaType)
  const face = new FontFace(family, `url("${source}")`)
  await face.load()
  globalThis.document.fonts.add(face)
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
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    globalCompositeOperation: layer.blendMode,
    ...konvaEffectConfig(layer.effects),
  }
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
      content.add(prepareEffectNode(new Konva.Text({
        ...commonConfig(item),
        text: item.text,
        fontFamily: item.fontFamily,
        fontSize: item.fontSize,
        fontStyle: fontStyle(item),
        fill: item.fill,
        align: item.align,
        lineHeight: item.lineHeight,
        textDecoration: textDecoration(item),
        verticalAlign: 'top',
      }), item.effects))
    }
  }

  if (hasVisibleEffects(document.canvas.effects)) content.cache()
  layer.draw()
  const dataUrl = stage.toDataURL({
    pixelRatio: Math.max(0.1, Number(scale) || 1),
    mimeType: 'image/png',
  })
  stage.destroy()
  container.remove()
  return dataUrl
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
