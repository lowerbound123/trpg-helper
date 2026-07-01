import { describe, expect, it } from 'vitest'

import type { ShapeLayer } from './handout'
import { polygonPoints, shapeKonvaConfig, shapePreviewPoints } from './shape-rendering'

function polygonLayer(overrides: Partial<ShapeLayer> = {}): ShapeLayer {
  return {
    id: 'polygon-1',
    type: 'shape',
    name: 'polygon-1',
    shape: 'polygon',
    x: 0,
    y: 0,
    width: 80,
    height: 60,
    rotation: 0,
    flipX: false,
    opacity: 1,
    blendMode: 'source-over',
    visible: true,
    locked: false,
    zIndex: 0,
    effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
    mask: null,
    fill: 'rgba(14,165,233,0.12)',
    stroke: '#0f766e',
    strokeWidth: 3,
    cornerRadius: 16,
    lineStartArrow: 'none',
    lineEndArrow: 'none',
    lineArrowSize: 1,
    lineStyle: 'solid',
    polygonPoints: [
      { x: 0, y: 0 },
      { x: 80, y: 10 },
      { x: 40, y: 60 },
    ],
    ...overrides,
  }
}

describe('shape rendering', () => {
  it('renders custom polygon points as a closed Konva line', () => {
    const layer = polygonLayer()

    expect(polygonPoints(layer)).toEqual([0, 0, 80, 10, 40, 60])
    expect(shapeKonvaConfig(layer, { x: 20, y: 30 })).toMatchObject({
      x: 20,
      y: 30,
      points: [0, 0, 80, 10, 40, 60],
      closed: true,
      fill: 'rgba(14,165,233,0.12)',
      stroke: '#0f766e',
      strokeWidth: 3,
    })
  })

  it('falls back to a bounds-sized closed polygon for malformed polygon data', () => {
    expect(polygonPoints(polygonLayer({ polygonPoints: [] }))).toEqual([
      0, 0,
      80, 0,
      80, 60,
      0, 60,
    ])
    expect(shapePreviewPoints('polygon')).toBe('8,8 28,6 32,19 21,31 6,25')
  })
})
