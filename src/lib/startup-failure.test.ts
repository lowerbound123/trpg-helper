import { describe, expect, it } from 'vitest'
import { normalizeStartupError } from './startup-failure'

describe('startup failure reporting', () => {
  it('preserves module initialization errors for the app log', () => {
    const error = new TypeError("undefined is not an object (evaluating 'parser')")
    error.stack = 'TypeError: parser\n at vendor-finder.js:23:31157'

    expect(normalizeStartupError(error)).toEqual({
      name: 'TypeError',
      message: "undefined is not an object (evaluating 'parser')",
      stack: 'TypeError: parser\n at vendor-finder.js:23:31157',
    })
  })

  it('normalizes non-error rejection values', () => {
    expect(normalizeStartupError('chunk failed')).toEqual({
      name: 'Error',
      message: 'chunk failed',
    })
  })
})
