import { describe, expect, it, vi } from 'vitest'

import type { LayerMask, MaskShapeOperation, PaintStroke } from './handout'
import {
  composeMaskGrayPixel,
  createMaskPolygonOperationFromDocumentInput,
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
    } as unknown as CanvasRenderingContext2D

    drawMaskShapeToContext(context, shape({ value: 0 }))

    expect(calls).toContain('composite:source-over')
    expect(calls).toContain('fillStyle:rgb(0,0,0)')
    expect(calls).toContain('strokeStyle:rgb(0,0,0)')
    expect(calls).toContain('rect:128:256:300:180')
    expect(calls).toContain('fill')
    expect(calls).toContain('stroke')
  })

  it('uses opacity as the mask target value instead of cumulative strength', () => {
    expect(maskStrokeTargetValue(stroke({ mode: 'brush', opacity: 0 }))).toBe(0)
    expect(maskStrokeTargetValue(stroke({ mode: 'brush', opacity: 0.4, color: '#ffffff' }))).toBe(102)
    expect(maskStrokeTargetValue(stroke({ mode: 'brush', opacity: 1, color: '#000000' }))).toBe(255)
    expect(maskStrokeStrength(stroke({ mode: 'brush', opacity: 0.1 }))).toBe(1)

    expect(maskStrokeTargetValue(stroke({ mode: 'eraser', eraserOpacity: 1 }))).toBe(0)
    expect(maskStrokeTargetValue(stroke({ mode: 'eraser', eraserOpacity: 0.4 }))).toBe(153)
    expect(maskStrokeTargetValue(stroke({ mode: 'eraser', eraserOpacity: 0 }))).toBe(255)
    expect(maskStrokeStrength(stroke({ mode: 'eraser', eraserOpacity: 0.1 }))).toBe(1)

    expect(composeMaskGrayPixel(255, 102, 1)).toBe(102)
    expect(composeMaskGrayPixel(0, 153, 1)).toBe(153)
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
