import { v4 as uuidv4 } from 'uuid'

import { defaultEffects } from '../effects'
import type { HandoutDocument } from '../document'
import { touch } from '../document'
import { normalizePaintStroke } from '../paint'
import type { PaintStroke } from '../paint'

import { nextLayerName, normalizeZIndex } from './shared'
import type {
  CurvePoints,
  FlattenedLayerBounds,
  HandoutLayer,
  ImageLayer,
  NewImageLayerInput,
  NewPaintLayerInput,
  NewShapeLayerInput,
  NewTextLayerInput,
  PaintLayer,
  ShapeKind,
  ShapeLayer,
  TextLayer,
} from './types'

function shapeNameBase(shape: ShapeKind) {
  return shape
}

export function isCurveShape(shape: ShapeKind) {
  return shape === 'quadratic-curve' || shape === 'cubic-bezier'
}

function defaultShapeSize(shape: ShapeKind) {
  if (shape === 'line') return { width: 320, height: 24 }
  if (shape === 'quadratic-curve') return { width: 320, height: 180 }
  if (shape === 'cubic-bezier') return { width: 360, height: 220 }
  return { width: 220, height: 160 }
}

function defaultCurvePoints(shape: ShapeKind, width: number, height: number): CurvePoints | undefined {
  if (shape === 'quadratic-curve') {
    return {
      start: { x: 0, y: height * 0.75 },
      control: { x: width * 0.5, y: height * 0.08 },
      end: { x: width, y: height * 0.75 },
    }
  }
  if (shape === 'cubic-bezier') {
    return {
      start: { x: 0, y: height * 0.65 },
      control1: { x: width * 0.3, y: height * 0.05 },
      control2: { x: width * 0.72, y: height * 0.95 },
      end: { x: width, y: height * 0.35 },
    }
  }
  return undefined
}

export function normalizeCurvePoints(layer: ShapeLayer): CurvePoints | undefined {
  if (!isCurveShape(layer.shape)) return undefined
  const width = layer.width || defaultShapeSize(layer.shape).width
  const height = layer.height || defaultShapeSize(layer.shape).height
  const fallback = defaultCurvePoints(layer.shape, width, height)
  if (!fallback) return undefined
  return {
    start: layer.curvePoints?.start ?? fallback.start,
    control: layer.shape === 'quadratic-curve' ? layer.curvePoints?.control ?? fallback.control : undefined,
    control1: layer.shape === 'cubic-bezier' ? layer.curvePoints?.control1 ?? fallback.control1 : undefined,
    control2: layer.shape === 'cubic-bezier' ? layer.curvePoints?.control2 ?? fallback.control2 : undefined,
    end: layer.curvePoints?.end ?? fallback.end,
  }
}

export function shapeDefaults(layer: HandoutLayer): Partial<ShapeLayer> {
  if (layer.type !== 'shape') return {}
  return {
    fill: layer.fill ?? 'rgba(14,165,233,0.12)',
    stroke: layer.stroke ?? '#0f766e',
    strokeWidth: layer.strokeWidth ?? 3,
    cornerRadius: layer.cornerRadius ?? 16,
    lineStartArrow: layer.lineStartArrow ?? 'none',
    lineEndArrow: layer.lineEndArrow ?? 'none',
    lineArrowSize: layer.lineArrowSize ?? 1,
    lineStyle: layer.lineStyle ?? 'solid',
    curvePoints: isCurveShape(layer.shape) ? normalizeCurvePoints(layer) : layer.curvePoints,
  }
}

export function paintDefaults(layer: HandoutLayer): Partial<PaintLayer> {
  if (layer.type !== 'paint') return {}
  return {
    strokes: (layer.strokes ?? []).map(normalizePaintStroke),
    brushColor: layer.brushColor ?? '#111827',
    brushKind: layer.brushKind ?? 'pixel',
    brushWidth: layer.brushWidth ?? 6,
    brushOpacity: layer.brushOpacity ?? 1,
    eraserWidth: layer.eraserWidth ?? layer.brushWidth ?? 12,
    eraserOpacity: layer.eraserOpacity ?? 1,
    brushTension: layer.brushTension ?? 0.35,
  }
}

export function addImageLayer(document: HandoutDocument, input: NewImageLayerInput): HandoutDocument {
  const layer: ImageLayer = {
    id: uuidv4(),
    type: 'image',
    name: input.name ?? 'Image layer',
    assetId: input.assetId,
    x: input.x ?? 120,
    y: input.y ?? 120,
    width: input.width ?? 360,
    height: input.height ?? 240,
    rotation: 0,
    flipX: false,
    opacity: 1,
    blendMode: 'source-over',
    visible: true,
    locked: false,
    zIndex: document.layers.length,
    effects: defaultEffects(),
    mask: null,
  }

  return touch({
    ...document,
    layers: [...document.layers, layer],
  })
}

