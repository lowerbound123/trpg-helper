import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const capability = JSON.parse(
  readFileSync(new URL('../../src-tauri/capabilities/default.json', import.meta.url), 'utf8'),
) as { permissions: string[] }

describe('desktop capabilities', () => {
  it('allows directory selection for image exports', () => {
    expect(capability.permissions).toContain('dialog:allow-open')
  })
})
