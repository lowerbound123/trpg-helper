import type { HandoutLayer, LayerMask, PaintStroke } from './handout'
import { documentPointToMaskLocal, matrixApplyToPoint } from './mask-geometry'

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

export async function drawMaskStrokes(
  dataUrl: string,
  width: number,
  height: number,
  strokes: PaintStroke[],
) {
  let current = dataUrl || createSolidMaskDataUrl(width, height)
  for (const stroke of strokes) {
    current = await drawMaskStroke(current, width, height, stroke)
  }
  return current
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

export function transformedLayerPoint(layer: HandoutLayer, x: number, y: number) {
  const localX = layer.flipX ? layer.width - x : x
  const radians = ((layer.rotation || 0) * Math.PI) / 180
  return {
    x: layer.x + localX * Math.cos(radians) - y * Math.sin(radians),
    y: layer.y + localX * Math.sin(radians) + y * Math.cos(radians),
  }
}

export function layerLocalPointFromDocument(layer: HandoutLayer, x: number, y: number) {
  const radians = -((layer.rotation || 0) * Math.PI) / 180
  const dx = x - layer.x
  const dy = y - layer.y
  const rotatedX = dx * Math.cos(radians) - dy * Math.sin(radians)
  const rotatedY = dx * Math.sin(radians) + dy * Math.cos(radians)
  return {
    x: layer.flipX ? layer.width - rotatedX : rotatedX,
    y: rotatedY,
  }
}

export function maskDocumentPoint(mask: LayerMask, x: number, y: number) {
  return matrixApplyToPoint(mask.matrix, { x, y })
}

export function maskLocalPoint(mask: LayerMask, x: number, y: number) {
  return documentPointToMaskLocal(mask, { x, y })
}

export function imageToAlphaMaskCanvas(image: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, image.width)
  canvas.height = Math.max(1, image.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return canvas
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let index = 0; index < pixels.data.length; index += 4) {
    const luminance = (pixels.data[index] + pixels.data[index + 1] + pixels.data[index + 2]) / 3
    pixels.data[index] = 255
    pixels.data[index + 1] = 255
    pixels.data[index + 2] = 255
    pixels.data[index + 3] = Math.round(pixels.data[index + 3] * (luminance / 255))
  }
  context.putImageData(pixels, 0, 0)
  return canvas
}

function maskPointToLayerOutput(layer: HandoutLayer, mask: LayerMask, x: number, y: number, sourceScale: number) {
  const docPoint = maskDocumentPoint(mask, x, y)
  const layerPoint = layerLocalPointFromDocument(layer, docPoint.x, docPoint.y)
  return {
    x: layerPoint.x * sourceScale,
    y: layerPoint.y * sourceScale,
  }
}

export function createLayerLocalMaskCanvas(
  maskImage: HTMLImageElement,
  layer: HandoutLayer,
  mask: LayerMask,
  sourceWidth: number,
  sourceHeight: number,
  sourceScale = 1,
) {
  const alphaMask = imageToAlphaMaskCanvas(maskImage)
  const output = document.createElement('canvas')
  output.width = Math.max(1, Math.round(sourceWidth))
  output.height = Math.max(1, Math.round(sourceHeight))
  const context = output.getContext('2d')
  if (!context) return output

  const origin = maskPointToLayerOutput(layer, mask, 0, 0, sourceScale)
  const xAxis = maskPointToLayerOutput(layer, mask, 1, 0, sourceScale)
  const yAxis = maskPointToLayerOutput(layer, mask, 0, 1, sourceScale)
  context.setTransform(
    xAxis.x - origin.x,
    xAxis.y - origin.y,
    yAxis.x - origin.x,
    yAxis.y - origin.y,
    origin.x,
    origin.y,
  )
  context.drawImage(alphaMask, 0, 0, mask.width, mask.height)
  context.setTransform(1, 0, 0, 1, 0, 0)
  return output
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
  const localMask = createLayerLocalMaskCanvas(maskImage, layer, mask, output.width, output.height, sourceScale)
  context.globalCompositeOperation = 'destination-in'
  context.drawImage(localMask, 0, 0)
  context.globalCompositeOperation = 'source-over'
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
