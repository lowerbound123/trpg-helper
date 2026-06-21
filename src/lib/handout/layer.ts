import { v4 as uuidv4 } from 'uuid'

import { defaultEffects, type BlendMode, type LayerEffects } from './effects'
import type { CanvasSettings, HandoutDocument } from './document'
import { touch } from './document'
import type { LayerMask } from './mask'
import { normalizeMask } from './mask'
import type { BrushKind, PaintStroke } from './paint'
import { normalizePaintStroke } from './paint'

export type LayerType = 'image' | 'text' | 'shape' | 'paint'
export type ShapeKind =
  | 'rect'
  | 'round-rect'
  | 'ellipse'
  | 'diamond'
  | 'hexagon-h'
  | 'hexagon-v'
  | 'line'
  | 'quadratic-curve'
  | 'cubic-bezier'
export type LineArrowKind = 'none' | 'triangle' | 'notched' | 'bar' | 'dot'
export type LineStyleKind = 'solid' | 'dashed' | 'dotted' | 'double'

export type CanvasPoint = {
  x: number
  y: number
}

export type CurvePoints = {
  start: CanvasPoint
  control?: CanvasPoint
  control1?: CanvasPoint
  control2?: CanvasPoint
  end: CanvasPoint
}

export interface BaseLayer {
  id: string
  type: LayerType
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  flipX: boolean
  opacity: number
  blendMode: BlendMode
  visible: boolean
  locked: boolean
  zIndex: number
  effects: LayerEffects
  mask: LayerMask | null
}

export interface ImageLayer extends BaseLayer {
  type: 'image'
  assetId: string
}

export interface TextLayer extends BaseLayer {
  type: 'text'
  text: string
  fontId?: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  italic: boolean
  underline: boolean
  strikethrough: boolean
  fill: string
  align: 'left' | 'center' | 'right' | 'justify'
  lineHeight: number
}

export interface ShapeLayer extends BaseLayer {
  type: 'shape'
  shape: ShapeKind
  fill: string
  stroke: string
  strokeWidth: number
  cornerRadius: number
  lineStartArrow: LineArrowKind
  lineEndArrow: LineArrowKind
  lineArrowSize: number
  lineStyle: LineStyleKind
  curvePoints?: CurvePoints
}

export interface PaintLayer extends BaseLayer {
  type: 'paint'
  strokes: PaintStroke[]
  brushColor: string
  brushKind: BrushKind
  brushWidth: number
  brushOpacity: number
  eraserWidth: number
  eraserOpacity: number
  brushTension: number
}

export type HandoutLayer = ImageLayer | TextLayer | ShapeLayer | PaintLayer

export interface LayerGroup {
  id: string
  name: string
  layerIds: string[]
  visible: boolean
}

export type NewImageLayerInput = {
  assetId: string
  name?: string
  x?: number
  y?: number
  width?: number
  height?: number
}

export type FlattenedLayerBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type NewTextLayerInput = {
  text: string
  fontId?: string
  fontFamily?: string
  x?: number
  y?: number
  width?: number
  height?: number
}

export type NewShapeLayerInput = {
  shape: ShapeKind
  name?: string
  x?: number
  y?: number
  width?: number
  height?: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  cornerRadius?: number
  lineStartArrow?: LineArrowKind
  lineEndArrow?: LineArrowKind
  lineArrowSize?: number
  lineStyle?: LineStyleKind
  curvePoints?: CurvePoints
}

export type NewPaintLayerInput = {
  name?: string
  x?: number
  y?: number
  width?: number
  height?: number
  brushColor?: string
  brushKind?: BrushKind
  brushWidth?: number
  brushOpacity?: number
  eraserWidth?: number
  eraserOpacity?: number
  brushTension?: number
}

export type LayerPatch = Partial<
  Omit<ImageLayer, 'id' | 'type' | 'zIndex'>
  & Omit<TextLayer, 'id' | 'type' | 'zIndex'>
  & Omit<ShapeLayer, 'id' | 'type' | 'zIndex'>
  & Omit<PaintLayer, 'id' | 'type' | 'zIndex'>
>

export const normalizeZIndex = (layers: HandoutLayer[]): HandoutLayer[] =>
  layers.map((layer, index) => ({ ...layer, zIndex: index }))

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

