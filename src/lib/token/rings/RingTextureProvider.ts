import { invoke } from '@tauri-apps/api/core'

import type { PreviewImageSource } from '../preview/imageLoader'
import type { TokenFeatureConfiguration } from '../configuration'
import type { CustomRingConfig, RingDescriptor } from '../types'
import { BUILTIN_RING_SVGS } from './builtinAssets'
import { mapRingPixelsToBand } from './radialMap'

export interface BuiltinRingPreviewParams {
  id: string
  designSize: number
  innerRadius: number
  outerRadius: number
  targetSize: number
}

export interface FrontendRingProvider {
  renderBuiltin(params: BuiltinRingPreviewParams): Promise<PreviewImageSource>
  loadCustomAsset(id: string): Promise<PreviewImageSource>
  loadThumbnail(id: string, size: number): Promise<PreviewImageSource>
  evict(id?: string): void
  destroy(): void
}

type DescriptorLookup = (id: string) => RingDescriptor | undefined
type BinaryInvoke = (command: string, args: Record<string, unknown>) => Promise<ArrayBuffer>
type BinaryDecoder = (data: ArrayBuffer | Uint8Array) => Promise<PreviewImageSource>

async function decodeImageBytes(data: ArrayBuffer | Uint8Array): Promise<PreviewImageSource> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: 'image/png' }))
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('自定义圆环图片解码失败'))
      element.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    canvas.getContext('2d')?.drawImage(image, 0, 0)
    return { source: canvas, width: canvas.width, height: canvas.height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function decodeSvg(svg: string, size: number): Promise<ImageData> {
  const whiteSvg = svg.replaceAll('currentColor', '#FFFFFF')
  const url = URL.createObjectURL(new Blob([whiteSvg], { type: 'image/svg+xml' }))
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('内置 SVG 圆环解码失败'))
      element.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('无法创建圆环 Canvas')
    context.drawImage(image, 0, 0, size, size)
    return context.getImageData(0, 0, size, size)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function canvasFromPixels(pixels: Uint8ClampedArray, size: number): PreviewImageSource {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建圆环 Canvas')
  context.putImageData(new ImageData(Uint8ClampedArray.from(pixels), size, size), 0, 0)
  return { source: canvas, width: size, height: size }
}

function drawCustomThumbnail(
  source: PreviewImageSource,
  config: CustomRingConfig,
  size: number,
): PreviewImageSource {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建圆环缩略图 Canvas')
  const factor = size / config.designSize
  const fit = (2 * config.outerRadius * factor) / Math.max(source.width, source.height)
  const width = source.width * fit * (config.imageScaleX / 100)
  const height = source.height * fit * (config.imageScaleY / 100)
  const x = (size - width) / 2 + config.imageOffsetX * factor
  const y = (size - height) / 2 + config.imageOffsetY * factor
  context.drawImage(source.source, x, y, width, height)
  context.globalCompositeOperation = 'destination-in'
  context.beginPath()
  context.arc(size / 2, size / 2, config.outerRadius * factor, 0, Math.PI * 2)
  context.arc(size / 2, size / 2, config.innerRadius * factor, 0, Math.PI * 2, true)
  context.fill('evenodd')
  return { source: canvas, width: size, height: size }
}

export class AppFrontendRingProvider implements FrontendRingProvider {
  private readonly cache = new Map<string, PreviewImageSource>()
  private readonly customAssets = new Map<string, Promise<PreviewImageSource>>()
  private readonly builtinSources = new Map<string, Promise<ImageData>>()
  private worker: Worker | null
  private readonly pending = new Map<
    number,
    { resolve: (pixels: Uint8ClampedArray) => void; reject: (error: Error) => void }
  >()
  private workerSourceIds = new Set<string>()
  private requestId = 0
  private readonly configuration: TokenFeatureConfiguration
  private readonly descriptor: DescriptorLookup
  private readonly invokeBinary: BinaryInvoke
  private readonly decodeBinary: BinaryDecoder

  constructor(
    configuration: TokenFeatureConfiguration,
    descriptor: DescriptorLookup,
    invokeBinary: BinaryInvoke = (command, args) => invoke(command, args),
    decodeBinary: BinaryDecoder = decodeImageBytes,
  ) {
    this.configuration = configuration
    this.descriptor = descriptor
    this.invokeBinary = invokeBinary
    this.decodeBinary = decodeBinary
    try {
      this.worker = new Worker(new URL('./builtinRing.worker.ts', import.meta.url), {
        type: 'module',
      })
      this.worker.onmessage = (event) => this.handleWorkerMessage(event)
      this.worker.onerror = () => this.disableWorker()
    } catch {
      this.worker = null
    }
  }

  async renderBuiltin(params: BuiltinRingPreviewParams): Promise<PreviewImageSource> {
    const key = `builtin:${params.id}:${params.designSize}:${params.targetSize}:${params.innerRadius}:${params.outerRadius}`
    const cached = this.cache.get(key)
    if (cached) return this.touch(key, cached)
    const svg = BUILTIN_RING_SVGS[params.id]
    if (!svg) throw new Error(`内置圆环不存在：${params.id}`)
    const source = await this.builtinSource(params.id, svg)
    const scale = params.targetSize / params.designSize
    const input = {
      pixels: source.data,
      sourceSize: source.width,
      targetSize: params.targetSize,
      inner: params.innerRadius * scale,
      outer: params.outerRadius * scale,
    }
    let pixels: Uint8ClampedArray
    try {
      pixels = this.worker ? await this.mapInWorker(params.id, input) : mapRingPixelsToBand(input)
    } catch {
      pixels = mapRingPixelsToBand(input)
    }
    return this.remember(key, canvasFromPixels(pixels, params.targetSize))
  }

  async loadCustomAsset(id: string): Promise<PreviewImageSource> {
    const existing = this.customAssets.get(id)
    if (existing) return existing
    const loading = this.invokeBinary('read_custom_ring_asset', { id }).then(this.decodeBinary)
    this.customAssets.set(id, loading)
    try {
      return await loading
    } catch (error) {
      this.customAssets.delete(id)
      throw error
    }
  }

  async loadThumbnail(id: string, size: number): Promise<PreviewImageSource> {
    const descriptor = this.descriptor(id)
    if (!descriptor) throw new Error(`圆环不存在：${id}`)
    const key = `thumbnail:${id}:${descriptor.revision}:${size}`
    const cached = this.cache.get(key)
    if (cached) return this.touch(key, cached)
    if (descriptor.kind === 'builtin') {
      const defaults = this.configuration.defaults
      const image = await this.renderBuiltin({
        id,
        designSize: defaults.designSize,
        innerRadius: defaults.ringInnerRadius,
        outerRadius: defaults.ringOuterRadius,
        targetSize: size,
      })
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')!
      context.drawImage(image.source, 0, 0, size, size)
      context.globalCompositeOperation = 'source-in'
      context.fillStyle = '#000000'
      context.fillRect(0, 0, size, size)
      return this.remember(key, { source: canvas, width: size, height: size })
    }
    if (!descriptor.customConfig) throw new Error('自定义圆环缺少几何配置')
    return this.remember(
      key,
      drawCustomThumbnail(await this.loadCustomAsset(id), descriptor.customConfig, size),
    )
  }

  evict(id?: string): void {
    if (!id) {
      this.cache.clear()
      this.customAssets.clear()
      return
    }
    this.customAssets.delete(id)
    for (const key of this.cache.keys()) if (key.includes(`:${id}:`)) this.cache.delete(key)
  }

  destroy(): void {
    this.worker?.terminate()
    this.disableWorker()
    this.evict()
    this.builtinSources.clear()
  }

  private builtinSource(id: string, svg: string) {
    let source = this.builtinSources.get(id)
    if (!source) {
      source = decodeSvg(svg, 512)
      this.builtinSources.set(id, source)
    }
    return source
  }

  private mapInWorker(
    id: string,
    input: Parameters<typeof mapRingPixelsToBand>[0],
  ): Promise<Uint8ClampedArray> {
    const requestId = ++this.requestId
    const includeSource = !this.workerSourceIds.has(id)
    this.workerSourceIds.add(id)
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject })
      this.worker!.postMessage({
        requestId,
        id,
        source: includeSource ? input.pixels.slice().buffer : undefined,
        sourceSize: input.sourceSize,
        targetSize: input.targetSize,
        inner: input.inner,
        outer: input.outer,
      })
    })
  }

  private handleWorkerMessage(event: MessageEvent) {
    const pending = this.pending.get(event.data.requestId)
    if (!pending) return
    this.pending.delete(event.data.requestId)
    if (event.data.error) pending.reject(new Error(event.data.error))
    else pending.resolve(new Uint8ClampedArray(event.data.pixels))
  }

  private disableWorker() {
    this.worker?.terminate()
    this.worker = null
    for (const pending of this.pending.values()) pending.reject(new Error('圆环 Worker 不可用'))
    this.pending.clear()
    this.workerSourceIds.clear()
  }

  private touch(key: string, image: PreviewImageSource) {
    this.cache.delete(key)
    this.cache.set(key, image)
    return image
  }

  private remember(key: string, image: PreviewImageSource) {
    this.touch(key, image)
    while (this.cache.size > this.configuration.rings.frontendCacheEntries) {
      this.cache.delete(this.cache.keys().next().value!)
    }
    return image
  }
}
