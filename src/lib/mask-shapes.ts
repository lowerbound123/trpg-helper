import type {
  CanvasPoint,
  CurvePoints,
  LayerMask,
  MaskEditOperation,
  MaskShapeOperation,
  NewShapeLayerInput,
  ShapeKind,
} from './handout'
import { documentPointToMaskLocal } from './mask-geometry'
import { buildPolygonLayerInput } from './polygon-creation'

type TileBoundsInput = {
  maskWidth: number
  maskHeight: number
  tileSize: number
}

export function maskShapeGrayValue(input: { value?: number; color?: string }) {
  if (typeof input.value === 'number') return clampByte(input.value)
  return 255
}

export function composeMaskGrayPixel(current: number, target: number, coverage: number) {
  return clampByte(current + (target - current) * clampUnit(coverage))
}

export function maskBrushValueFromOpacity(opacity?: number) {
  return clampByte(clampUnit(opacity ?? 1) * 255)
}

export function maskEraserValueFromOpacity(eraserOpacity?: number) {
  return clampByte((1 - clampUnit(eraserOpacity ?? 1)) * 255)
}

export function maskStrokeTargetValue(stroke: { mode?: string; opacity?: number; eraserOpacity?: number }) {
  return stroke.mode === 'eraser'
    ? maskEraserValueFromOpacity(stroke.eraserOpacity)
    : maskBrushValueFromOpacity(stroke.opacity)
}

export function maskStrokeStrength(_stroke: { mode?: string; opacity?: number; eraserOpacity?: number }) {
  return 1
}

export function maskShapeContentKey(shape: MaskShapeOperation) {
  return [
    shape.id,
    shape.shape,
    shape.x,
    shape.y,
    shape.width,
    shape.height,
    maskShapeGrayValue(shape),
    shape.strokeWidth,
    shape.cornerRadius ?? '',
    shape.curvePoints ? curvePointKey(shape.curvePoints) : '',
    shape.polygonPoints?.map((point) => `${point.x},${point.y}`).join(';') ?? '',
  ].join(':')
}

export function maskEditOperations(mask: LayerMask): MaskEditOperation[] {
  if (mask.operations?.length) return mask.operations
  return [
    ...(mask.strokes ?? []).map((stroke) => ({ id: stroke.id, kind: 'stroke' as const, stroke })),
    ...(mask.shapes ?? []).map((shape) => ({ id: shape.id, kind: 'shape' as const, shape })),
  ]
}

export function normalizeMaskCanvasToSingleChannel(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const safeWidth = Math.max(1, Math.round(width))
  const safeHeight = Math.max(1, Math.round(height))
  const pixels = context.getImageData(0, 0, safeWidth, safeHeight)
  for (let index = 0; index < pixels.data.length; index += 4) {
    const gray = clampByte((pixels.data[index] + pixels.data[index + 1] + pixels.data[index + 2]) / 3)
    pixels.data[index] = gray
    pixels.data[index + 1] = gray
    pixels.data[index + 2] = gray
    pixels.data[index + 3] = 255
  }
  context.putImageData(pixels, 0, 0)
}

export function maskShapeTiles(shape: MaskShapeOperation, input: TileBoundsInput) {
  const bounds = maskShapeBounds(shape)
  const padding = Math.max(0, shape.strokeWidth / 2)
  return tileKeysForBounds({
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding,
    ...input,
  })
}

export function defaultMaskShapeSize(shape: ShapeKind) {
  if (shape === 'line') return { width: 320, height: 24 }
  if (shape === 'quadratic-curve') return { width: 320, height: 180 }
  if (shape === 'cubic-bezier') return { width: 360, height: 220 }
  return { width: 220, height: 160 }
}

export function createMaskShapeOperation(input: {
  shape: ShapeKind
  x: number
  y: number
  width?: number
  height?: number
  value?: number
  strokeWidth?: number
  cornerRadius?: number
  curvePoints?: CurvePoints
  polygonPoints?: CanvasPoint[]
}): MaskShapeOperation {
  const size = defaultMaskShapeSize(input.shape)
  const width = Math.max(1, input.width ?? size.width)
  const height = Math.max(1, input.height ?? size.height)
  return {
    id: crypto.randomUUID(),
    shape: input.shape,
    x: input.x,
    y: input.y,
    width,
    height,
    value: maskShapeGrayValue({ value: input.value }),
    strokeWidth: Math.max(0, input.strokeWidth ?? 3),
    cornerRadius: input.cornerRadius ?? 16,
    curvePoints: input.curvePoints ?? defaultMaskCurvePoints(input.shape, width, height),
    polygonPoints: input.polygonPoints,
  }
}

