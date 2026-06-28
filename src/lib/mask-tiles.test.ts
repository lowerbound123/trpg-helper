import { describe, expect, it } from 'vitest'

import type { LayerMask, PaintStroke } from './handout'
import { identityMatrix } from './mask-geometry'
import { createMaskTileStore } from './mask-tiles'

function mask(input: Partial<LayerMask> = {}): LayerMask {
  return {
    id: 'mask-large',
    enabled: true,
    path: null,
    highResPath: 'masks/mask-large.png',
    width: 12000,
    height: 9000,
    matrix: identityMatrix(),
    tileSize: 512,
    defaultAlpha: 255,
    tiles: {},
    strokes: [],
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    flipX: false,
    previewScale: 1,
    cache: null,
    sourceVersion: 1,
    version: 1,
    updatedAt: '2026-06-28T00:00:00.000Z',
    ...input,
  } as LayerMask
}

function stroke(input: Partial<PaintStroke> = {}): PaintStroke {
  return {
    id: 'stroke-1',
    points: [1020, 1020, 1030, 1030, 1540, 1540],
    strokeWidth: 24,
    color: '#000000',
    tension: 0,
    mode: 'eraser',
    eraserOpacity: 1,
    ...input,
  }
}

describe('mask tile store', () => {
  it('does not allocate tiles for an untouched all-white large mask', () => {
    const store = createMaskTileStore(mask())

    expect(store.allocatedTileKeys()).toEqual([])
  })

  it('allocates only stroke dirty tiles for a large mask update', () => {
    const store = createMaskTileStore(mask())

    const updated = store.applyStroke(stroke())

    expect(store.allocatedTileKeys()).toEqual(['1:1', '2:1', '3:1', '1:2', '2:2', '3:2', '1:3', '2:3', '3:3'])
    expect(Object.keys(updated.tiles)).toEqual(store.allocatedTileKeys())
    expect(updated.strokes).toHaveLength(1)
    expect(updated.version).toBe(2)
  })
})
