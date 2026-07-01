import Konva from 'konva'

import { isCurveShape } from '@/lib/handout'
import type { ShapeLayer } from '@/lib/handout'
import { curveSceneFunc, lineDash, polygonPoints } from '@/lib/shape-rendering'

import { commonConfig } from '../shared'

export function shapeNode(layer: ShapeLayer) {
  const { width: _width, height: _height, ...config } = {
    ...commonConfig(layer),
    fill: layer.fill,
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth,
  }

  if (isCurveShape(layer.shape)) {
    return new Konva.Shape({
      ...config,
      width: layer.width,
      height: layer.height,
      sceneFunc: curveSceneFunc(layer),
    })
  }

  if (layer.shape === 'ellipse') {
    return new Konva.Ellipse({
      ...config,
      x: config.x + layer.width / 2,
      y: config.y + layer.height / 2,
      radiusX: layer.width / 2,
      radiusY: layer.height / 2,
    })
  }

  if (layer.shape === 'line') {
    const group = new Konva.Group(commonConfig(layer))
    const addLine = (offsetY = 0) => {
      group.add(new Konva.Line({
        points: [0, layer.height / 2 + offsetY, layer.width, layer.height / 2 + offsetY],
        stroke: layer.stroke,
        strokeWidth: layer.strokeWidth,
        dash: lineDash(layer),
        dashEnabled: layer.lineStyle === 'dashed' || layer.lineStyle === 'dotted',
        lineCap: 'round',
        lineJoin: 'round',
      }))
    }
    if (layer.lineStyle === 'double') {
      const offset = Math.max(3, layer.strokeWidth * 1.2)
      addLine(-offset)
      addLine(offset)
    } else {
      group.add(new Konva.Arrow({
        points: [0, layer.height / 2, layer.width, layer.height / 2],
        stroke: layer.stroke,
        strokeWidth: layer.strokeWidth,
        dash: lineDash(layer),
        dashEnabled: layer.lineStyle === 'dashed' || layer.lineStyle === 'dotted',
        lineCap: 'round',
        lineJoin: 'round',
        pointerAtBeginning: layer.lineStartArrow === 'triangle',
        pointerAtEnding: layer.lineEndArrow === 'triangle',
        pointerLength: Math.max(8, 16 * Math.max(0.25, layer.lineArrowSize || 1)),
        pointerWidth: Math.max(8, 14 * Math.max(0.25, layer.lineArrowSize || 1)),
      }))
    }
    addArrow(group, layer, 'start')
    addArrow(group, layer, 'end')
    return group
  }

  if (['diamond', 'hexagon-h', 'hexagon-v', 'polygon'].includes(layer.shape)) {
    return new Konva.Line({
      ...config,
      points: polygonPoints(layer),
      closed: true,
    })
  }

  if (layer.shape === 'round-rect') {
    return new Konva.Rect({
      ...config,
      width: layer.width,
      height: layer.height,
      cornerRadius: layer.cornerRadius,
    })
  }

  return new Konva.Rect({
    ...config,
    width: layer.width,
    height: layer.height,
  })
}

function addArrow(group: Konva.Group, layer: ShapeLayer, side: 'start' | 'end') {
  const kind = side === 'start' ? layer.lineStartArrow : layer.lineEndArrow
  if (kind === 'none' || (kind === 'triangle' && layer.lineStyle !== 'double')) return
  const y = layer.height / 2
  const size = Math.max(8, 16 * Math.max(0.25, layer.lineArrowSize || 1))
  const x = side === 'start' ? 0 : layer.width
  const direction = side === 'start' ? 1 : -1
  if (kind === 'dot') {
    group.add(new Konva.Circle({
      x,
      y,
      radius: Math.max(4, layer.strokeWidth * 1.8) * Math.max(0.25, layer.lineArrowSize || 1),
      fill: layer.stroke,
    }))
    return
  }
  const points = kind === 'triangle'
    ? [x, y, x + direction * size, y - size * 0.55, x + direction * size, y + size * 0.55]
    : kind === 'notched'
      ? [x, y, x + direction * size, y - size * 0.58, x + direction * size * 0.62, y, x + direction * size, y + size * 0.58]
      : [x, y - size * 0.6, x, y + size * 0.6]
  group.add(new Konva.Line({
    points,
    fill: kind === 'triangle' || kind === 'notched' ? layer.stroke : undefined,
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth,
    closed: kind === 'triangle' || kind === 'notched',
  }))
}
