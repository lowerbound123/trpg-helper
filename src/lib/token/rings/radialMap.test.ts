import { describe, expect, it } from 'vitest'

import { mapRingPixelsToBand } from './radialMap'

describe('mapRingPixelsToBand', () => {
  it('maps source alpha into the requested ring band while preserving intrinsic alpha', () => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4)
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const radius = Math.hypot(x + 0.5 - 4, y + 0.5 - 4)
        if (radius >= 2 && radius <= 3.8) {
          const offset = (y * 8 + x) * 4
          pixels.set([255, 255, 255, 128], offset)
        }
      }
    }

    const result = mapRingPixelsToBand({
      pixels,
      sourceSize: 8,
      targetSize: 16,
      inner: 5,
      outer: 7,
    })

    expect(result[(8 * 16 + 8) * 4 + 3]).toBe(0)
    expect(result[(8 * 16 + 14) * 4 + 3]).toBeGreaterThan(0)
    expect(Math.max(...result.filter((_, index) => index % 4 === 3))).toBe(128)
  })

  it('rejects invalid geometry', () => {
    expect(() =>
      mapRingPixelsToBand({
        pixels: new Uint8ClampedArray(4 * 4 * 4),
        sourceSize: 4,
        targetSize: 8,
        inner: 4,
        outer: 4,
      }),
    ).toThrow('圆环半径')
  })
})
