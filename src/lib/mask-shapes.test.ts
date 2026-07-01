// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LayerMask, MaskShapeOperation, PaintStroke } from './handout'
import {
  composeMaskGrayPixel,
  createMaskPolygonOperationFromDocumentInput,
  drawMaskOperationToContext,
  drawMaskShapeToContext,
  maskShapeContentKey,
  maskShapeGrayValue,
  maskStrokeStrength,
  maskStrokeTargetValue,
  maskShapeTiles,
} from './mask-shapes'

function shape(input: Partial<MaskShapeOperation> = {}): MaskShapeOperation {
  return {
    id: 'shape-1',
    shape: 'rect',
    x: 128,
    y: 256,
    width: 300,
    height: 180,
    value: 255,
    strokeWidth: 12,
    cornerRadius: 0,
    ...input,
  }
}

function stroke(input: Partial<PaintStroke> = {}): PaintStroke {
  return {
    id: 'stroke-1',
    points: [0, 0, 10, 10],
    strokeWidth: 10,
    color: '#000000',
    tension: 0,
    mode: 'brush',
    opacity: 1,
    ...input,
  } as PaintStroke
}

function mask(input: Partial<LayerMask> = {}): LayerMask {
  return {
    id: 'mask-1',
    enabled: true,
    path: null,
    highResPath: 'masks/mask-1.png',
    width: 300,
    height: 200,
    matrix: [1, 0, 0, 1, 100, 200],
    tileSize: 512,
    defaultAlpha: 255,
    tiles: {},
    strokes: [],
    shapes: [],
    operations: [],
    x: 100,
    y: 200,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    flipX: false,
    previewScale: 1,
    sourceVersion: 1,
    version: 1,
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...input,
  }
}

