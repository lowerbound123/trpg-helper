import type { HandoutDocument } from '../document'
import { touch } from '../document'

import { groupForLayer, layersByIds, normalizeZIndex } from './shared'
import type { LayerGroup } from './types'

export function moveLayer(
  document: HandoutDocument,
  layerId: string,
  targetIndex: number,
): HandoutDocument {
  const group = groupForLayer(document, layerId)
  if (group) return moveLayerGroup(document, group.id, targetIndex)

  const layers = [...document.layers]
  const currentIndex = layers.findIndex((layer) => layer.id === layerId)
  if (currentIndex < 0) return document

  const [layer] = layers.splice(currentIndex, 1)
  const boundedIndex = Math.max(0, Math.min(targetIndex, layers.length))
  layers.splice(boundedIndex, 0, layer)

  return touch({
    ...document,
    layers: normalizeZIndex(layers),
  })
}

export function moveLayerGroup(
  document: HandoutDocument,
  groupId: string,
  targetIndex: number,
): HandoutDocument {
  const group = document.groups.find((item) => item.id === groupId)
  if (!group) return document
  const groupIds = new Set(group.layerIds)
  const groupLayers = layersByIds(document, group.layerIds)
  if (!groupLayers.length) return document
  const remaining = document.layers.filter((layer) => !groupIds.has(layer.id))
  const boundedIndex = Math.max(0, Math.min(targetIndex, remaining.length))
  remaining.splice(boundedIndex, 0, ...groupLayers)
  return touch({
    ...document,
    layers: normalizeZIndex(remaining),
  })
}

function groupZRange(document: HandoutDocument, group: LayerGroup) {
  const gLayers = layersByIds(document, group.layerIds)
  if (!gLayers.length) return null
  const zIndices = gLayers.map((l) => l.zIndex)
  return { min: Math.min(...zIndices), max: Math.max(...zIndices) }
}

export function swapLayersInGroup(
  document: HandoutDocument,
  layerIdA: string,
  layerIdB: string,
  groupId: string,
): HandoutDocument {
  const layers = [...document.layers]
  const idxA = layers.findIndex((l) => l.id === layerIdA)
  const idxB = layers.findIndex((l) => l.id === layerIdB)
  if (idxA < 0 || idxB < 0) return document

  const tmp = layers[idxA]
  layers[idxA] = layers[idxB]
  layers[idxB] = tmp

  const normalized = normalizeZIndex(layers)

  const group = document.groups.find((g) => g.id === groupId)
  if (!group) return touch({ ...document, layers: normalized })

  const newOrder = normalized
    .filter((l) => group.layerIds.includes(l.id))
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((l) => l.id)

  const newGroups = document.groups.map((g) =>
    g.id === groupId ? { ...g, layerIds: newOrder } : g,
  )

  return touch({ ...document, layers: normalized, groups: newGroups })
}

export function moveLayerSkippingGroups(
  document: HandoutDocument,
  layerId: string,
  delta: number,
): HandoutDocument {
  const layer = document.layers.find((l) => l.id === layerId)
  if (!layer) return document

  let targetZ = layer.zIndex + delta

  for (const g of document.groups) {
    const range = groupZRange(document, g)
    if (!range) continue
    if (targetZ >= range.min && targetZ <= range.max) {
      targetZ = delta > 0 ? range.max + 1 : range.min - 1
    }
  }

  return moveLayer(document, layerId, targetZ)
}

export function moveLayerInGroupAware(
  document: HandoutDocument,
  layerId: string,
  delta: number,
): HandoutDocument {
  const group = groupForLayer(document, layerId)
  if (!group) {
    return moveLayerSkippingGroups(document, layerId, delta)
  }

  const gLayers = layersByIds(document, group.layerIds).sort((a, b) => a.zIndex - b.zIndex)
  const sortedIds = gLayers.map((l) => l.id)
  const posInGroup = sortedIds.indexOf(layerId)
  const currentLayer = document.layers.find((l) => l.id === layerId)!

  if ((delta > 0 && posInGroup === sortedIds.length - 1) || (delta < 0 && posInGroup === 0)) {
    return moveLayerGroup(document, group.id, currentLayer.zIndex + delta)
  }

  const targetPos = posInGroup + (delta > 0 ? 1 : -1)
  if (targetPos < 0 || targetPos >= sortedIds.length) return document

  return swapLayersInGroup(document, layerId, sortedIds[targetPos], group.id)
}
