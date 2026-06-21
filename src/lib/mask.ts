import type { HandoutLayer, LayerMask, PaintStroke } from './handout'

export function createSolidMaskDataUrl(width: number, height: number, value = 255) {
  if (typeof document === 'undefined') return ''
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const context = canvas.getContext('2d')
  if (!context) return ''
  const gray = Math.max(0, Math.min(255, Math.round(value)))
  context.fillStyle = `rgb(${gray},${gray},${gray})`
  context.fillRect(0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

export function drawMaskStroke(dataUrl: string, width: number, height: number, stroke: PaintStroke) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width))
      canvas.height = Math.max(1, Math.round(height))
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Could not create mask canvas context'))
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      context.globalCompositeOperation = 'source-over'
      const opacity = stroke.mode === 'eraser' ? stroke.eraserOpacity ?? 1 : stroke.opacity ?? 1
      const gray = stroke.mode === 'eraser'
        ? Math.round(255 * (1 - Math.max(0, Math.min(1, opacity))))
        : Math.round(255 * Math.max(0, Math.min(1, opacity)))
      context.strokeStyle = `rgb(${gray},${gray},${gray})`
      context.lineWidth = Math.max(1, stroke.strokeWidth)
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.beginPath()
      context.moveTo(stroke.points[0] ?? 0, stroke.points[1] ?? 0)
      for (let index = 2; index < stroke.points.length; index += 2) {
        context.lineTo(stroke.points[index], stroke.points[index + 1])
      }
      context.stroke()
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => reject(new Error('Could not load mask image'))
    image.src = dataUrl || createSolidMaskDataUrl(width, height)
  })
}

export function applyGrayMaskToCanvas(source: HTMLCanvasElement, mask: HTMLImageElement) {
  const output = document.createElement('canvas')
  output.width = source.width
  output.height = source.height
  const context = output.getContext('2d')
  if (!context) return source
  context.drawImage(source, 0, 0)
  const sourceData = context.getImageData(0, 0, output.width, output.height)

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = output.width
  maskCanvas.height = output.height
  const maskContext = maskCanvas.getContext('2d')
  if (!maskContext) return source
  maskContext.drawImage(mask, 0, 0, output.width, output.height)
  const maskData = maskContext.getImageData(0, 0, output.width, output.height)

  for (let index = 0; index < sourceData.data.length; index += 4) {
    const luminance = (maskData.data[index] + maskData.data[index + 1] + maskData.data[index + 2]) / 3
    sourceData.data[index + 3] = Math.round(sourceData.data[index + 3] * (luminance / 255))
  }
  context.putImageData(sourceData, 0, 0)
  return output
}

function transformedLayerPoint(layer: HandoutLayer, x: number, y: number) {
  const localX = layer.flipX ? layer.width - x : x
  const radians = ((layer.rotation || 0) * Math.PI) / 180
  return {
    x: layer.x + localX * Math.cos(radians) - y * Math.sin(radians),
    y: layer.y + localX * Math.sin(radians) + y * Math.cos(radians),
  }
}

function maskLocalPoint(mask: LayerMask, x: number, y: number) {
  const radians = -((mask.rotation || 0) * Math.PI) / 180
  const dx = x - mask.x
  const dy = y - mask.y
  const rotatedX = dx * Math.cos(radians) - dy * Math.sin(radians)
  const rotatedY = dx * Math.sin(radians) + dy * Math.cos(radians)
  const scaledX = rotatedX / (mask.scaleX || 1)
  const scaledY = rotatedY / (mask.scaleY || 1)
  return {
    x: mask.flipX ? mask.width - scaledX : scaledX,
    y: scaledY,
  }
}

export function applyLayerMaskToCanvas(
  source: HTMLCanvasElement,
  maskImage: HTMLImageElement,
  layer: HandoutLayer,
  mask: LayerMask,
  sourceScale = 1,
) {
  const output = document.createElement('canvas')
  output.width = source.width
  output.height = source.height
  const context = output.getContext('2d')
  if (!context) return source
  context.drawImage(source, 0, 0)
  const sourceData = context.getImageData(0, 0, output.width, output.height)

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = Math.max(1, Math.round(mask.width))
  maskCanvas.height = Math.max(1, Math.round(mask.height))
  const maskContext = maskCanvas.getContext('2d')
  if (!maskContext) return source
  maskContext.drawImage(maskImage, 0, 0, maskCanvas.width, maskCanvas.height)
  const maskData = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height)

  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const sourceIndex = (y * output.width + x) * 4
      const docPoint = transformedLayerPoint(layer, x / sourceScale, y / sourceScale)
      const local = maskLocalPoint(mask, docPoint.x, docPoint.y)
      const maskX = Math.round(local.x)
      const maskY = Math.round(local.y)
      if (maskX < 0 || maskY < 0 || maskX >= maskCanvas.width || maskY >= maskCanvas.height) {
        sourceData.data[sourceIndex + 3] = 0
        continue
      }
      const maskIndex = (maskY * maskCanvas.width + maskX) * 4
      const luminance = (maskData.data[maskIndex] + maskData.data[maskIndex + 1] + maskData.data[maskIndex + 2]) / 3
      sourceData.data[sourceIndex + 3] = Math.round(sourceData.data[sourceIndex + 3] * (luminance / 255))
    }
  }
  context.putImageData(sourceData, 0, 0)
  return output
}

export function loadImageFromDataUrl(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load data URL image'))
    image.src = dataUrl
  })
}

export async function downsampleDataUrl(dataUrl: string, maxEdge: number) {
  if (!dataUrl || typeof document === 'undefined') return dataUrl
  const startedAt = performance.now()
  const image = await loadImageFromDataUrl(dataUrl)
  const largest = Math.max(image.width, image.height)
  if (largest <= maxEdge) return dataUrl
  const scale = Math.max(0.01, maxEdge / largest)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
  const result = canvas.toDataURL('image/png')
  console.debug('[mask] downsampleDataUrl', {
    source: { width: image.width, height: image.height },
    target: { width: canvas.width, height: canvas.height },
    maxEdge,
    durationMs: Math.round(performance.now() - startedAt),
  })
  return result
}