export function createMaskPolygonOperation(input: NewShapeLayerInput, value: number): MaskShapeOperation | undefined {
  if (input.shape !== 'polygon' || !input.polygonPoints?.length) return undefined
  return createMaskShapeOperation({
    shape: 'polygon',
    x: input.x ?? 0,
    y: input.y ?? 0,
    width: input.width,
    height: input.height,
    value,
    polygonPoints: input.polygonPoints,
  })
}

export function createMaskPolygonOperationFromDocumentInput(
  input: NewShapeLayerInput,
  mask: LayerMask,
  value: number,
): MaskShapeOperation | undefined {
  if (input.shape !== 'polygon' || !input.polygonPoints?.length) return undefined
  const documentPoints = input.polygonPoints.map((point) => ({
    x: (input.x ?? 0) + point.x,
    y: (input.y ?? 0) + point.y,
  }))
  const localInput = buildPolygonLayerInput(documentPoints.map((point) => documentPointToMaskLocal(mask, point)))
  return localInput ? createMaskPolygonOperation(localInput, value) : undefined
}

export function drawMaskShapeToContext(context: CanvasRenderingContext2D, shape: MaskShapeOperation) {
  const gray = maskShapeGrayValue(shape)
  context.save()
  context.globalCompositeOperation = 'source-over'
  context.globalAlpha = 1
  context.fillStyle = `rgb(${gray},${gray},${gray})`
  context.strokeStyle = `rgb(${gray},${gray},${gray})`
  context.lineWidth = Math.max(0, shape.strokeWidth)
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  drawMaskShapePath(context, shape)
  if (closedShape(shape.shape)) context.fill()
  if (shape.strokeWidth > 0 || !closedShape(shape.shape)) context.stroke()
  context.restore()
}

export function drawMaskOperationToContext(context: CanvasRenderingContext2D, operation: MaskEditOperation) {
  if (operation.kind === 'shape') {
    drawMaskShapeToContext(context, operation.shape)
    return
  }
  const stroke = operation.stroke
  const gray = maskStrokeTargetValue(stroke)
  context.save()
  context.globalCompositeOperation = 'source-over'
  context.globalAlpha = maskStrokeStrength(stroke)
  context.strokeStyle = `rgb(${gray},${gray},${gray})`
  context.lineWidth = Math.max(1, stroke.strokeWidth)
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  context.moveTo(stroke.points[0] ?? 0, stroke.points[1] ?? 0)
  for (let index = 2; index < stroke.points.length; index += 2) {
    context.lineTo(stroke.points[index], stroke.points[index + 1])
  }
  context.stroke()
  context.restore()
}

function drawMaskShapePath(context: CanvasRenderingContext2D, shape: MaskShapeOperation) {
  if (shape.shape === 'ellipse') {
    context.ellipse(shape.x + shape.width / 2, shape.y + shape.height / 2, shape.width / 2, shape.height / 2, 0, 0, Math.PI * 2)
    return
  }
  if (shape.shape === 'round-rect' && typeof context.roundRect === 'function') {
    context.roundRect(shape.x, shape.y, shape.width, shape.height, shape.cornerRadius ?? 0)
    return
  }
  if (shape.shape === 'line') {
    context.moveTo(shape.x, shape.y + shape.height / 2)
    context.lineTo(shape.x + shape.width, shape.y + shape.height / 2)
    return
  }
  if (shape.shape === 'quadratic-curve') {
    const points = shape.curvePoints ?? defaultMaskCurvePoints(shape.shape, shape.width, shape.height)
    context.moveTo(shape.x + points!.start.x, shape.y + points!.start.y)
    context.quadraticCurveTo(shape.x + points!.control!.x, shape.y + points!.control!.y, shape.x + points!.end.x, shape.y + points!.end.y)
    return
  }
  if (shape.shape === 'cubic-bezier') {
    const points = shape.curvePoints ?? defaultMaskCurvePoints(shape.shape, shape.width, shape.height)
    context.moveTo(shape.x + points!.start.x, shape.y + points!.start.y)
    context.bezierCurveTo(
      shape.x + points!.control1!.x,
      shape.y + points!.control1!.y,
      shape.x + points!.control2!.x,
      shape.y + points!.control2!.y,
      shape.x + points!.end.x,
      shape.y + points!.end.y,
    )
    return
  }
  const points = maskPolygonPoints(shape)
  if (points.length >= 3) {
    context.moveTo(shape.x + points[0].x, shape.y + points[0].y)
    for (const point of points.slice(1)) context.lineTo(shape.x + point.x, shape.y + point.y)
    context.closePath()
    return
  }
  context.rect(shape.x, shape.y, shape.width, shape.height)
}

