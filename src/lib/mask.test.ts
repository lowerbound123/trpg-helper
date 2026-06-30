// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HandoutLayer, LayerMask } from './handout'
import { createLayerLocalMaskCanvas } from './mask'
import { identityMatrix } from './mask-geometry'

function layer(): HandoutLayer {
  return {
    id: 'layer-1',
    type: 'image',
    name: 'Layer',
    assetId: 'asset-1',
    x: 0,
    y: 0,
    width: 4,
    height: 4,
    rotation: 0,
    flipX: false,
    opacity: 1,
    blendMode: 'source-over',
    visible: true,
    locked: false,
    zIndex: 0,
    effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
    mask: null,
  } as HandoutLayer
}

function mask(input: Partial<LayerMask> = {}): LayerMask {
  return {
    id: 'mask-1',
    enabled: true,
    path: null,
    highResPath: 'masks/mask-1.png',
    width: 2,
    height: 2,
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
    updatedAt: '2026-06-30T00:00:00.000Z',
    ...input,
  } as LayerMask
}

describe('mask canvas composition', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps source visible outside the finite mask bitmap bounds', () => {
    const calls: string[] = []
    const alphaContext = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) })),
      putImageData: vi.fn(),
    }
    const outputContext = {
      set fillStyle(value: string) {
        calls.push(`fillStyle:${value}`)
      },
      get fillStyle() {
        return ''
      },
      fillRect: vi.fn((x: number, y: number, width: number, height: number) => {
        calls.push(`fillRect:${x}:${y}:${width}:${height}`)
      }),
      clearRect: vi.fn((x: number, y: number, width: number, height: number) => {
        calls.push(`clearRect:${x}:${y}:${width}:${height}`)
      }),
      setTransform: vi.fn(() => calls.push('setTransform')),
      drawImage: vi.fn(() => calls.push('drawImage')),
    }
    const alphaCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => alphaContext),
    }
    const outputCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => outputContext),
    }
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName !== 'canvas') return originalCreateElement(tagName)
      return (alphaCanvas.getContext.mock.calls.length ? outputCanvas : alphaCanvas) as unknown as HTMLCanvasElement
    })

    const result = createLayerLocalMaskCanvas({ width: 2, height: 2 } as HTMLImageElement, layer(), mask(), 4, 4)

    expect(result).toBe(outputCanvas)
    expect(outputContext.fillRect).toHaveBeenCalledWith(0, 0, 4, 4)
    expect(outputContext.clearRect).toHaveBeenCalledWith(0, 0, 2, 2)
    expect(calls.indexOf('fillRect:0:0:4:4')).toBeLessThan(calls.indexOf('setTransform'))
    expect(calls.indexOf('clearRect:0:0:2:2')).toBeLessThan(calls.indexOf('drawImage'))
  })
})