describe('mask shape operations', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes any mask shape edit value to a single gray channel', () => {
    expect(maskShapeGrayValue({ value: 300 })).toBe(255)
    expect(maskShapeGrayValue({ value: -20 })).toBe(0)
    expect(maskShapeGrayValue({ value: 127.6 })).toBe(128)
    expect(maskShapeGrayValue({ color: '#000000' })).toBe(255)
    expect(maskShapeGrayValue({ color: '#ff0000' })).toBe(255)
  })

  it('draws mask shapes with identical RGB channels so black hides and white passes', () => {
    const calls: string[] = []
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(() => calls.push('beginPath')),
      rect: vi.fn((x: number, y: number, width: number, height: number) => {
        calls.push(`rect:${x}:${y}:${width}:${height}`)
      }),
      fill: vi.fn(() => calls.push('fill')),
      stroke: vi.fn(() => calls.push('stroke')),
      set fillStyle(value: string) {
        calls.push(`fillStyle:${value}`)
      },
      get fillStyle() {
        return ''
      },
      set strokeStyle(value: string) {
        calls.push(`strokeStyle:${value}`)
      },
      get strokeStyle() {
        return ''
      },
      set lineWidth(value: number) {
        calls.push(`lineWidth:${value}`)
      },
      get lineWidth() {
        return 1
      },
      set globalCompositeOperation(value: string) {
        calls.push(`composite:${value}`)
      },
      get globalCompositeOperation() {
        return 'source-over'
      },
      set globalAlpha(value: number) {
        calls.push(`alpha:${value}`)
      },
      get globalAlpha() {
        return 1
      },
    } as unknown as CanvasRenderingContext2D

    drawMaskShapeToContext(context, shape({ value: 128 }))

    expect(calls).toContain('composite:source-over')
    expect(calls).toContain('alpha:0.5019607843137255')
    expect(calls).toContain('fillStyle:rgb(255,255,255)')
    expect(calls).toContain('strokeStyle:rgb(255,255,255)')
    expect(calls).toContain('rect:128:256:300:180')
    expect(calls).toContain('fill')
    expect(calls).toContain('stroke')
  })

  it('applies shape edits through single-channel pixel accumulation', () => {
    const targetPixels = new Uint8ClampedArray([0, 0, 0, 12])
    const coveragePixels = new Uint8ClampedArray([255, 255, 255, 255])
    const targetContext = {
      canvas: { width: 1, height: 1 },
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      getImageData: vi.fn(() => ({ data: targetPixels })),
      putImageData: vi.fn(),
      set fillStyle(_value: string) {},
      set strokeStyle(_value: string) {},
      set lineWidth(_value: number) {},
      set lineCap(_value: CanvasLineCap) {},
      set lineJoin(_value: CanvasLineJoin) {},
      set globalAlpha(_value: number) {},
      set globalCompositeOperation(_value: GlobalCompositeOperation) {},
    } as unknown as CanvasRenderingContext2D
    const coverageContext = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      getImageData: vi.fn(() => ({ data: coveragePixels })),
      set fillStyle(_value: string) {},
      set strokeStyle(_value: string) {},
      set lineWidth(_value: number) {},
      set lineCap(_value: CanvasLineCap) {},
      set lineJoin(_value: CanvasLineJoin) {},
      set globalCompositeOperation(_value: GlobalCompositeOperation) {},
    } as unknown as CanvasRenderingContext2D
    const coverageCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => coverageContext),
    } as unknown as HTMLCanvasElement
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName !== 'canvas') return originalCreateElement(tagName)
      return coverageCanvas
    })

    drawMaskOperationToContext(targetContext, {
      id: 'shape-op',
      kind: 'shape',
      shape: shape({ x: 0, y: 0, width: 1, height: 1, value: 128, strokeWidth: 0 }),
    })

    expect(targetContext.getImageData).toHaveBeenCalledWith(0, 0, 1, 1)
    expect(coverageContext.getImageData).toHaveBeenCalledWith(0, 0, 1, 1)
    expect(targetContext.putImageData).toHaveBeenCalledTimes(1)
    const imageData = vi.mocked(targetContext.putImageData).mock.calls[0][0] as ImageData
    expect(Array.from(imageData.data)).toEqual([128, 128, 128, 255])
  })

  it('uses opacity as cumulative strength toward black or white', () => {
    expect(maskStrokeTargetValue(stroke({ mode: 'brush', opacity: 0, color: '#000000' }))).toBe(255)
    expect(maskStrokeTargetValue(stroke({ mode: 'brush', opacity: 0.5, color: '#000000' }))).toBe(255)
    expect(maskStrokeStrength(stroke({ mode: 'brush', opacity: 0 }))).toBe(0)
    expect(maskStrokeStrength(stroke({ mode: 'brush', opacity: 0.5 }))).toBe(0.5)

    expect(maskStrokeTargetValue(stroke({ mode: 'eraser', eraserOpacity: 0 }))).toBe(0)
    expect(maskStrokeTargetValue(stroke({ mode: 'eraser', eraserOpacity: 0.5 }))).toBe(0)
    expect(maskStrokeStrength(stroke({ mode: 'eraser', eraserOpacity: 0 }))).toBe(0)
    expect(maskStrokeStrength(stroke({ mode: 'eraser', eraserOpacity: 0.5 }))).toBe(0.5)

    const firstErase = composeMaskGrayPixel(255, 0, 0.5)
    const secondErase = composeMaskGrayPixel(firstErase, 0, 0.5)
    expect(firstErase).toBe(128)
    expect(secondErase).toBe(64)

    const firstBrush = composeMaskGrayPixel(0, 255, 0.5)
    const secondBrush = composeMaskGrayPixel(firstBrush, 255, 0.5)
    expect(firstBrush).toBe(128)
    expect(secondBrush).toBe(192)
  })

  it('creates a mask-local polygon operation from document-space polygon points', () => {
    const operation = createMaskPolygonOperationFromDocumentInput({
      shape: 'polygon',
      x: 110,
      y: 210,
      width: 50,
      height: 40,
      polygonPoints: [
        { x: 0, y: 0 },
        { x: 50, y: 10 },
        { x: 20, y: 40 },
      ],
    }, mask(), 0)

    expect(operation).toMatchObject({
      shape: 'polygon',
      x: 10,
      y: 10,
      width: 50,
      height: 40,
      value: 0,
      polygonPoints: [
        { x: 0, y: 0 },
        { x: 50, y: 10 },
        { x: 20, y: 40 },
      ],
    })
  })

  it('uses shape geometry and gray value in content keys and dirty tiles', () => {
    const first = shape({ value: 255, x: 1020, y: 1020, width: 520, height: 520 })
    const second = shape({ value: 0, x: 1020, y: 1020, width: 520, height: 520 })

    expect(maskShapeContentKey(first)).not.toBe(maskShapeContentKey(second))
    expect(maskShapeTiles(first, {
      maskWidth: 12000,
      maskHeight: 9000,
      tileSize: 512,
    })).toEqual(['1:1', '2:1', '3:1', '1:2', '2:2', '3:2', '1:3', '2:3', '3:3'])
  })
})
