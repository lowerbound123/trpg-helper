export type PaintMode = 'brush' | 'eraser'
export type BrushKind = 'pixel' | 'pencil' | 'marker' | 'highlighter' | 'airbrush'

export type StrokePoint = {
  x: number
  y: number
  pressure: number
}

export interface PaintStroke {
  id: string
  points: number[]
  rawPoints?: StrokePoint[]
  strokeWidth: number
  color: string
  tension: number
  mode: PaintMode
  brushKind?: BrushKind
  opacity?: number
  eraserOpacity?: number
}

export function normalizePaintStroke(stroke: PaintStroke): PaintStroke {
  const rawPoints = stroke.rawPoints?.length
    ? stroke.rawPoints
    : pointsToStrokePoints(stroke.points)
  return {
    ...stroke,
    points: stroke.points ?? strokePointsToFlat(rawPoints),
    rawPoints,
    brushKind: stroke.brushKind ?? 'pixel',
    opacity: stroke.opacity ?? (stroke.brushKind === 'highlighter' ? 0.38 : 1),
    eraserOpacity: stroke.eraserOpacity ?? 1,
  }
}

export function ensureRenderableStrokePoints(points: StrokePoint[]): StrokePoint[] {
  if (points.length !== 1) return points
  const point = points[0]
  return [
    point,
    { ...point, x: point.x + 0.1, y: point.y + 0.1 },
  ]
}

export function ensureRenderablePaintStroke(stroke: PaintStroke): PaintStroke {
  const rawPoints = ensureRenderableStrokePoints(
    stroke.rawPoints?.length ? stroke.rawPoints : pointsToStrokePoints(stroke.points),
  )
  return {
    ...stroke,
    rawPoints,
    points: strokePointsToFlat(rawPoints),
  }
}

export function pointsToStrokePoints(points: number[], pressure = 0.5): StrokePoint[] {
  const result: StrokePoint[] = []
  for (let index = 0; index < points.length; index += 2) {
    result.push({
      x: points[index] ?? 0,
      y: points[index + 1] ?? 0,
      pressure,
    })
  }
  return result
}

export function strokePointsToFlat(points: StrokePoint[]): number[] {
  return points.flatMap((point) => [point.x, point.y])
}
