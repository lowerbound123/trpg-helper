import { describe, expect, it } from 'vitest'

import { isSupportedUpload } from './upload-validation'

function file(name: string, type = '') {
  return new File(['x'], name, { type })
}

describe('upload validation', () => {
  it('accepts supported font extensions', () => {
    for (const name of ['a.ttf', 'b.otf', 'c.ttc', 'd.otc', 'e.woff', 'f.woff2']) {
      expect(isSupportedUpload('font', file(name)), name).toBe(true)
    }
  })

  it('rejects unsupported font extensions', () => {
    expect(isSupportedUpload('font', file('font.txt'))).toBe(false)
  })
})
