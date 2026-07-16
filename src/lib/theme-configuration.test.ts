import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../style.css', import.meta.url), 'utf8')

describe('global theme configuration', () => {
  it.each([
    'background',
    'foreground',
    'card',
    'popover',
    'primary',
    'secondary',
    'muted',
    'accent',
    'destructive',
    'border',
    'input',
    'ring',
  ])('registers the %s color with Tailwind', (name) => {
    expect(source).toContain(`--color-${name}: hsl(var(--${name}))`)
  })

  it('does not override shared slider internals globally', () => {
    expect(source).not.toMatch(/^\[data-slot='slider-(?:track|range|thumb)'\]/m)
  })
})
