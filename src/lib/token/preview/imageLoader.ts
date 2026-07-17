import { fileUrl } from '@/lib/backend'

export interface PreviewImageSource {
  source: HTMLCanvasElement
  width: number
  height: number
}

export interface AlphaBounds {
  x: number
  y: number
  width: number
  height: number
}

export class LatestPreviewLoad {
  private generation = 0

  begin(): number {
    return ++this.generation
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation
  }

  invalidate(): void {
    this.generation++
  }
}

export function mimeTypeForPath(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  const mimeTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    bmp: 'image/bmp',
  }
  return mimeTypes[extension] ?? 'image/png'
}

export function findAlphaBounds(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
): AlphaBounds | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((pixels[(y * width + x) * 4 + 3] ?? 0) === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) return null
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('无法创建图片预览 Canvas 2D 上下文')
  return context
}

async function decodeImage(url: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法解码预览图片'))
    image.src = url
  })
}

export function previewImageUrl(path: string, resolve: (value: string) => string = fileUrl): string {
  return resolve(path)
}

export async function loadPreviewImage(path: string, trimTransparentBounds = true): Promise<PreviewImageSource> {
  const image = await decodeImage(previewImageUrl(path))
  const source = document.createElement('canvas')
  source.width = image.naturalWidth
  source.height = image.naturalHeight
  const sourceContext = context2d(source)
  sourceContext.drawImage(image, 0, 0)

  if (!trimTransparentBounds) {
    return { source, width: source.width, height: source.height }
  }

  const imageData = sourceContext.getImageData(0, 0, source.width, source.height)
  const bounds = findAlphaBounds(imageData.data, source.width, source.height)
  if (!bounds) {
    return { source, width: source.width, height: source.height }
  }

  const trimmed = document.createElement('canvas')
  trimmed.width = bounds.width
  trimmed.height = bounds.height
  context2d(trimmed).drawImage(
    source,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  )

  return { source: trimmed, width: trimmed.width, height: trimmed.height }
}