function maskPolygonPoints(shape: MaskShapeOperation): CanvasPoint[] {
  if (shape.shape === 'polygon' && shape.polygonPoints?.length) return shape.polygonPoints
  if (shape.shape === 'diamond') {
    return [
      { x: shape.width / 2, y: 0 },
      { x: shape.width, y: shape.height / 2 },
      { x: shape.width / 2, y: shape.height },
      { x: 0, y: shape.height / 2 },
    ]
  }
  if (shape.shape === 'hexagon-v') {
    return [
      { x: shape.width / 2, y: 0 },
      { x: shape.width, y: shape.height * 0.25 },
      { x: shape.width, y: shape.height * 0.75 },
      { x: shape.width / 2, y: shape.height },
      { x: 0, y: shape.height * 0.75 },
      { x: 0, y: shape.height * 0.25 },
    ]
  }
  if (shape.shape === 'hexagon-h') {
    return [
      { x: shape.width * 0.25, y: 0 },
      { x: shape.width * 0.75, y: 0 },
      { x: shape.width, y: shape.height / 2 },
      { x: shape.width * 0.75, y: shape.height },
      { x: shape.width * 0.25, y: shape.height },
      { x: 0, y: shape.height / 2 },
    ]
  }
  return []
}

function maskShapeBounds(shape: MaskShapeOperation) {
  const points = shape.shape === 'line'
    ? [{ x: shape.x, y: shape.y + shape.height / 2 }, { x: shape.x + shape.width, y: shape.y + shape.height / 2 }]
    : ['quadratic-curve', 'cubic-bezier'].includes(shape.shape)
      ? curveBoundsPoints(shape)
      : maskPolygonPoints(shape).length
        ? maskPolygonPoints(shape).map((point) => ({ x: shape.x + point.x, y: shape.y + point.y }))
        : [{ x: shape.x, y: shape.y }, { x: shape.x + shape.width, y: shape.y + shape.height }]
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  }
}

function curveBoundsPoints(shape: MaskShapeOperation) {
  const points = shape.curvePoints ?? defaultMaskCurvePoints(shape.shape, shape.width, shape.height)
  if (!points) return [{ x: shape.x, y: shape.y }, { x: shape.x + shape.width, y: shape.y + shape.height }]
  return [
    points.start,
    points.control,
    points.control1,
    points.control2,
    points.end,
  ].filter((point): point is CanvasPoint => Boolean(point)).map((point) => ({ x: shape.x + point.x, y: shape.y + point.y }))
}

function tileKeysForBounds(input: {
  minX: number
  minY: number
  maxX: number
  maxY: number
  maskWidth: number
  maskHeight: number
  tileSize: number
}) {
  if (input.maxX < 0 || input.maxY < 0 || input.minX > input.maskWidth || input.minY > input.maskHeight) return []
  const maxTileX = Math.ceil(input.maskWidth / input.tileSize) - 1
  const maxTileY = Math.ceil(input.maskHeight / input.tileSize) - 1
  const minX = clamp(Math.floor(input.minX / input.tileSize), 0, maxTileX)
  const maxX = clamp(Math.floor(input.maxX / input.tileSize), 0, maxTileX)
  const minY = clamp(Math.floor(input.minY / input.tileSize), 0, maxTileY)
  const maxY = clamp(Math.floor(input.maxY / input.tileSize), 0, maxTileY)
  const keys: string[] = []
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) keys.push(`${x}:${y}`)
  }
  return keys
}

function defaultMaskCurvePoints(shape: ShapeKind, width: number, height: number): CurvePoints | undefined {
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

function closedShape(shape: ShapeKind) {
  return !['line', 'quadratic-curve', 'cubic-bezier'].includes(shape)
}

function curvePointKey(points: CurvePoints) {
  return [
    points.start,
    points.control,
    points.control1,
    points.control2,
    points.end,
  ].filter(Boolean).map((point) => `${point!.x},${point!.y}`).join(';')
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function clampByte(value: number) {
  return clamp(Math.round(Number.isFinite(value) ? value : 255), 0, 255)
}

function clampUnit(value: number) {
  return clamp(Number.isFinite(value) ? value : 1, 0, 1)
}
