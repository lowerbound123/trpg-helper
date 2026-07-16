import { describe, expect, it } from 'vitest'

import { resourceForTarget, selectTargetTriple } from './prepare-segmentation-resources.mjs'
import manifest from './segmentation-resources.lock.json' with { type: 'json' }

describe('segmentation resource preparation', () => {
  it('maps all supported desktop targets to pinned runtime archives', () => {
    expect(resourceForTarget(manifest, 'aarch64-apple-darwin').libraryFile).toContain('.dylib')
    expect(resourceForTarget(manifest, 'x86_64-pc-windows-msvc').libraryFile).toContain('.dll')
    expect(resourceForTarget(manifest, 'x86_64-unknown-linux-gnu').libraryFile).toContain('.so')
  })

  it('prefers an explicit target and rejects unsupported architectures', () => {
    expect(selectTargetTriple(['--target', 'x86_64-pc-windows-msvc'], {}, 'aarch64-apple-darwin')).toBe('x86_64-pc-windows-msvc')
    expect(() => resourceForTarget(manifest, 'x86_64-apple-darwin')).toThrow(/Unsupported/)
  })
})
