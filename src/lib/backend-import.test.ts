// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: vi.fn((path: string) => path), invoke: invokeMock }))
vi.mock('@tauri-apps/plugin-fs', () => ({ BaseDirectory: {}, writeFile: vi.fn() }))

import { importLibraryFiles } from './backend'

describe('batch library imports', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    ;(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
  })

  it('invokes the batch command with a raw Uint8Array body', async () => {
    invokeMock.mockResolvedValue({ results: [], library: { backgrounds: [], assets: [], fonts: [], backgroundFolders: [], assetFolders: [], fontFolders: [] } })
    await importLibraryFiles('asset', [new File([new Uint8Array([9, 8])], 'asset.png', { type: 'image/png' })], [], '')

    expect(invokeMock).toHaveBeenCalledWith('import_library_batch', expect.any(Uint8Array))
    expect(Array.isArray(invokeMock.mock.calls[0][1])).toBe(false)
  })
})
