import { Application, Container, Sprite, Texture } from 'pixi.js'

export type ComposeMaskPreviewInput = {
  layerId: string
  maskId: string
  sourceCanvas: HTMLCanvasElement
  localMaskCanvas: HTMLCanvasElement
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

let sharedAppPromise: Promise<Application> | undefined

async function getSharedApp(width: number, height: number) {
  if (!sharedAppPromise) {
    const app = new Application()
    sharedAppPromise = app.init({
      width,
      height,
      backgroundAlpha: 0,
      antialias: false,
      autoStart: false,
      // PixiJS v8 supports forcing the renderer preference during Application
      // init. Canvas avoids WebGL/WebView readback SecurityError in Tauri.
      preference: ['canvas'],
    }).then(() => app)
  }
  const app = await sharedAppPromise
  app.renderer.resize(width, height)
  return app
}

export async function composeMaskPreview(input: ComposeMaskPreviewInput): Promise<ComposeMaskPreviewResult> {
  const totalStartedAt = now()
  const loadStartedAt = now()
  const width = Math.max(1, Math.round(input.sourceCanvas.width))
  const height = Math.max(1, Math.round(input.sourceCanvas.height))
  const loadMs = now() - loadStartedAt

  const renderStartedAt = now()
  const app = await getSharedApp(width, height)
  const stage = new Container()
  const sourceTexture = Texture.from(input.sourceCanvas)
  const maskTexture = Texture.from(input.localMaskCanvas)
  const source = new Sprite(sourceTexture)
  const mask = new Sprite(maskTexture)
  source.width = width
  source.height = height
  mask.width = width
  mask.height = height
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

  return {
    canvas,
    width,
    height,
    scale: 1,
    durationMs: {
      load: Math.round(loadMs),
      render: Math.round(renderMs),
      extract: Math.round(extractMs),
      total: Math.round(now() - totalStartedAt),
    },
  }
}
