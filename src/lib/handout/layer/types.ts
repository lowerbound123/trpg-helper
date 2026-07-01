import type { BlendMode, LayerEffects } from '../effects'
import type { CanvasSettings } from '../document'
import type { LayerMask } from '../mask'
import type { BrushKind, PaintStroke } from '../paint'

export type LayerType = 'image' | 'text' | 'shape' | 'paint'
export type ShapeKind =
  | 'rect'
  | 'round-rect'
  | 'ellipse'
  | 'diamond'
  | 'hexagon-h'
  | 'hexagon-v'
  | 'polygon'
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
  polygonPoints?: CanvasPoint[]
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
  polygonPoints?: CanvasPoint[]
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

export type { CanvasSettings }
