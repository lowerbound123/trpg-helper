import { describe, expect, it } from 'vitest'

import { LatestPreviewLoad, findAlphaBounds, mimeTypeForPath } from './imageLoader'

function pixels(width: number, height: number, opaque: Array<[number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (const [x, y] of opaque) data[(y * width + x) * 4 + 3] = 255
  return data
}

describe('preview image loading helpers', () => {
  it('finds alpha bounds for a landscape content region', () => {
    const data = pixels(6, 4, [
      [1, 1],
      [4, 1],
      [1, 2],
      [4, 2],
    ])

    expect(findAlphaBounds(data, 6, 4)).toEqual({ x: 1, y: 1, width: 4, height: 2 })
  })

  it('finds alpha bounds for a portrait content region', () => {
    const data = pixels(4, 6, [
      [1, 1],
      [2, 1],
      [1, 4],
      [2, 4],
    ])

    expect(findAlphaBounds(data, 4, 6)).toEqual({ x: 1, y: 1, width: 2, height: 4 })
  })

  it('returns null for a fully transparent image', () => {
    expect(findAlphaBounds(pixels(4, 4, []), 4, 4)).toBeNull()
  })

  it('maps supported file extensions to MIME types', () => {
    expect(mimeTypeForPath('/tmp/a.JPG')).toBe('image/jpeg')
    expect(mimeTypeForPath('/tmp/a.webp')).toBe('image/webp')
    expect(mimeTypeForPath('/tmp/a.bmp')).toBe('image/bmp')
    expect(mimeTypeForPath('/tmp/a.unknown')).toBe('image/png')
  })

  it('accepts only the most recently started image load', () => {
    const loads = new LatestPreviewLoad()
    const first = loads.begin()
    const second = loads.begin()

    expect(loads.isCurrent(first)).toBe(false)
    expect(loads.isCurrent(second)).toBe(true)
    loads.invalidate()
    expect(loads.isCurrent(second)).toBe(false)
  })
})
