import { describe, expect, it } from 'vitest'

import { createTransformerResizeConfig } from './transformer-config'

describe('Transformer resize policy', () => {
  it('keeps aspect ratio for corner anchors while retaining side anchors', () => {
    const config = createTransformerResizeConfig({ line: false, text: false, curve: false })
    expect(config.keepRatio).toBe(true)
    expect(config.enabledAnchors).toEqual(expect.arrayContaining([
      'top-left', 'top-right', 'bottom-left', 'bottom-right',
      'top-center', 'middle-right', 'bottom-center', 'middle-left',
    ]))
  })
})
