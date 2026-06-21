import { v4 as uuidv4 } from 'uuid'

import type { HandoutDocument } from '../document'
import { touch } from '../document'

import { layerIdsInZOrder, layersByIds, nextGroupName, normalizeZIndex } from './shared'
import type { LayerGroup } from './types'

export function addLayerGroup(
  document: HandoutDocument,
  layerIds: string[],
  name?: string,
): HandoutDocument {
  const existing = new Set(document.layers.map((layer) => layer.id))
  const uniqueIds = layerIds.filter((id, index) => existing.has(id) && layerIds.indexOf(id) === index)
  const ids = layerIdsInZOrder(document, uniqueIds)
  if (!ids.length) return document
  const cleanedGroups = document.groups
    .map((group) => ({
      ...group,
      layerIds: group.layerIds.filter((id) => !ids.includes(id)),
    }))
    .filter((group) => group.layerIds.length)
  const group: LayerGroup = {
    id: uuidv4(),
    name: name ?? nextGroupName(cleanedGroups),
    layerIds: ids,
    visible: true,
  }
  const selected = layersByIds(document, ids)
  const selectedSet = new Set(ids)
  const rest = document.layers.filter((layer) => !selectedSet.has(layer.id))
  const highestSelectedIndex = Math.max(...ids.map((id) => document.layers.findIndex((layer) => layer.id === id)))
  const insertIndex = rest.filter((layer) => layer.zIndex <= highestSelectedIndex).length
  rest.splice(insertIndex, 0, ...selected)
  return touch({
    ...document,
    layers: normalizeZIndex(rest),
    groups: [...cleanedGroups, group],
  })
}

export function ungroupLayerGroup(document: HandoutDocument, groupId: string): HandoutDocument {
  return touch({
    ...document,
    groups: document.groups.filter((group) => group.id !== groupId),
  })
}

export function moveLayerOutOfGroup(document: HandoutDocument, layerId: string): HandoutDocument {
  return touch({
    ...document,
    groups: document.groups
      .map((group) => ({ ...group, layerIds: group.layerIds.filter((id) => id !== layerId) }))
      .filter((group) => group.layerIds.length),
  })
}

export function setLayerGroupVisibility(
  document: HandoutDocument,
  groupId: string,
  visible: boolean,
): HandoutDocument {
  return touch({
    ...document,
    groups: document.groups.map((group) => group.id === groupId ? { ...group, visible } : group),
  })
}

export function addLayerToGroup(
  document: HandoutDocument,
  layerId: string,
  groupId: string,
  targetIndex?: number,
): HandoutDocument {
  if (!document.layers.some((layer) => layer.id === layerId)) return document
  const currentGroup = document.groups.find((group) => group.id === groupId)
  if (!currentGroup) return document
  const groupLayerIndexes = currentGroup.layerIds
    .map((id) => document.layers.findIndex((layer) => layer.id === id))
    .filter((index) => index >= 0)
  const insertionAnchor = groupLayerIndexes.length ? Math.min(...groupLayerIndexes) : document.layers.length
  const cleaned = document.groups.map((group) => ({
    ...group,
    layerIds: group.layerIds.filter((id) => id !== layerId),
  }))
  const nextGroups = cleaned
    .map((group) => {
      if (group.id !== groupId) return group
      const ids = [...group.layerIds]
      const index = Math.max(0, Math.min(targetIndex ?? ids.length, ids.length))
      ids.splice(index, 0, layerId)
      return { ...group, layerIds: ids }
    })
    .filter((group) => group.layerIds.length)
  const nextGroup = nextGroups.find((group) => group.id === groupId)
  if (!nextGroup) return document
  const nextGroupIds = new Set(nextGroup.layerIds)
  const remaining = document.layers.filter((layer) => !nextGroupIds.has(layer.id))
  const adjustedAnchor = remaining.filter((layer) => layer.zIndex < insertionAnchor).length
  const groupLayers = layersByIds(document, nextGroup.layerIds)
  remaining.splice(Math.max(0, Math.min(adjustedAnchor, remaining.length)), 0, ...groupLayers)
  return touch({
    ...document,
    layers: normalizeZIndex(remaining),
    groups: nextGroups,
  })
}
