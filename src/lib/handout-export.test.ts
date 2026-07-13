import { describe, expect, it } from 'vitest'

import { buildHandoutExportEnvelope, chooseHandoutTransport, validateHandoutExportDimensions } from './handout-export'

describe('Handout Rust export transport', () => {
  it('uses raw RGBA below the configured threshold and PNG above it', () => {
    expect(chooseHandoutTransport(4096, 4096, 134217728)).toBe('rgba8')
    expect(chooseHandoutTransport(8192, 8192, 134217728)).toBe('png')
  })

  it('rejects dimensions beyond either configured limit', () => {
    expect(() => validateHandoutExportDimensions(17000, 100, 16384, 67108864)).toThrow(/16384/)
    expect(() => validateHandoutExportDimensions(9000, 9000, 16384, 67108864)).toThrow(/67108864/)
  })

  it('builds a versioned envelope with JSON metadata and payload', () => {
    const envelope = buildHandoutExportEnvelope({ fileName: '测试.png', width: 2, height: 1, inputEncoding: 'rgba8', options: { format: 'png' } }, new Uint8Array([1, 2, 3, 4]))
    expect(new TextDecoder().decode(envelope.slice(0, 4))).toBe('HGE1')
    const headerLength = new DataView(envelope.buffer, envelope.byteOffset + 4, 4).getUint32(0, true)
    const metadata = JSON.parse(new TextDecoder().decode(envelope.slice(8, 8 + headerLength)))
    expect(metadata.fileName).toBe('测试.png')
    expect([...envelope.slice(8 + headerLength)]).toEqual([1, 2, 3, 4])
  })
})
