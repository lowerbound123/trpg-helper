import { v4 as uuidv4 } from 'uuid'

import type { HandoutDocument } from '../document'
import { touch } from '../document'
import type { LayerMask } from '../mask'
import { normalizeMask } from '../mask'

import { updateLayer } from './update'
import type { HandoutLayer, LayerPatch } from './types'

export function setLayerMask(
  document: HandoutDocument,
  layerId: string,
  mask: LayerMask,
): HandoutDocument {
  return updateLayer(document, layerId, { mask: normalizeMask(mask) } as LayerPatch)
}

export function setLayerMaskEnabled(
  document: HandoutDocument,
  layerId: string,
  enabled: boolean,
): HandoutDocument {
  const layer = document.layers.find((item) => item.id === layerId)
  if (!layer?.mask) return document
  return setLayerMask(document, layerId, { ...layer.mask, enabled })
}

export function clearLayerMask(
  document: HandoutDocument,
  layerId: string,
  updatedAt = new Date().toISOString(),
): HandoutDocument {
  const layer = document.layers.find((item) => item.id === layerId)
  if (!layer?.mask) return document
  return setLayerMask(document, layerId, {
    ...layer.mask,
    enabled: true,
    path: '',
    cache: null,
    previewPath: null,
    previewUpdatedAt: null,
    strokes: [],
    shapes: [],
    operations: [],
    sourceVersion: layer.mask.sourceVersion + 1,
    version: layer.mask.version + 1,
    updatedAt,
  })
}

export function deleteLayerMask(document: HandoutDocument, layerId: string): HandoutDocument {
  return updateLayer(document, layerId, { mask: null } as LayerPatch)
}

export function transferLayerMask(
  document: HandoutDocument,
  sourceLayerId: string,
  targetLayerId: string,
  updatedAt = new Date().toISOString(),
): HandoutDocument {
  if (sourceLayerId === targetLayerId) return document
  const source = document.layers.find((layer) => layer.id === sourceLayerId)
  const target = document.layers.find((layer) => layer.id === targetLayerId)
  if (!source?.mask || !target) return document
  const nextMask = normalizeMask({
    ...source.mask,
    layerId: targetLayerId,
    path: '',
    highResPath: `masks/${source.mask.id}.png`,
    previewPath: null,
    previewUpdatedAt: null,
    cache: null,
    updatedAt,
  })!
  return touch({
    ...document,
    layers: document.layers.map((layer) => {
      if (layer.id === sourceLayerId) return { ...layer, mask: null } as HandoutLayer
      if (layer.id === targetLayerId) return { ...layer, mask: nextMask } as HandoutLayer
      return layer
    }),
  })
}

export function copyLayerMask(
  document: HandoutDocument,
  sourceLayerId: string,
  targetLayerId: string,
  maskId = uuidv4(),
  updatedAt = new Date().toISOString(),
): HandoutDocument {
  if (sourceLayerId === targetLayerId) return document
  const source = document.layers.find((layer) => layer.id === sourceLayerId)
  const target = document.layers.find((layer) => layer.id === targetLayerId)
  if (!source?.mask || !target) return document
  const nextMask = normalizeMask({
    ...source.mask,
    id: maskId,
    layerId: targetLayerId,
    path: '',
    highResPath: `masks/${maskId}.png`,
    previewPath: null,
    previewUpdatedAt: null,
    cache: null,
    updatedAt,
  })!
  return updateLayer(document, targetLayerId, { mask: nextMask } as LayerPatch)
}
