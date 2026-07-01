import { describe, expect, it } from 'vitest'

import type { PaintStroke } from './handout'
import { paintStrokeLineConfig } from './paint-rendering'

function stroke(input: Partial<PaintStroke> = {}): PaintStroke {
  return {
    id: 'stroke-1',
    points: [0, 0, 10, 10],
    strokeWidth: 10,
    color: '#111827',
    tension: 0.35,
    mode: 'brush',
    brushKind: 'pixel',
    opacity: 1,
    eraserOpacity: 1,
    ...input,
  } as PaintStroke
}

describe('paint stroke rendering', () => {
  it('keeps mask brush draft strokes visible at the configured minimum opacity', () => {
    const config = paintStrokeLineConfig(stroke({ mode: 'brush', opacity: 0 }), { minOpacity: 0.3 })

    expect(config.opacity).toBe(0.3)
  })

  it('keeps mask eraser draft strokes visible at the configured minimum opacity', () => {
    const config = paintStrokeLineConfig(stroke({ mode: 'eraser', eraserOpacity: 0 }), { minOpacity: 0.3 })

    expect(config.opacity).toBe(0.3)
  })

  it('keeps stronger draft stroke opacity unchanged', () => {
    const brushConfig = paintStrokeLineConfig(stroke({ mode: 'brush', opacity: 0.7 }), { minOpacity: 0.3 })
    const eraserConfig = paintStrokeLineConfig(stroke({ mode: 'eraser', eraserOpacity: 0.8 }), { minOpacity: 0.3 })

    expect(brushConfig.opacity).toBe(0.7)
    expect(eraserConfig.opacity).toBe(0.8)
  })

  it('does not clamp ordinary paint drafts when no minimum opacity is provided', () => {
    const config = paintStrokeLineConfig(stroke({ mode: 'brush', opacity: 0 }))

    expect(config.opacity).toBe(0)
  })
})
