import { describe, expect, it } from 'vitest'

import { buildLibraryImportEnvelope, partitionLibraryImportFiles } from './library-import'

describe('library import envelope', () => {
  it('stores file boundaries in metadata and concatenates raw bytes', async () => {
    const files = [
      new File([new Uint8Array([1, 2])], 'one.png', { type: 'image/png' }),
      new File([new Uint8Array([3, 4, 5])], 'two.webp', { type: 'image/webp' }),
    ]
    const envelope = await buildLibraryImportEnvelope('asset', files, ['token'], 'rings')
    expect(new TextDecoder().decode(envelope.slice(0, 4))).toBe('HGI1')
    const headerLength = new DataView(envelope.buffer, envelope.byteOffset + 4, 4).getUint32(0, true)
    const metadata = JSON.parse(new TextDecoder().decode(envelope.slice(8, 8 + headerLength)))
    expect(metadata.files).toMatchObject([
      { clientId: '0', fileName: 'one.png', offset: 0, length: 2 },
      { clientId: '1', fileName: 'two.webp', offset: 2, length: 3 },
    ])
    expect([...envelope.slice(8 + headerLength)]).toEqual([1, 2, 3, 4, 5])
  })

  it('partitions batches without splitting an individual file', () => {
    const files = [
      new File([new Uint8Array(4)], 'a.png'),
      new File([new Uint8Array(4)], 'b.png'),
      new File([new Uint8Array(7)], 'large.png'),
    ]
    expect(partitionLibraryImportFiles(files, 6).map((batch) => batch.map((file) => file.name)))
      .toEqual([['a.png'], ['b.png'], ['large.png']])
  })
})