function nextLayerName(layers: HandoutLayer[], base: string) {
  const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:-(\\d+))?$`)
  const max = layers.reduce((value, layer) => {
    const match = layer.name.match(pattern)
    if (!match) return value
    return Math.max(value, match[1] ? Number(match[1]) : 0)
  }, 0)
  return `${base}-${max + 1}`
}

export function nextGroupName(groups: LayerGroup[]) {
  const pattern = /^group(?:-(\d+))?$/
  const max = groups.reduce((value, group) => {
    const match = group.name.match(pattern)
    if (!match) return value
    return Math.max(value, match[1] ? Number(match[1]) : 0)
  }, 0)
  return `group-${max + 1}`
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

export function updateLayer(
  document: HandoutDocument,
  layerId: string,
  patch: LayerPatch,
): HandoutDocument {
  return touch({
    ...document,
    layers: document.layers.map((layer) => {
      if (layer.id !== layerId) return layer
      return { ...layer, ...patch } as HandoutLayer
    }),
  })
}

export function setLayerMask(
  document: HandoutDocument,
  layerId: string,
  mask: LayerMask,
): HandoutDocument {
  return updateLayer(document, layerId, { mask: normalizeMask(mask, document.canvas) } as LayerPatch)
}

export function setLayerMaskEnabled(
  document: HandoutDocument,
  layerId: string,
  enabled: boolean,
): HandoutDocument {
  const layer = document.layers.find((item) => item.id === layerId)
  if (!layer?.mask) return document
  return setLayerMask(document, layerId, { ...layer.mask, enabled })
}

export function clearLayerMask(
  document: HandoutDocument,
  layerId: string,
  updatedAt = new Date().toISOString(),
): HandoutDocument {
  const layer = document.layers.find((item) => item.id === layerId)
  if (!layer?.mask) return document
  return setLayerMask(document, layerId, {
    ...layer.mask,
    enabled: true,
    path: '',
    cache: null,
    previewPath: null,
    previewUpdatedAt: null,
    sourceVersion: layer.mask.sourceVersion + 1,
    version: layer.mask.version + 1,
    updatedAt,
  })
}

export function deleteLayerMask(document: HandoutDocument, layerId: string): HandoutDocument {
  return updateLayer(document, layerId, { mask: null } as LayerPatch)
}

export function transferLayerMask(
  document: HandoutDocument,
  sourceLayerId: string,
  targetLayerId: string,
  updatedAt = new Date().toISOString(),
): HandoutDocument {
  if (sourceLayerId === targetLayerId) return document
  const source = document.layers.find((layer) => layer.id === sourceLayerId)
  const target = document.layers.find((layer) => layer.id === targetLayerId)
  if (!source?.mask || !target) return document
  const nextMask = normalizeMask({
    ...source.mask,
    layerId: targetLayerId,
    path: '',
    highResPath: `masks/${source.mask.id}.png`,
    previewPath: null,
    previewUpdatedAt: null,
    cache: null,
    updatedAt,
  }, document.canvas)!
  return touch({
    ...document,
    layers: document.layers.map((layer) => {
      if (layer.id === sourceLayerId) return { ...layer, mask: null } as HandoutLayer
      if (layer.id === targetLayerId) return { ...layer, mask: nextMask } as HandoutLayer
      return layer
    }),
  })
}

export function copyLayerMask(
  document: HandoutDocument,
  sourceLayerId: string,
  targetLayerId: string,
  maskId = uuidv4(),
  updatedAt = new Date().toISOString(),
): HandoutDocument {
  if (sourceLayerId === targetLayerId) return document
  const source = document.layers.find((layer) => layer.id === sourceLayerId)
  const target = document.layers.find((layer) => layer.id === targetLayerId)
  if (!source?.mask || !target) return document
  const nextMask = normalizeMask({
    ...source.mask,
    id: maskId,
    layerId: targetLayerId,
    path: '',
    highResPath: `masks/${maskId}.png`,
    previewPath: null,
    previewUpdatedAt: null,
    cache: null,
    updatedAt,
  }, document.canvas)!
  return updateLayer(document, targetLayerId, { mask: nextMask } as LayerPatch)
}

export function removeLayer(document: HandoutDocument, layerId: string): HandoutDocument {
  return touch({
    ...document,
    layers: normalizeZIndex(document.layers.filter((layer) => layer.id !== layerId)),
    groups: document.groups
      .map((group) => ({
        ...group,
        layerIds: group.layerIds.filter((id) => id !== layerId),
      }))
      .filter((group) => group.layerIds.length),
  })
}

export function moveLayer(
  document: HandoutDocument,
  layerId: string,
  targetIndex: number,
): HandoutDocument {
  const group = groupForLayer(document, layerId)
  if (group) return moveLayerGroup(document, group.id, targetIndex)

  const layers = [...document.layers]
  const currentIndex = layers.findIndex((layer) => layer.id === layerId)
  if (currentIndex < 0) return document

  const [layer] = layers.splice(currentIndex, 1)
  const boundedIndex = Math.max(0, Math.min(targetIndex, layers.length))
  layers.splice(boundedIndex, 0, layer)

  return touch({
    ...document,
    layers: normalizeZIndex(layers),
  })
}

function layersByIds(document: HandoutDocument, ids: string[]) {
  const byId = new Map(document.layers.map((layer) => [layer.id, layer]))
  return ids
    .map((id) => byId.get(id))
    .filter((layer): layer is HandoutLayer => Boolean(layer))
}

function layerIdsInZOrder(document: HandoutDocument, ids: string[]) {
  const requested = new Set(ids)
  return [...document.layers]
    .filter((layer) => requested.has(layer.id))
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((layer) => layer.id)
}

export function groupForLayer(document: HandoutDocument, layerId: string): LayerGroup | undefined {
  return document.groups.find((group) => group.layerIds.includes(layerId))
}

export function isLayerEffectivelyVisible(document: HandoutDocument, layer: HandoutLayer) {
  const group = groupForLayer(document, layer.id)
  return layer.visible && (group?.visible ?? true)
}

export function addLayerGroup(
  document: HandoutDocument,
  layerIds: string[],
  name?: string,
): HandoutDocument {
  const existing = new Set(document.layers.map((layer) => layer.id))
  const uniqueIds = layerIds.filter((id, index) => existing.has(id) && layerIds.indexOf(id) === index)
  const ids = layerIdsInZOrder(document, uniqueIds)
  if (!ids.length) return document
  const cleanedGroups = document.groups
    .map((group) => ({
      ...group,
      layerIds: group.layerIds.filter((id) => !ids.includes(id)),
    }))
    .filter((group) => group.layerIds.length)
  const group: LayerGroup = {
    id: uuidv4(),
    name: name ?? nextGroupName(cleanedGroups),
    layerIds: ids,
    visible: true,
  }
  const selected = layersByIds(document, ids)
  const selectedSet = new Set(ids)
  const rest = document.layers.filter((layer) => !selectedSet.has(layer.id))
  const highestSelectedIndex = Math.max(...ids.map((id) => document.layers.findIndex((layer) => layer.id === id)))
  const insertIndex = rest.filter((layer) => layer.zIndex <= highestSelectedIndex).length
  rest.splice(insertIndex, 0, ...selected)
  return touch({
    ...document,
    layers: normalizeZIndex(rest),
    groups: [...cleanedGroups, group],
  })
}

export function ungroupLayerGroup(document: HandoutDocument, groupId: string): HandoutDocument {
  return touch({
    ...document,
    groups: document.groups.filter((group) => group.id !== groupId),
  })
}

export function moveLayerOutOfGroup(document: HandoutDocument, layerId: string): HandoutDocument {
  return touch({
    ...document,
    groups: document.groups
      .map((group) => ({ ...group, layerIds: group.layerIds.filter((id) => id !== layerId) }))
      .filter((group) => group.layerIds.length),
  })
}

export function setLayerGroupVisibility(
  document: HandoutDocument,
  groupId: string,
  visible: boolean,
): HandoutDocument {
  return touch({
    ...document,
    groups: document.groups.map((group) => group.id === groupId ? { ...group, visible } : group),
  })
}

export function addLayerToGroup(
  document: HandoutDocument,
  layerId: string,
  groupId: string,
  targetIndex?: number,
): HandoutDocument {
  if (!document.layers.some((layer) => layer.id === layerId)) return document
  const currentGroup = document.groups.find((group) => group.id === groupId)
  if (!currentGroup) return document
  const groupLayerIndexes = currentGroup.layerIds
    .map((id) => document.layers.findIndex((layer) => layer.id === id))
    .filter((index) => index >= 0)
  const insertionAnchor = groupLayerIndexes.length ? Math.min(...groupLayerIndexes) : document.layers.length
  const cleaned = document.groups.map((group) => ({
    ...group,
    layerIds: group.layerIds.filter((id) => id !== layerId),
  }))
  const nextGroups = cleaned
    .map((group) => {
      if (group.id !== groupId) return group
      const ids = [...group.layerIds]
      const index = Math.max(0, Math.min(targetIndex ?? ids.length, ids.length))
      ids.splice(index, 0, layerId)
      return { ...group, layerIds: ids }
    })
    .filter((group) => group.layerIds.length)
  const nextGroup = nextGroups.find((group) => group.id === groupId)
  if (!nextGroup) return document
  const nextGroupIds = new Set(nextGroup.layerIds)
  const remaining = document.layers.filter((layer) => !nextGroupIds.has(layer.id))
  const adjustedAnchor = remaining.filter((layer) => layer.zIndex < insertionAnchor).length
  const groupLayers = layersByIds(document, nextGroup.layerIds)
  remaining.splice(Math.max(0, Math.min(adjustedAnchor, remaining.length)), 0, ...groupLayers)
  return touch({
    ...document,
    layers: normalizeZIndex(remaining),
    groups: nextGroups,
  })
}

export function moveLayerGroup(
  document: HandoutDocument,
  groupId: string,
  targetIndex: number,
): HandoutDocument {
  const group = document.groups.find((item) => item.id === groupId)
  if (!group) return document
  const groupIds = new Set(group.layerIds)
  const groupLayers = layersByIds(document, group.layerIds)
  if (!groupLayers.length) return document
  const remaining = document.layers.filter((layer) => !groupIds.has(layer.id))
  const boundedIndex = Math.max(0, Math.min(targetIndex, remaining.length))
  remaining.splice(boundedIndex, 0, ...groupLayers)
  return touch({
    ...document,
    layers: normalizeZIndex(remaining),
  })
}

export function applyShapeAndPaintDefaults(layer: HandoutLayer): HandoutLayer {
  return {
    ...layer,
    ...shapeDefaults(layer),
    ...paintDefaults(layer),
  } as HandoutLayer
}

export type { CanvasSettings }
