import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('configuration.toml documentation', () => {
  it('places a Chinese usage comment immediately before every field', () => {
    const lines = readFileSync(resolve(process.cwd(), 'configuration.toml'), 'utf8').split(/\r?\n/)
    const fields = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line))

    expect(fields.length).toBeGreaterThan(150)
    expect(fields.every(({ index }) => lines[index - 1]?.startsWith('# 配置项：'))).toBe(true)
  })
})
