import { describe, expect, it } from 'vitest'

import type { HandoutLayer, LayerMask, MaskShapeOperation, PaintStroke } from './handout'
import { MaskGpuRuntime, maskLayerCompositeSignature, maskRuntimeContentKey } from './mask-runtime'
import { maskStrokeStrength, maskStrokeTargetValue } from './mask-shapes'
import { identityMatrix, maskTransformFromLayer, syncMaskWithLayerDelta } from './mask-geometry'

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
    shapes: [],
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
    updatedAt: '2026-06-30T00:00:00.000Z',
    ...input,
  } as LayerMask
}

function shape(input: Partial<MaskShapeOperation> = {}): MaskShapeOperation {
  return {
    id: 'shape-1',
    shape: 'rect',
    x: 10,
    y: 10,
    width: 50,
    height: 40,
    value: 0,
    strokeWidth: 4,
    ...input,
  }
}

function stroke(input: Partial<PaintStroke>): PaintStroke {
  return {
    id: 'stroke-1',
    points: [0, 0, 10, 10],
    strokeWidth: 10,
    color: '#000000',
    tension: 0,
    ...input,
  } as PaintStroke
}

describe('mask runtime semantics', () => {
  it('uses brush and eraser opacity as cumulative mask strength', () => {
    expect(maskStrokeTargetValue(stroke({ mode: 'brush', opacity: 1, color: '#000000' }))).toBe(255)
    expect(maskStrokeTargetValue(stroke({ mode: 'brush', opacity: 0.4, color: '#ffffff' }))).toBe(255)
    expect(maskStrokeTargetValue(stroke({ mode: 'brush', opacity: 0 }))).toBe(255)
    expect(maskStrokeTargetValue(stroke({ mode: 'eraser', eraserOpacity: 1 }))).toBe(0)
    expect(maskStrokeTargetValue(stroke({ mode: 'eraser', eraserOpacity: 0.4 }))).toBe(0)
    expect(maskStrokeTargetValue(stroke({ mode: 'eraser', eraserOpacity: 0 }))).toBe(0)
    expect(maskStrokeStrength(stroke({ mode: 'brush', opacity: 0.5 }))).toBe(0.5)
    expect(maskStrokeStrength(stroke({ mode: 'eraser', eraserOpacity: 0.5 }))).toBe(0.5)
  })

  it('does not change the layer composite signature for document-space layer transforms', () => {
    const beforeLayer = layer({ x: 20, y: 30, rotation: 15, flipX: false })
    const beforeMask = mask({ matrix: maskTransformFromLayer(beforeLayer) })
    const before = { ...beforeLayer, mask: beforeMask } as HandoutLayer
    const transformed = layer({ x: 140, y: 80, rotation: 45, flipX: true })
    const transformedMask = syncMaskWithLayerDelta(beforeLayer, transformed, beforeMask)
    const after = { ...transformed, mask: transformedMask } as HandoutLayer

    expect(maskLayerCompositeSignature(before, 'full')).toBe(maskLayerCompositeSignature(after, 'full'))
  })

  it('changes the layer composite signature when the mask moves independently', () => {
    const source = layer({ x: 20, y: 30, rotation: 15 })
    const sourceMask = mask({ matrix: maskTransformFromLayer(source) })
    const before = { ...source, mask: sourceMask } as HandoutLayer
    const after = {
      ...source,
      mask: {
        ...sourceMask,
        matrix: [1, 0, 0, 1, 80, 90],
      },
    } as HandoutLayer

    expect(maskLayerCompositeSignature(before, 'full')).not.toBe(maskLayerCompositeSignature(after, 'full'))
  })

  it('changes the layer composite signature when mask stroke revision changes', () => {
    const source = layer({ x: 20, y: 30, rotation: 15 })
    const sourceMask = mask({ matrix: maskTransformFromLayer(source) })
    const before = { ...source, mask: sourceMask } as HandoutLayer
    const after = {
      ...source,
      mask: {
        ...sourceMask,
        version: 2,
        sourceVersion: 2,
        strokes: [stroke({ mode: 'eraser', eraserOpacity: 1 })],
        tiles: { '0:0': { version: 1, updatedAt: '2026-06-30T00:00:01.000Z' } },
      },
    } as HandoutLayer

    expect(maskLayerCompositeSignature(before, 'full')).not.toBe(maskLayerCompositeSignature(after, 'full'))
  })

  it('uses stroke identity and geometry in the runtime content key', () => {
    const first = mask({
      version: 2,
      strokes: [stroke({ id: 'stroke-a', mode: 'eraser', points: [0, 0, 10, 10], strokeWidth: 10 })],
    })
    const second = mask({
      version: 2,
      strokes: [stroke({ id: 'stroke-b', mode: 'eraser', points: [0, 0, 20, 20], strokeWidth: 10 })],
    })

    expect(maskRuntimeContentKey(first)).not.toBe(maskRuntimeContentKey(second))
  })

  it('uses mask shape identity, geometry, and gray value in the runtime content key', () => {
    const first = mask({
      version: 2,
      shapes: [shape({ id: 'shape-a', value: 255 })],
    })
    const second = mask({
      version: 2,
      shapes: [shape({ id: 'shape-a', value: 0 })],
    })

    expect(maskRuntimeContentKey(first)).not.toBe(maskRuntimeContentKey(second))
  })

  it('disposes runtime mask states that are no longer present in the document', () => {
    const runtime = new MaskGpuRuntime()
    runtime.ensureMask(mask({ id: 'keep-mask' }))
    runtime.ensureMask(mask({ id: 'drop-mask' }))

    runtime.disposeMissing(['keep-mask'], [])

    expect(runtime.maskStateCount()).toBe(1)
  })

  it('queues mask runtime operations and flushes them later', () => {
    const runtime = new MaskGpuRuntime()
    const sourceMask = mask()
    const nextStroke = stroke({ id: 'pending-stroke', mode: 'eraser', eraserOpacity: 0.5 })

    runtime.queueMaskRuntimeOperation(sourceMask, { id: nextStroke.id, kind: 'stroke', stroke: nextStroke }, sourceMask.version + 1)

    expect(runtime.hasPendingMaskRuntimeOperations(sourceMask.id)).toBe(true)
    expect(runtime.pendingMaskRuntimeOperationCount(sourceMask.id)).toBe(1)

    runtime.flushMaskRuntimeOperations(sourceMask.id)

    expect(runtime.hasPendingMaskRuntimeOperations(sourceMask.id)).toBe(false)
    expect(runtime.pendingMaskRuntimeOperationCount(sourceMask.id)).toBe(0)
  })
})
