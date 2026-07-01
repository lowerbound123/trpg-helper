// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.hoisted(() =>
  vi.fn(async (_command?: string, _args?: unknown, _options?: unknown) => '/Downloads/handout.png'),
)

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn((path: string) => path),
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppLocalData: 'AppLocalData' },
  writeFile: vi.fn(),
}))

import { writeEncodedImageBlobToDownloads } from './backend'

describe('encoded export writes', () => {
  beforeEach(() => {
    invokeMock.mockClear()
    ;(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
  })

  it('passes encoded image bytes to Tauri as a raw Uint8Array body', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })

    await writeEncodedImageBlobToDownloads('handout.png', blob)

    const writeCall = invokeMock.mock.calls.find((call) => call[0] === 'write_encoded_image_bytes_to_downloads')
    expect(writeCall).toBeTruthy()
    expect(writeCall![1]).toBeInstanceOf(Uint8Array)
    expect(Array.from(writeCall![1] as Uint8Array)).toEqual([1, 2, 3, 4])
    expect(writeCall![2]).toMatchObject({
      headers: { 'x-file-name': 'handout.png' },
    })
  })
})
