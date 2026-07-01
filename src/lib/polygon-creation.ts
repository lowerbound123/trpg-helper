import type { CanvasPoint, NewShapeLayerInput, ShapeLayer } from './handout'

export const MIN_POLYGON_POINTS = 3

function finitePoint(point: CanvasPoint) {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

export function defaultPolygonPoints(width: number, height: number): CanvasPoint[] {
  const safeWidth = Math.max(1, width || 1)
  const safeHeight = Math.max(1, height || 1)
  return [
    { x: 0, y: 0 },
    { x: safeWidth, y: 0 },
    { x: safeWidth, y: safeHeight },
    { x: 0, y: safeHeight },
  ]
}

export function normalizePolygonPoints(layer: ShapeLayer): CanvasPoint[] {
  if (layer.shape !== 'polygon') return []
  const points = layer.polygonPoints?.filter(finitePoint) ?? []
  if (points.length >= MIN_POLYGON_POINTS) return points.map((point) => ({ x: point.x, y: point.y }))
  return defaultPolygonPoints(layer.width, layer.height)
}

export function polygonPointArray(points: CanvasPoint[]) {
  return points.flatMap((point) => [point.x, point.y])
}

export function buildPolygonLayerInput(points: CanvasPoint[]): NewShapeLayerInput | undefined {
  const validPoints = points.filter(finitePoint)
  if (validPoints.length < MIN_POLYGON_POINTS) return undefined
  const minX = Math.min(...validPoints.map((point) => point.x))
  const minY = Math.min(...validPoints.map((point) => point.y))
  const maxX = Math.max(...validPoints.map((point) => point.x))
  const maxY = Math.max(...validPoints.map((point) => point.y))
  return {
    shape: 'polygon',
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    polygonPoints: validPoints.map((point) => ({
      x: point.x - minX,
      y: point.y - minY,
    })),
  }
}

export function resizePolygonLayerGeometry(layer: ShapeLayer, scaleX: number, scaleY: number) {
  const points = normalizePolygonPoints(layer)
  const safeScaleX = Math.abs(Number.isFinite(scaleX) ? scaleX : 1)
  const safeScaleY = Math.abs(Number.isFinite(scaleY) ? scaleY : 1)
  const scaledPoints = points.map((point) => ({
    x: point.x * safeScaleX,
    y: point.y * safeScaleY,
  }))
  const minX = Math.min(...scaledPoints.map((point) => point.x))
  const minY = Math.min(...scaledPoints.map((point) => point.y))
  const maxX = Math.max(...scaledPoints.map((point) => point.x))
  const maxY = Math.max(...scaledPoints.map((point) => point.y))
  return {
    width: Math.max(1, roundPolygonGeometry(maxX - minX)),
    height: Math.max(1, roundPolygonGeometry(maxY - minY)),
    offsetX: roundPolygonGeometry(minX),
    offsetY: roundPolygonGeometry(minY),
    polygonPoints: scaledPoints.map((point) => ({
      x: roundPolygonGeometry(point.x - minX),
      y: roundPolygonGeometry(point.y - minY),
    })),
  }
}

export function polygonCloseThreshold(stageScale: number) {
  return Math.max(8 / Math.max(stageScale || 1, 0.0001), 6)
}

export function isClosingPolygonPoint(points: CanvasPoint[], point: CanvasPoint, stageScale: number) {
  if (points.length < MIN_POLYGON_POINTS) return false
  const first = points[0]
  const distance = Math.hypot(point.x - first.x, point.y - first.y)
  return distance <= polygonCloseThreshold(stageScale)
}

function roundPolygonGeometry(value: number) {
  const rounded = Math.round(value * 1_000_000) / 1_000_000
  return Object.is(rounded, -0) ? 0 : rounded
}
