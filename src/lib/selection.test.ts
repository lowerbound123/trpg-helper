import { describe, expect, it } from 'vitest'

import { containsRect } from './selection'

describe('selection geometry', () => {
  it('selects layers only when the marquee fully contains the layer bounds', () => {
    const marquee = { x: 10, y: 10, width: 100, height: 100 }

    expect(containsRect(marquee, { x: 20, y: 20, width: 30, height: 30 })).toBe(true)
    expect(containsRect(marquee, { x: 0, y: 20, width: 30, height: 30 })).toBe(false)
    expect(containsRect(marquee, { x: 20, y: 20, width: 120, height: 30 })).toBe(false)
    expect(containsRect(marquee, { x: 109, y: 109, width: 1, height: 1 })).toBe(true)
  })
})
