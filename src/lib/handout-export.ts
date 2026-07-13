import type { HandoutExportConfiguration } from './configuration'

export type HandoutExportFormat = 'png' | 'jpg' | 'webp' | 'jxl'
export type HandoutExportInputEncoding = 'rgba8' | 'png'

export type HandoutEncodingOptions = HandoutExportConfiguration['defaults']

export interface HandoutExportMetadata {
  fileName: string
  width: number
  height: number
  inputEncoding: HandoutExportInputEncoding
  options: Partial<HandoutEncodingOptions> & { format: HandoutExportFormat }
  jpegMatteColor?: string
  webpStrengthProfiles?: HandoutExportConfiguration['webpStrengthProfiles']
}

export interface HandoutExportResult {
  path: string
  inputBytes: number
  outputBytes: number
  decodeMs: number
  encodeMs: number
  writeMs: number
}

export function chooseHandoutTransport(width: number, height: number, rawRgbaIpcMaxBytes: number): HandoutExportInputEncoding {
  return width * height * 4 <= rawRgbaIpcMaxBytes ? 'rgba8' : 'png'
}

export function validateHandoutExportDimensions(width: number, height: number, maxDimension: number, maxPixels: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('导出尺寸必须是正整数')
  }
  if (width > maxDimension || height > maxDimension) {
    throw new Error(`导出尺寸不能超过 ${maxDimension}px`)
  }
  const pixels = width * height
  if (!Number.isSafeInteger(pixels) || pixels > maxPixels) {
    throw new Error(`导出像素总数不能超过 ${maxPixels}`)
  }
}

export function buildHandoutExportEnvelope(metadata: HandoutExportMetadata, payload: Uint8Array): Uint8Array {
  const header = new TextEncoder().encode(JSON.stringify(metadata))
  const envelope = new Uint8Array(8 + header.length + payload.length)
  envelope.set(new TextEncoder().encode('HGE1'), 0)
  new DataView(envelope.buffer).setUint32(4, header.length, true)
  envelope.set(header, 8)
  envelope.set(payload, 8 + header.length)
  return envelope
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成导出传输 PNG')), 'image/png')
  })
}
