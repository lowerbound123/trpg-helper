import Konva from 'konva'

import { fileUrl, type LibraryIndex, type LibraryRecord } from '@/lib/backend'

import { commonConfig, fontFamily, fontStyle, logText, prepareEffectNode, textDecoration } from '../shared'
import type { ImageCache } from '../types'
import type { TextLayer } from '@/lib/handout'

export async function ensureFont(font: LibraryRecord) {
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

export async function textNode(layer: TextLayer, library: LibraryIndex, _cache: ImageCache) {
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
