// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  channels: [] as Array<{ onmessage?: (event: unknown) => void }>,
}))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn((path: string) => path),
  invoke: tauri.invoke,
  Channel: class<T> {
    onmessage?: (event: T) => void

    constructor() {
      tauri.channels.push(this as { onmessage?: (event: unknown) => void })
    }
  },
}))
vi.mock('@tauri-apps/plugin-fs', () => ({ BaseDirectory: {}, writeFile: vi.fn() }))

import { emptyLibrary, segmentAssetsForeground } from './backend'

describe('foreground segmentation backend', () => {
  beforeEach(() => {
    tauri.invoke.mockReset()
    tauri.channels.length = 0
    ;(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
  })

  it('forwards batch requests and channel progress without image payloads', async () => {
    tauri.invoke.mockImplementation(async (command: string, args: Record<string, unknown>) => {
      expect(command).toBe('segment_assets_foreground')
      const channel = args.onProgress as { onmessage?: (event: unknown) => void }
      channel.onmessage?.({
        phase: 'processing',
        stage: 'inference-complete',
        current: 1,
        total: 2,
        assetId: 'asset-a',
        successCount: 1,
        failureCount: 0,
      })
      return { results: [], library: emptyLibrary() }
    })
    const progress = vi.fn()
    const requests = [
      { assetId: 'asset-a', sourcePath: '/managed/a.png' },
      { assetId: 'asset-b', sourcePath: '/managed/b.png' },
    ]

    await segmentAssetsForeground(requests, progress)

    expect(tauri.invoke).toHaveBeenCalledWith('segment_assets_foreground', {
      requests,
      onProgress: tauri.channels[0],
    })
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'asset-a', current: 1 }))
    expect(JSON.stringify(tauri.invoke.mock.calls[0])).not.toContain('base64')
  })
})
