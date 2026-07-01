import { v4 as uuidv4 } from 'uuid'

import { defaultEffects, normalizeEffects, type LayerEffects } from './effects'
import type { HandoutLayer, LayerGroup } from './layer'
import type { LayerMask } from './mask'
import { normalizeMask } from './mask'

export type ProjectAssetRecord = {
  id: string
  name: string
  fileName: string
  path: string
  thumbnailPath?: string | null
  tags: string[]
  folder: string
  mediaType: string
  createdAt: string
  updatedAt: string
}

export interface CanvasSettings {
  width: number
  height: number
  backgroundColor: string
  backgroundAssetId?: string
  backgroundVisible: boolean
  backgroundMask: LayerMask | null
  effects: LayerEffects
}

export interface HandoutDocument {
  schemaVersion: 1
  id: string
  title: string
  canvas: CanvasSettings
  layers: HandoutLayer[]
  groups: LayerGroup[]
  projectAssets: ProjectAssetRecord[]
  updatedAt: string
}

export function createDefaultHandout(title = 'Untitled handout'): HandoutDocument {
  return {
    schemaVersion: 1,
    id: uuidv4(),
    title,
    canvas: {
      width: 1280,
      height: 720,
      backgroundColor: 'rgba(0,0,0,0)',
      backgroundVisible: true,
      backgroundMask: null,
      effects: defaultEffects(),
    },
    layers: [],
    groups: [],
    projectAssets: [],
    updatedAt: new Date().toISOString(),
  }
}

export function touch(document: HandoutDocument): HandoutDocument {
  return {
    ...document,
    updatedAt: new Date().toISOString(),
  }
}

export function updateCanvas(
  document: HandoutDocument,
  canvas: Partial<CanvasSettings>,
): HandoutDocument {
  return touch({
    ...document,
    canvas: {
      ...document.canvas,
      ...canvas,
      effects: normalizeEffects({
        ...document.canvas.effects,
        ...canvas.effects,
      }),
    },
  })
}

export function setBackgroundMask(document: HandoutDocument, mask: LayerMask): HandoutDocument {
  return updateCanvas(document, { backgroundMask: normalizeMask(mask, document.canvas) })
}

export function clearBackgroundMask(
  document: HandoutDocument,
  updatedAt = new Date().toISOString(),
): HandoutDocument {
  if (!document.canvas.backgroundMask) return document
  return setBackgroundMask(document, {
    ...document.canvas.backgroundMask,
    enabled: true,
    path: '',
    highResPath: document.canvas.backgroundMask.highResPath,
    cache: null,
    previewPath: null,
    previewUpdatedAt: null,
    strokes: [],
    shapes: [],
    operations: [],
    sourceVersion: document.canvas.backgroundMask.sourceVersion + 1,
    version: document.canvas.backgroundMask.version + 1,
    updatedAt,
  })
}

export function deleteBackgroundMask(document: HandoutDocument): HandoutDocument {
  return updateCanvas(document, { backgroundMask: null })
}
