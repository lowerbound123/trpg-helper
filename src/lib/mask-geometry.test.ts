import { describe, expect, it } from 'vitest'

import type { HandoutLayer, LayerMask } from './handout'
import {
  documentPointToMaskLocal,
  identityMatrix,
  layerWorldMatrix,
  maskTransformFromLayer,
  matrixApplyToPoint,
  matrixNearlyEqual,
  syncMaskWithLayerDelta,
  tilesForStroke,
} from './mask-geometry'

function layer(input: Partial<HandoutLayer> = {}): HandoutLayer {
  return {
    id: 'layer-1',
    type: 'image',
    name: 'Image',
    assetId: 'asset-1',
    x: 100,
    y: 80,
    width: 200,
    height: 120,
    rotation: 0,
    flipX: false,
    opacity: 1,
    blendMode: 'source-over',
    visible: true,
    locked: false,
    zIndex: 0,
    effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
    mask: null,
    ...input,
  } as HandoutLayer
}

function mask(input: Partial<LayerMask> = {}): LayerMask {
  return {
    id: 'mask-1',
    enabled: true,
    path: null,
    highResPath: 'masks/mask-1.png',
    width: 200,
    height: 120,
    matrix: identityMatrix(),
    tileSize: 512,
    defaultAlpha: 255,
    tiles: {},
    strokes: [],
    version: 1,
    updatedAt: '2026-06-28T00:00:00.000Z',
    ...input,
  } as LayerMask
}

describe('mask geometry', () => {
  it('creates a mask transform that matches the layer world transform', () => {
    const source = layer({ x: 40, y: 60, width: 300, height: 180, rotation: 30, flipX: true })

    expect(matrixNearlyEqual(maskTransformFromLayer(source), layerWorldMatrix(source))).toBe(true)
  })

  it('syncs a layer mask with layer transform deltas without changing mask local pixels', () => {
    const before = layer({ x: 40, y: 60, width: 300, height: 180, rotation: 30 })
    const after = layer({ x: 140, y: 120, width: 300, height: 180, rotation: 75 })
    const originalMask = mask({ matrix: maskTransformFromLayer(before) })

    const synced = syncMaskWithLayerDelta(before, after, originalMask)

    expect(matrixNearlyEqual(synced.matrix, maskTransformFromLayer(after))).toBe(true)
  })

  it('lets the mask move independently without changing the layer transform', () => {
    const source = layer({ x: 40, y: 60, width: 300, height: 180, rotation: 30 })
    const originalMask = mask({ matrix: maskTransformFromLayer(source) })
    const movedMask = { ...originalMask, matrix: [1, 0, 0, 1, 12, 24] as LayerMask['matrix'] }

    expect(matrixNearlyEqual(layerWorldMatrix(source), maskTransformFromLayer(source))).toBe(true)
    expect(matrixNearlyEqual(movedMask.matrix, layerWorldMatrix(source))).toBe(false)
  })

  it('converts document brush points into mask-local coordinates through the inverse matrix', () => {
    const source = layer({ x: 100, y: 80, width: 200, height: 120, rotation: 90 })
    const targetMask = mask({ matrix: maskTransformFromLayer(source) })
    const documentPoint = matrixApplyToPoint(targetMask.matrix, { x: 20, y: 10 })

    expect(documentPointToMaskLocal(targetMask, documentPoint)).toEqual({ x: 20, y: 10 })
  })

  it('only marks dirty tiles intersecting a large-image brush stroke', () => {
    const dirty = tilesForStroke({
      points: [1020, 1020, 1030, 1030, 1540, 1540],
      strokeWidth: 24,
      maskWidth: 12000,
      maskHeight: 9000,
      tileSize: 512,
    })

    expect(dirty).toEqual(['1:1', '2:1', '3:1', '1:2', '2:2', '3:2', '1:3', '2:3', '3:3'])
    expect(dirty.length).toBeLessThan(16)
  })
})