export function flattenLayersToImage(
  document: HandoutDocument,
  layerIds: string[],
  assetId: string,
  name: string,
  bounds: FlattenedLayerBounds,
): HandoutDocument {
  const ids = layerIds.filter((id, index) => layerIds.indexOf(id) === index)
  if (!ids.length) return document
  const idSet = new Set(ids)
  const selectedLayers = document.layers.filter((layer) => idSet.has(layer.id))
  if (!selectedLayers.length) return document
  const highestSelectedIndex = Math.max(...selectedLayers.map((layer) => layer.zIndex))
  const remaining = document.layers.filter((layer) => !idSet.has(layer.id))
  const insertIndex = remaining.filter((layer) => layer.zIndex <= highestSelectedIndex).length
  const flatLayer: ImageLayer = {
    id: uuidv4(),
    type: 'image',
    name,
    assetId,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    rotation: 0,
    flipX: false,
    opacity: 1,
    blendMode: 'source-over',
    visible: true,
    locked: false,
    zIndex: insertIndex,
    effects: defaultEffects(),
    mask: null,
  }
  remaining.splice(insertIndex, 0, flatLayer)
  return touch({
    ...document,
    layers: normalizeZIndex(remaining),
    groups: document.groups
      .map((group) => ({
        ...group,
        layerIds: group.layerIds.filter((id) => !idSet.has(id)),
      }))
      .filter((group) => group.layerIds.length),
  })
}

export function addTextLayer(document: HandoutDocument, input: NewTextLayerInput): HandoutDocument {
  const layer: TextLayer = {
    id: uuidv4(),
    type: 'text',
    name: 'Text layer',
    text: input.text,
    fontId: input.fontId,
    fontFamily: input.fontFamily ?? 'Inter',
    fontSize: 42,
    fontWeight: 600,
    italic: false,
    underline: false,
    strikethrough: false,
    fill: '#111827',
    align: 'left',
    lineHeight: 1.18,
    x: input.x ?? 160,
    y: input.y ?? 160,
    width: input.width ?? 520,
    height: input.height ?? 120,
    rotation: 0,
    flipX: false,
    opacity: 1,
    blendMode: 'source-over',
    visible: true,
    locked: false,
    zIndex: document.layers.length,
    effects: defaultEffects(),
    mask: null,
  }

  return touch({
    ...document,
    layers: [...document.layers, layer],
  })
}

export function addShapeLayer(document: HandoutDocument, input: NewShapeLayerInput): HandoutDocument {
  const size = defaultShapeSize(input.shape)
  const width = input.width ?? size.width
  const height = input.height ?? size.height
  const layer: ShapeLayer = {
    id: uuidv4(),
    type: 'shape',
    name: input.name ?? nextLayerName(document.layers, shapeNameBase(input.shape)),
    shape: input.shape,
    x: input.x ?? 180,
    y: input.y ?? 160,
    width,
    height,
    fill: input.fill ?? (input.shape === 'line' || isCurveShape(input.shape) ? 'rgba(0,0,0,0)' : 'rgba(14,165,233,0.12)'),
    stroke: input.stroke ?? '#0f766e',
    strokeWidth: input.strokeWidth ?? 3,
    cornerRadius: input.cornerRadius ?? 16,
    lineStartArrow: input.lineStartArrow ?? 'none',
    lineEndArrow: input.lineEndArrow ?? 'none',
    lineArrowSize: input.lineArrowSize ?? 1,
    lineStyle: input.lineStyle ?? 'solid',
    curvePoints: input.curvePoints ?? defaultCurvePoints(input.shape, width, height),
    rotation: 0,
    flipX: false,
    opacity: 1,
    blendMode: 'source-over',
    visible: true,
    locked: false,
    zIndex: document.layers.length,
    effects: defaultEffects(),
    mask: null,
  }

  return touch({
    ...document,
    layers: [...document.layers, layer],
  })
}

export function addPaintLayer(document: HandoutDocument, input: NewPaintLayerInput = {}): HandoutDocument {
  const layer: PaintLayer = {
    id: uuidv4(),
    type: 'paint',
    name: input.name ?? nextLayerName(document.layers, 'paint'),
    x: input.x ?? 0,
    y: input.y ?? 0,
    width: input.width ?? document.canvas.width,
    height: input.height ?? document.canvas.height,
    rotation: 0,
    flipX: false,
    opacity: 1,
    blendMode: 'source-over',
    visible: true,
    locked: false,
    zIndex: document.layers.length,
    effects: defaultEffects(),
    mask: null,
    strokes: [],
    brushColor: input.brushColor ?? '#111827',
    brushKind: input.brushKind ?? 'pixel',
    brushWidth: input.brushWidth ?? 6,
    brushOpacity: input.brushOpacity ?? 1,
    eraserWidth: input.eraserWidth ?? 12,
    eraserOpacity: input.eraserOpacity ?? 1,
    brushTension: input.brushTension ?? 0.35,
  }

  return touch({
    ...document,
    layers: [...document.layers, layer],
  })
}

export function appendPaintStroke(
  document: HandoutDocument,
  layerId: string,
  stroke: PaintStroke,
): HandoutDocument {
  return touch({
    ...document,
    layers: document.layers.map((layer) => {
      if (layer.id !== layerId || layer.type !== 'paint') return layer
      return {
        ...layer,
        strokes: [...layer.strokes, normalizePaintStroke(stroke)],
      }
    }),
  })
}

export function applyShapeAndPaintDefaults(layer: HandoutLayer): HandoutLayer {
  return {
    ...layer,
    ...shapeDefaults(layer),
    ...paintDefaults(layer),
  } as HandoutLayer
}
