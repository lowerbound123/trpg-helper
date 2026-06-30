import type { HandoutLayer } from '@/lib/handout'
import type { ImageLayer, PaintLayer, ShapeLayer, TextLayer } from '@/lib/handout'

export type ImageCache = Record<string, HTMLImageElement>
export type CanvasSize = { width: number; height: number }
export type ProjectFileTarget = { projectId?: string; projectDir?: string }
export type RenderMaskOptions = {
  masksEnabled?: boolean
  projectTarget?: ProjectFileTarget
  maskDataUrls?: Record<string, string>
  maskRenderMode?: 'preview-runtime' | 'export-deterministic'
  maxMaskEdge?: number
  maxCompositeEdge?: number
  usePixiMaskPreview?: boolean
}

export const PREVIEW_TARGET_BYTES = 512 * 1024
export const PREVIEW_MAX_BYTES = 1024 * 1024
export const PREVIEW_MAX_EDGE = 256

export function isImageLayer(layer: HandoutLayer): layer is ImageLayer {
  return layer.type === 'image'
}

export function isTextLayer(layer: HandoutLayer): layer is TextLayer {
  return layer.type === 'text'
}

export function isShapeLayer(layer: HandoutLayer): layer is ShapeLayer {
  return layer.type === 'shape'
}

export function isPaintLayer(layer: HandoutLayer): layer is PaintLayer {
  return layer.type === 'paint'
}
