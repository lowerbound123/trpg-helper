import { fileUrl, fontRecordFamily, saveFontPreview, type LibraryIndex, type LibraryRecord } from './backend'

const PREVIEW_WIDTH = 256
const PREVIEW_HEIGHT = 144

function drawPreviewText(
  family: string,
  text: string,
  options: { fallbackOnly?: boolean } = {},
) {
  const canvas = document.createElement('canvas')
  canvas.width = PREVIEW_WIDTH
  canvas.height = PREVIEW_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) return { canvas, pixels: new Uint8ClampedArray() }
  context.fillStyle = '#f8fafc'
  context.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT)
  context.fillStyle = '#0f172a'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `600 58px ${options.fallbackOnly ? 'serif' : `"${family}", serif`}`
  context.fillText(text, PREVIEW_WIDTH / 2, PREVIEW_HEIGHT / 2 + 2)
  context.fillStyle = '#64748b'
  context.font = '12px system-ui, sans-serif'
  context.fillText(family.slice(0, 32), PREVIEW_WIDTH / 2, PREVIEW_HEIGHT - 18)
  return {
    canvas,
    pixels: context.getImageData(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT).data,
  }
}

function pixelDifference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  const length = Math.min(a.length, b.length)
  let diff = 0
  for (let index = 0; index < length; index += 4) {
    diff += Math.abs(a[index] - b[index])
    diff += Math.abs(a[index + 1] - b[index + 1])
    diff += Math.abs(a[index + 2] - b[index + 2])
  }
  return diff / Math.max(1, length / 4)
}

function supportsChineseGlyph(family: string) {
  const font = drawPreviewText(family, '测试')
  const fallback = drawPreviewText(family, '测试', { fallbackOnly: true })
  return pixelDifference(font.pixels, fallback.pixels) > 1.2
}

async function ensureFontFace(font: LibraryRecord) {
  if (!('FontFace' in window) || !font.path) return
  const family = fontRecordFamily(font)
  if (document.fonts.check(`16px "${family}"`)) return
  const face = new FontFace(family, `url("${fileUrl(font.path)}")`)
  await face.load()
  document.fonts.add(face)
}

export async function generateFontPreviewDataUrl(font: LibraryRecord) {
  await ensureFontFace(font)
  const family = fontRecordFamily(font)
  const sample = supportsChineseGlyph(family) ? '测试' : 'test'
  const { canvas } = drawPreviewText(family, sample)
  const dataUrl = canvas.toDataURL('image/webp', 0.82)
  return dataUrl.startsWith('data:image/webp') ? dataUrl : canvas.toDataURL('image/png')
}

export async function ensureFontPreview(font: LibraryRecord): Promise<LibraryIndex | undefined> {
  if (font.thumbnailPath) return undefined
  const dataUrl = await generateFontPreviewDataUrl(font)
  return saveFontPreview(font.id, dataUrl)
}
