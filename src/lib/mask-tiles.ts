import type { LayerMask, MaskShapeOperation, MaskTileMeta, PaintStroke } from './handout'
import { tilesForStroke } from './mask-geometry'
import { maskShapeTiles } from './mask-shapes'

export type MaskTileStore = {
  allocatedTileKeys: () => string[]
  applyStroke: (stroke: PaintStroke, date?: Date) => LayerMask
  applyShape: (shape: MaskShapeOperation, date?: Date) => LayerMask
}

export function createMaskTileStore(initialMask: LayerMask): MaskTileStore {
  let mask = cloneMask(initialMask)
  const allocated = new Set(Object.keys(mask.tiles))

  function allocatedTileKeys() {
    return Object.keys(mask.tiles)
  }

  function applyStroke(stroke: PaintStroke, date = new Date()) {
    const updatedAt = date.toISOString()
    const dirtyKeys = tilesForStroke({
      points: stroke.points,
      strokeWidth: stroke.strokeWidth,
      maskWidth: mask.width,
      maskHeight: mask.height,
      tileSize: mask.tileSize,
    })
    const nextTiles = { ...mask.tiles }
    for (const key of dirtyKeys) {
      allocated.add(key)
      nextTiles[key] = nextTileMeta(nextTiles[key], updatedAt)
    }
    mask = {
      ...mask,
      tiles: nextTiles,
      strokes: [...mask.strokes, stroke],
      operations: [...(mask.operations ?? []), { id: stroke.id, kind: 'stroke', stroke }],
      version: mask.version + 1,
      sourceVersion: mask.sourceVersion + 1,
      updatedAt,
    }
    return cloneMask(mask)
  }

  function applyShape(shape: MaskShapeOperation, date = new Date()) {
    const updatedAt = date.toISOString()
    const dirtyKeys = maskShapeTiles(shape, {
      maskWidth: mask.width,
      maskHeight: mask.height,
      tileSize: mask.tileSize,
    })
    const nextTiles = { ...mask.tiles }
    for (const key of dirtyKeys) {
      allocated.add(key)
      nextTiles[key] = nextTileMeta(nextTiles[key], updatedAt)
    }
    mask = {
      ...mask,
      tiles: nextTiles,
      shapes: [...(mask.shapes ?? []), shape],
      operations: [...(mask.operations ?? []), { id: shape.id, kind: 'shape', shape }],
      version: mask.version + 1,
      sourceVersion: mask.sourceVersion + 1,
      updatedAt,
    }
    return cloneMask(mask)
  }

  return {
    allocatedTileKeys,
    applyStroke,
    applyShape,
  }
}

function cloneMask(mask: LayerMask): LayerMask {
  return {
    ...mask,
    matrix: [...mask.matrix],
    tiles: { ...mask.tiles },
    strokes: [...mask.strokes],
    shapes: [...(mask.shapes ?? [])],
    operations: [...(mask.operations ?? [])],
  }
}

function nextTileMeta(current: MaskTileMeta | undefined, updatedAt: string): MaskTileMeta {
  return {
    path: current?.path,
    version: (current?.version ?? 0) + 1,
    updatedAt,
  }
}
