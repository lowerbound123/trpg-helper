import { v4 as uuidv4 } from 'uuid'

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'

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
export type PaintMode = 'brush' | 'eraser'

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

export interface CanvasSettings {
  width: number
  height: number
  backgroundColor: string
  backgroundAssetId?: string
  effects: LayerEffects
}

export interface LayerEffects {
  brightness: number
  contrast: number
  saturation: number
  blur: number
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

export interface PaintStroke {
  id: string
  points: number[]
  strokeWidth: number
  color: string
  tension: number
  mode: PaintMode
}

export interface PaintLayer extends BaseLayer {
  type: 'paint'
  strokes: PaintStroke[]
  brushColor: string
  brushWidth: number
  eraserWidth: number
  brushTension: number
}

export type HandoutLayer = ImageLayer | TextLayer | ShapeLayer | PaintLayer

export interface HandoutDocument {
  schemaVersion: 1
  id: string
  title: string
  canvas: CanvasSettings
  layers: HandoutLayer[]
  updatedAt: string
}

export type NewImageLayerInput = {
  assetId: string
  name?: string
  x?: number
  y?: number
  width?: number
  height?: number
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
  brushWidth?: number
  eraserWidth?: number
  brushTension?: number
}

export type LayerPatch = Partial<
  Omit<ImageLayer, 'id' | 'type' | 'zIndex'>
  & Omit<TextLayer, 'id' | 'type' | 'zIndex'>
  & Omit<ShapeLayer, 'id' | 'type' | 'zIndex'>
  & Omit<PaintLayer, 'id' | 'type' | 'zIndex'>
>

export const defaultEffects = (): LayerEffects => ({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
})

export function normalizeEffects(effects?: Partial<LayerEffects>): LayerEffects {
  return {
    ...defaultEffects(),
    ...effects,
  }
}

export function normalizeHandoutDocument(document: HandoutDocument): HandoutDocument {
  return {
    ...document,
    canvas: {
      ...document.canvas,
      effects: normalizeEffects(document.canvas.effects),
    },
    layers: document.layers.map((layer) => ({
      ...layer,
      flipX: layer.flipX ?? false,
      effects: normalizeEffects(layer.effects),
      ...shapeDefaults(layer),
      ...paintDefaults(layer),
    })) as HandoutLayer[],
  }
}

function shapeDefaults(layer: HandoutLayer): Partial<ShapeLayer> {
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

function paintDefaults(layer: HandoutLayer): Partial<PaintLayer> {
  if (layer.type !== 'paint') return {}
  return {
    strokes: layer.strokes ?? [],
    brushColor: layer.brushColor ?? '#111827',
    brushWidth: layer.brushWidth ?? 6,
    eraserWidth: layer.eraserWidth ?? layer.brushWidth ?? 12,
    brushTension: layer.brushTension ?? 0.35,
  }
}

const touch = (document: HandoutDocument): HandoutDocument => ({
  ...document,
  updatedAt: new Date().toISOString(),
})

const normalizeZIndex = (layers: HandoutLayer[]): HandoutLayer[] =>
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

function normalizeCurvePoints(layer: ShapeLayer): CurvePoints | undefined {
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

export function createDefaultHandout(title = 'Untitled handout'): HandoutDocument {
  return {
    schemaVersion: 1,
    id: uuidv4(),
    title,
    canvas: {
      width: 1280,
      height: 720,
      backgroundColor: 'rgba(0,0,0,0)',
      effects: defaultEffects(),
    },
    layers: [],
    updatedAt: new Date().toISOString(),
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
  }

  return touch({
    ...document,
    layers: [...document.layers, layer],
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
    strokes: [],
    brushColor: input.brushColor ?? '#111827',
    brushWidth: input.brushWidth ?? 6,
    eraserWidth: input.eraserWidth ?? 12,
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
        strokes: [...layer.strokes, stroke],
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

export function removeLayer(document: HandoutDocument, layerId: string): HandoutDocument {
  return touch({
    ...document,
    layers: normalizeZIndex(document.layers.filter((layer) => layer.id !== layerId)),
  })
}

export function moveLayer(
  document: HandoutDocument,
  layerId: string,
  targetIndex: number,
): HandoutDocument {
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

export function updateCanvas(
  document: HandoutDocument,
  canvas: Partial<CanvasSettings>,
): HandoutDocument {
  return touch({
    ...document,
    canvas: {
      ...document.canvas,
      ...canvas,
      effects: normalizeEffects({
        ...document.canvas.effects,
        ...canvas.effects,
      }),
    },
  })
}
