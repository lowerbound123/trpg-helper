import { Application, Container, Sprite, Texture } from 'pixi.js'

import { loadImageFromDataUrl } from '@/lib/mask'

export type ComposeMaskPreviewInput = {
  layerId: string
  maskId: string
  sourcePath: string
  maskPath: string
  layerX: number
  layerY: number
  layerWidth: number
  layerHeight: number
  layerRotation: number
  layerFlipX: boolean
  maskOffsetX: number
  maskOffsetY: number
  maskWidth: number
  maskHeight: number
  maskScaleX: number
  maskScaleY: number
  maskRotation: number
  maskFlipX: boolean
  documentWidth: number
  documentHeight: number
  outputMaxEdge: number
  sourceVersion: number
}

export type ComposeMaskPreviewResult = {
  canvas: HTMLCanvasElement
  width: number
  height: number
  scale: number
  durationMs: {
    load: number
    render: number
    extract: number
    total: number
  }
}

function now() {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function outputScale(input: ComposeMaskPreviewInput) {
  const largest = Math.max(1, input.layerWidth, input.layerHeight)
  return Math.min(1, Math.max(0.01, input.outputMaxEdge / largest))
}

function imageToAlphaCanvas(image: HTMLImageElement) {
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

function asHtmlCanvas(canvasLike: unknown) {
  if (canvasLike instanceof HTMLCanvasElement) return canvasLike
  const source = canvasLike as { width?: number; height?: number; getContext?: HTMLCanvasElement['getContext'] }
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width || 1))
  canvas.height = Math.max(1, Math.round(source.height || 1))
  const context = canvas.getContext('2d')
  if (context && source) context.drawImage(source as CanvasImageSource, 0, 0)
  return canvas
}

export async function composeMaskPreview(input: ComposeMaskPreviewInput): Promise<ComposeMaskPreviewResult> {
  const totalStartedAt = now()
  const loadStartedAt = now()
  const [sourceImage, maskImage] = await Promise.all([
    loadImageFromDataUrl(input.sourcePath),
    loadImageFromDataUrl(input.maskPath),
  ])
  const alphaMaskCanvas = imageToAlphaCanvas(maskImage)
  const loadMs = now() - loadStartedAt

  const scale = outputScale(input)
  const width = Math.max(1, Math.round(input.layerWidth * scale))
  const height = Math.max(1, Math.round(input.layerHeight * scale))
  const app = new Application()

  const renderStartedAt = now()
  await app.init({
    width,
    height,
    backgroundAlpha: 0,
    antialias: false,
    autoStart: false,
    preference: 'webgl',
  })

  const stage = new Container()
  const sourceTexture = Texture.from(sourceImage)
  const maskTexture = Texture.from(alphaMaskCanvas)
  const source = new Sprite(sourceTexture)
  source.width = width
  source.height = height
  source.x = input.layerFlipX ? width : 0
  source.scale.x *= input.layerFlipX ? -1 : 1

  const mask = new Sprite(maskTexture)
  mask.x = (input.maskOffsetX - input.layerX) * scale
  mask.y = (input.maskOffsetY - input.layerY) * scale
  mask.width = input.maskWidth * input.maskScaleX * scale
  mask.height = input.maskHeight * input.maskScaleY * scale
  mask.rotation = (input.maskRotation * Math.PI) / 180
  if (input.maskFlipX) {
    mask.x += mask.width
    mask.scale.x *= -1
  }

  source.mask = mask
  stage.addChild(source)
  stage.addChild(mask)
  app.renderer.render({ container: stage, clear: true })
  const renderMs = now() - renderStartedAt

  const extractStartedAt = now()
  const extracted = app.renderer.extract.canvas({
    target: stage,
    clearColor: [0, 0, 0, 0],
  })
  const canvas = asHtmlCanvas(extracted)
  const extractMs = now() - extractStartedAt

  source.mask = null
  stage.destroy({ children: true })
  sourceTexture.destroy(true)
  maskTexture.destroy(true)
  ;(app.destroy as unknown as (removeView?: boolean) => void)(true)

  return {
    canvas,
    width,
    height,
    scale,
    durationMs: {
      load: Math.round(loadMs),
      render: Math.round(renderMs),
      extract: Math.round(extractMs),
      total: Math.round(now() - totalStartedAt),
    },
  }
}
