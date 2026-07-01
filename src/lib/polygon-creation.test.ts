import { describe, expect, it } from 'vitest'

import {
  buildPolygonLayerInput,
  defaultPolygonPoints,
  isClosingPolygonPoint,
} from './polygon-creation'

describe('polygon creation helpers', () => {
  it('normalizes canvas points into a layer-local polygon input', () => {
    expect(buildPolygonLayerInput([
      { x: 50, y: 70 },
      { x: 130, y: 90 },
      { x: 80, y: 160 },
    ])).toEqual({
      shape: 'polygon',
      x: 50,
      y: 70,
      width: 80,
      height: 90,
      polygonPoints: [
        { x: 0, y: 0 },
        { x: 80, y: 20 },
        { x: 30, y: 90 },
      ],
    })
  })

  it('rejects drafts with fewer than three points', () => {
    expect(buildPolygonLayerInput([
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ])).toBeUndefined()
  })

  it('detects first-point closing using a stage-scale adjusted threshold', () => {
    const points = [
      { x: 100, y: 100 },
      { x: 160, y: 110 },
      { x: 120, y: 170 },
    ]

    expect(isClosingPolygonPoint(points, { x: 103, y: 104 }, 1)).toBe(true)
    expect(isClosingPolygonPoint(points, { x: 112, y: 100 }, 2)).toBe(false)
    expect(isClosingPolygonPoint(points.slice(0, 2), { x: 100, y: 100 }, 1)).toBe(false)
  })

  it('provides a safe default closed polygon for malformed legacy data', () => {
    expect(defaultPolygonPoints(40, 30)).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 },
      { x: 0, y: 30 },
    ])
  })
})
