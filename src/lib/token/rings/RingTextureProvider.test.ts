import { describe, expect, it, vi } from 'vitest'

import { defaultTokenConfiguration } from '../configuration'
import { AppFrontendRingProvider } from './RingTextureProvider'
import { BUILTIN_RING_SVGS } from './builtinAssets'

describe('built-in ring assets', () => {
  it('registers all eleven shared SVG assets in the frontend', () => {
    expect(Object.keys(BUILTIN_RING_SVGS)).toEqual([
      'solid',
      'double',
      'dashed',
      'dots',
      'gradient_inner',
      'bevel',
      'segmented',
      'circuit',
      'arcane',
      'notched',
      'braided',
    ])
  })
})

describe('AppFrontendRingProvider custom asset cache', () => {
  it('reads and decodes one custom asset only once per id', async () => {
    const invokeBinary = vi.fn(async () => new ArrayBuffer(4))
    const image = { source: {} as HTMLCanvasElement, width: 8, height: 4 }
    const decode = vi.fn(async () => image)
    const provider = new AppFrontendRingProvider(
      defaultTokenConfiguration,
      () => undefined,
      invokeBinary,
      decode,
    )

    expect(await provider.loadCustomAsset('custom:a')).toBe(image)
    expect(await provider.loadCustomAsset('custom:a')).toBe(image)
    expect(invokeBinary).toHaveBeenCalledOnce()
    expect(invokeBinary).toHaveBeenCalledWith('read_custom_ring_asset', { id: 'custom:a' })
    expect(decode).toHaveBeenCalledOnce()
    provider.destroy()
  })

  it('does not retain a failed custom asset request', async () => {
    const invokeBinary = vi
      .fn<() => Promise<ArrayBuffer>>()
      .mockRejectedValueOnce(new Error('missing'))
      .mockResolvedValueOnce(new ArrayBuffer(4))
    const provider = new AppFrontendRingProvider(
      defaultTokenConfiguration,
      () => undefined,
      invokeBinary,
      async () => ({ source: {} as HTMLCanvasElement, width: 1, height: 1 }),
    )

    await expect(provider.loadCustomAsset('custom:a')).rejects.toThrow('missing')
    await expect(provider.loadCustomAsset('custom:a')).resolves.toMatchObject({ width: 1 })
    expect(invokeBinary).toHaveBeenCalledTimes(2)
    provider.destroy()
  })
})
