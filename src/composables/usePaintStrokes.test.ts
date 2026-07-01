import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { HandoutLayer, LayerMask, PaintStroke } from '@/lib/handout'
import { identityMatrix } from '@/lib/mask-geometry'

import { usePaintStrokes } from './usePaintStrokes'

function mask(): LayerMask {
  return {
    id: 'mask-1',
    layerId: 'layer-1',
    enabled: true,
    path: null,
    highResPath: 'masks/mask-1.png',
    width: 100,
    height: 80,
    matrix: identityMatrix(),
    tileSize: 512,
    defaultAlpha: 255,
    tiles: {},
    strokes: [],
    shapes: [],
    operations: [],
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
    updatedAt: '2026-07-01T00:00:00.000Z',
  }
}

function maskedLayer(): HandoutLayer {
  return {
    id: 'layer-1',
    type: 'image',
    name: 'Layer',
    assetId: 'asset-1',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    rotation: 0,
    flipX: false,
    opacity: 1,
    blendMode: 'source-over',
    visible: true,
    locked: false,
    zIndex: 0,
    effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
    mask: mask(),
  } as HandoutLayer
}

describe('usePaintStrokes', () => {
  it('commits a single-click mask brush stroke as a renderable segment', async () => {
    const layer = maskedLayer()
    const paintMask = vi.fn<(mask: LayerMask, stroke: PaintStroke) => Promise<void>>(async () => undefined)
    const editor = {
      maskEditTarget: { kind: 'layer', layerId: layer.id },
      document: {
        canvas: { backgroundMask: null },
        layers: [layer],
      },
      selectedLayer: undefined,
      toolSettings: {
        brushColor: '#111827',
        brushKind: 'pixel',
        brushWidth: 10,
        brushOpacity: 0.5,
        eraserWidth: 12,
        eraserOpacity: 0.5,
        brushTension: 0.35,
      },
      paintMask,
    } as any
    const strokes = usePaintStrokes({
      editor,
      activeTool: ref('brush'),
      maskFeatureEnabled: true,
      canvasPointFromClient: () => ({ x: 20, y: 30 }),
      updateTransformer: vi.fn(),
    })

    strokes.startPaintStroke({
      target: {} as any,
      evt: { button: 0, clientX: 10, clientY: 10 } as MouseEvent,
    })
    strokes.stopPaintStroke()
    await Promise.resolve()

    expect(paintMask).toHaveBeenCalledTimes(1)
    const committed = paintMask.mock.calls[0]?.[1]
    expect(committed).toBeTruthy()
    expect(committed!.rawPoints).toHaveLength(2)
    expect(committed!.points).toEqual([20, 30, 20.1, 30.1])
  })
})
