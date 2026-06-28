import { v4 as uuidv4 } from 'uuid'
import { matrixFromComponents } from '../mask-geometry'
import type { AffineMatrix } from '../mask-geometry'
import type { PaintStroke } from './paint'

type CanvasSize = {
  width: number
  height: number
}

export type LayerMask = {
  id: string
  layerId?: string
  enabled: boolean
  path: string | null
  highResPath: string
  width: number
  height: number
  matrix: AffineMatrix
  tileSize: number
  defaultAlpha: number
  tiles: Record<string, MaskTileMeta>
  strokes: PaintStroke[]
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  flipX: boolean
  previewPath?: string | null
  previewScale: number
  previewUpdatedAt?: string | null
  cache?: MaskCacheMeta | null
  sourceVersion: number
  version: number
  opacity?: number
  updatedAt: string
}

export type MaskTileMeta = {
  path?: string
  version: number
  updatedAt: string
}

export type MaskCacheMeta = {
  preview1200Path?: string
  sourceVersion: number
  previewVersion: number
  maxEdge: number
  updatedAt: string
}

export function createCanvasLayerMask(
  canvas: CanvasSize,
  input: Partial<LayerMask> = {},
): LayerMask {
  const id = input.id || uuidv4()
  const highResPath = input.highResPath || input.path || `masks/${id}.png`
  return {
    id,
    layerId: input.layerId,
    enabled: input.enabled ?? true,
    path: input.path ?? null,
    highResPath,
    width: Math.max(1, Math.round(input.width ?? canvas.width)),
    height: Math.max(1, Math.round(input.height ?? canvas.height)),
    matrix: input.matrix ?? [1, 0, 0, 1, 0, 0],
    tileSize: input.tileSize ?? 512,
    defaultAlpha: input.defaultAlpha ?? 255,
    tiles: input.tiles ?? {},
    strokes: input.strokes ?? [],
    x: input.x ?? 0,
    y: input.y ?? 0,
    scaleX: input.scaleX ?? 1,
    scaleY: input.scaleY ?? 1,
    rotation: input.rotation ?? 0,
    flipX: input.flipX ?? false,
    previewPath: input.previewPath ?? null,
    previewScale: input.previewScale ?? 1,
    previewUpdatedAt: input.previewUpdatedAt ?? null,
    cache: input.cache ?? null,
    sourceVersion: input.sourceVersion ?? 1,
    version: input.version ?? input.sourceVersion ?? 1,
    opacity: input.opacity,
    updatedAt: input.updatedAt || new Date().toISOString(),
  }
}

export function normalizeMask(
  mask?: Partial<LayerMask> | null,
  canvas?: CanvasSize,
): LayerMask | null {
  if (!mask) return null
  const width = Math.max(1, Math.round(canvas?.width ?? mask.width ?? 1))
  const height = Math.max(1, Math.round(canvas?.height ?? mask.height ?? 1))
  const id = mask.id || uuidv4()
  const highResPath = mask.highResPath || mask.path || `masks/${id}.png`
  const sourceVersion = mask.sourceVersion ?? mask.version ?? 1
  return {
    id,
    layerId: mask.layerId,
    enabled: mask.enabled ?? true,
    path: mask.path ?? null,
    highResPath,
    width,
    height,
    matrix: normalizeMatrix(mask, width),
    tileSize: Math.max(64, Math.round(mask.tileSize ?? 512)),
    defaultAlpha: Math.max(0, Math.min(255, Math.round(mask.defaultAlpha ?? 255))),
    tiles: normalizeTiles(mask.tiles),
    strokes: mask.strokes ?? [],
    x: mask.x ?? 0,
    y: mask.y ?? 0,
    scaleX: mask.scaleX ?? 1,
    scaleY: mask.scaleY ?? 1,
    rotation: mask.rotation ?? 0,
    flipX: mask.flipX ?? false,
    previewPath: mask.previewPath ?? null,
    previewScale: mask.previewScale ?? 1,
    previewUpdatedAt: mask.previewUpdatedAt ?? null,
    cache: normalizeMaskCache(mask.cache, sourceVersion),
    sourceVersion,
    version: mask.version ?? sourceVersion,
    opacity: mask.opacity,
    updatedAt: mask.updatedAt || new Date().toISOString(),
  }
}

function normalizeMatrix(mask: Partial<LayerMask>, width: number): AffineMatrix {
  const matrix = mask.matrix
  const values = Array.isArray(matrix) ? matrix : []
  if (values.length) {
    return [0, 1, 2, 3, 4, 5].map((index) => {
      const value = Number(values[index])
      return Number.isFinite(value) ? value : index === 0 || index === 3 ? 1 : 0
    }) as AffineMatrix
  }
  const scaleX = Math.abs(mask.scaleX ?? 1)
  const scaleY = mask.scaleY ?? 1
  return matrixFromComponents({
    x: mask.flipX ? (mask.x ?? 0) + width * scaleX : mask.x ?? 0,
    y: mask.y ?? 0,
    rotation: mask.rotation ?? 0,
    scaleX: mask.flipX ? -scaleX : scaleX,
    scaleY,
  })
}

function normalizeTiles(tiles: LayerMask['tiles'] | undefined): LayerMask['tiles'] {
  if (!tiles) return {}
  return Object.fromEntries(Object.entries(tiles).map(([key, tile]) => [
    key,
    {
      path: tile.path,
      version: tile.version ?? 1,
      updatedAt: tile.updatedAt || new Date().toISOString(),
    },
  ]))
}

function normalizeMaskCache(
  cache: Partial<MaskCacheMeta> | null | undefined,
  sourceVersion: number,
): MaskCacheMeta | null {
  if (!cache) return null
  return {
    preview1200Path: cache.preview1200Path,
    sourceVersion: cache.sourceVersion ?? sourceVersion,
    previewVersion: cache.previewVersion ?? 1,
    maxEdge: cache.maxEdge ?? 1200,
    updatedAt: cache.updatedAt || new Date().toISOString(),
  }
}
