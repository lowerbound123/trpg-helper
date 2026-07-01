import type { LineArrowKind, ShapeKind, ShapeLayer } from './handout'
import { isCurveShape } from './handout'
import { normalizePolygonPoints, polygonPointArray } from './polygon-creation'

type ShapeBaseConfig = Record<string, unknown>

export function shapeKonvaConfig(layer: ShapeLayer, base: ShapeBaseConfig) {
  if (isCurveShape(layer.shape)) {
    return {
      ...base,
      fill: layer.fill,
      stroke: layer.stroke,
      strokeWidth: layer.strokeWidth,
      sceneFunc: curveSceneFunc(layer),
    }
  }

  if (layer.shape === 'ellipse') {
    return {
      ...base,
      x: layer.x + layer.width / 2,
      y: layer.y + layer.height / 2,
      radiusX: layer.width / 2,
      radiusY: layer.height / 2,
      fill: layer.fill,
      stroke: layer.stroke,
      strokeWidth: layer.strokeWidth,
    }
  }

  if (layer.shape === 'round-rect') {
    return {
      ...base,
      fill: layer.fill,
      stroke: layer.stroke,
      strokeWidth: layer.strokeWidth,
      cornerRadius: layer.cornerRadius,
    }
  }

  if (layer.shape === 'line') {
    return base
  }

  if (['diamond', 'hexagon-h', 'hexagon-v', 'polygon'].includes(layer.shape)) {
    return {
      ...base,
      points: polygonPoints(layer),
      fill: layer.fill,
      stroke: layer.stroke,
      strokeWidth: layer.strokeWidth,
      closed: true,
    }
  }

  return {
    ...base,
    fill: layer.fill,
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth,
  }
}

export function curveSceneFunc(layer: ShapeLayer) {
  return (context: any, shape: unknown) => {
    const points = layer.curvePoints
    if (!points) return
    context.beginPath()
    context.moveTo(points.start.x, points.start.y)
    if (layer.shape === 'quadratic-curve' && points.control) {
      context.quadraticCurveTo(points.control.x, points.control.y, points.end.x, points.end.y)
    } else if (layer.shape === 'cubic-bezier' && points.control1 && points.control2) {
      context.bezierCurveTo(
        points.control1.x,
        points.control1.y,
        points.control2.x,
        points.control2.y,
        points.end.x,
        points.end.y,
      )
    }
    context.fillStrokeShape?.(shape)
  }
}

export function polygonPoints(layer: ShapeLayer) {
  if (layer.shape === 'polygon') {
    return polygonPointArray(normalizePolygonPoints(layer))
  }
  if (layer.shape === 'diamond') {
    return [
      layer.width / 2, 0,
      layer.width, layer.height / 2,
      layer.width / 2, layer.height,
      0, layer.height / 2,
    ]
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

export function lineDash(layer: ShapeLayer) {
  if (layer.lineStyle === 'dashed') {
    return [
      Math.max(18, layer.strokeWidth * 2.8),
      Math.max(12, layer.strokeWidth * 1.9),
    ]
  }
  if (layer.lineStyle === 'dotted') {
    const gap = Math.max(10, layer.strokeWidth * 2.4)
    return [0.001, gap]
  }
  return []
}

export function lineHitConfig(layer: ShapeLayer) {
  const padding = Math.max(24, layer.strokeWidth + 18)
  return {
    x: 0,
    y: -padding / 2,
    width: layer.width,
    height: layer.height + padding,
    fill: 'rgba(0,0,0,0.001)',
    strokeEnabled: false,
  }
}

export function lineVisualConfig(layer: ShapeLayer, offsetY = 0) {
  const arrowScale = Math.max(0.25, layer.lineArrowSize || 1)
  const pointerLength = Math.max(8, 16 * arrowScale)
  const pointerWidth = Math.max(8, 14 * arrowScale)
  return {
    points: [0, layer.height / 2 + offsetY, layer.width, layer.height / 2 + offsetY],
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth,
    dash: lineDash(layer),
    dashEnabled: layer.lineStyle === 'dashed' || layer.lineStyle === 'dotted',
    lineCap: 'round',
    lineJoin: 'round',
    pointerAtBeginning: layer.lineStartArrow === 'triangle',
    pointerAtEnding: layer.lineEndArrow === 'triangle',
    pointerLength,
    pointerWidth,
    listening: false,
  }
}

export function lineDoubleOffset(layer: ShapeLayer) {
  return Math.max(3, layer.strokeWidth * 1.2)
}

export function lineHandleConfig(layer: ShapeLayer) {
  return {
    x: layer.width / 2,
    y: layer.height / 2,
    radius: Math.max(4, Math.min(7, layer.strokeWidth + 2)),
    fill: '#14b8a6',
    stroke: '#ffffff',
    strokeWidth: 2,
    opacity: 0.9,
  }
}

function arrowPoints(kind: LineArrowKind, side: 'start' | 'end', layer: ShapeLayer) {
  const y = layer.height / 2
  const size = Math.max(8, 16 * Math.max(0.25, layer.lineArrowSize || 1))
  const x = side === 'start' ? 0 : layer.width
  const direction = side === 'start' ? 1 : -1
  if (kind === 'triangle') {
    return [
      x, y,
      x + direction * size, y - size * 0.55,
      x + direction * size, y + size * 0.55,
    ]
  }
  if (kind === 'notched') {
    return [
      x, y,
      x + direction * size, y - size * 0.58,
      x + direction * size * 0.62, y,
      x + direction * size, y + size * 0.58,
    ]
  }
  if (kind === 'bar') {
    return [
      x, y - size * 0.6,
      x, y + size * 0.6,
    ]
  }
  return []
}

export function arrowDotConfig(side: 'start' | 'end', layer: ShapeLayer) {
  return {
    x: side === 'start' ? 0 : layer.width,
    y: layer.height / 2,
    radius: Math.max(4, layer.strokeWidth * 1.8) * Math.max(0.25, layer.lineArrowSize || 1),
    fill: layer.stroke,
    listening: false,
  }
}

export function arrowLineConfig(kind: LineArrowKind, side: 'start' | 'end', layer: ShapeLayer) {
  return {
    points: arrowPoints(kind, side, layer),
    fill: kind === 'triangle' || kind === 'notched' ? layer.stroke : undefined,
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth,
    closed: kind === 'triangle' || kind === 'notched',
    listening: false,
  }
}

function customArrowVisible(kind: LineArrowKind) {
  return kind !== 'none' && kind !== 'dot' && kind !== 'triangle'
}

export function manualArrowVisible(kind: LineArrowKind, layer: ShapeLayer) {
  return customArrowVisible(kind) || (layer.lineStyle === 'double' && kind === 'triangle')
}

export function shapePreviewPoints(kind: ShapeKind) {
  if (kind === 'diamond') return '18,4 32,18 18,32 4,18'
  if (kind === 'hexagon-v') return '18,3 31,10 31,26 18,33 5,26 5,10'
  if (kind === 'hexagon-h') return '10,5 26,5 33,18 26,31 10,31 3,18'
  if (kind === 'polygon') return '8,8 28,6 32,19 21,31 6,25'
  return ''
}

export function showLineHandle(layer: ShapeLayer, selectedLayerIds: string[]) {
  return selectedLayerIds.includes(layer.id) && layer.strokeWidth < 10
}
