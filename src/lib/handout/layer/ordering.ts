import type { HandoutDocument } from '../document'
import { touch } from '../document'

import { groupForLayer, layersByIds, normalizeZIndex } from './shared'

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

function groupLayerIdsSet(document: HandoutDocument): Set<string> {
  const ids = new Set<string>()
  for (const g of document.groups) for (const id of g.layerIds) ids.add(id)
  return ids
}

function swapArrayElements<T>(arr: T[], i: number, j: number): T[] {
  if (i < 0 || j < 0 || i >= arr.length || j >= arr.length) return arr
  const result = [...arr]
  const tmp = result[i]
  result[i] = result[j]
  result[j] = tmp
  return result
}

function swapLayersAndSyncGroup(
  document: HandoutDocument,
  layerIdA: string,
  layerIdB: string,
  groupId: string,
): HandoutDocument {
  const layers = swapArrayElements(
    document.layers,
    document.layers.findIndex((l) => l.id === layerIdA),
    document.layers.findIndex((l) => l.id === layerIdB),
  )
  const normalized = normalizeZIndex(layers)
  const group = document.groups.find((g) => g.id === groupId)
  if (!group) return touch({ ...document, layers: normalized })
  const newOrder = normalized
    .filter((l) => group.layerIds.includes(l.id))
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((l) => l.id)
  return touch({
    ...document,
    layers: normalized,
    groups: document.groups.map((g) => (g.id === groupId ? { ...g, layerIds: newOrder } : g)),
  })
}

export function moveLayerInGroupAware(
  document: HandoutDocument,
  layerId: string,
  delta: number,
): HandoutDocument {
  const layers = document.layers
  const currentIndex = layers.findIndex((l) => l.id === layerId)
  if (currentIndex < 0) return document

  const group = groupForLayer(document, layerId)

  if (!group) {
    const allGroupIds = groupLayerIdsSet(document)
    const dir = delta > 0 ? 1 : -1
    for (let i = currentIndex + dir; i >= 0 && i < layers.length; i += dir) {
      if (!allGroupIds.has(layers[i].id)) {
        return touch({ ...document, layers: normalizeZIndex(swapArrayElements(layers, currentIndex, i)) })
      }
    }
    return document
  }

  const gLayers = layersByIds(document, group.layerIds).sort((a, b) => a.zIndex - b.zIndex)
  const sortedIds = gLayers.map((l) => l.id)
  const posInGroup = sortedIds.indexOf(layerId)
  const groupStartIndex = layers.findIndex((l) => l.id === sortedIds[0])
  const groupEndIndex = layers.findIndex((l) => l.id === sortedIds[sortedIds.length - 1])

  if ((delta > 0 && posInGroup < sortedIds.length - 1) || (delta < 0 && posInGroup > 0)) {
    const targetPos = posInGroup + (delta > 0 ? 1 : -1)
    return swapLayersAndSyncGroup(document, layerId, sortedIds[targetPos], group.id)
  }

  const targetIndex = delta > 0 ? groupEndIndex + 1 : groupStartIndex - 1
  if (targetIndex < 0 || targetIndex >= layers.length) return document
  return touch({ ...document, layers: normalizeZIndex(swapArrayElements(layers, currentIndex, targetIndex)) })
}
