import type { HandoutDocument } from '../document'
import type { HandoutLayer, LayerGroup } from './types'

export const normalizeZIndex = (layers: HandoutLayer[]): HandoutLayer[] =>
  layers.map((layer, index) => ({ ...layer, zIndex: index }))

export function nextLayerName(layers: HandoutLayer[], base: string) {
  const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:-(\\d+))?$`)
  const max = layers.reduce((value, layer) => {
    const match = layer.name.match(pattern)
    if (!match) return value
    return Math.max(value, match[1] ? Number(match[1]) : 0)
  }, 0)
  return `${base}-${max + 1}`
}

export function nextGroupName(groups: LayerGroup[]) {
  const pattern = /^group(?:-(\d+))?$/
  const max = groups.reduce((value, group) => {
    const match = group.name.match(pattern)
    if (!match) return value
    return Math.max(value, match[1] ? Number(match[1]) : 0)
  }, 0)
  return `group-${max + 1}`
}

export function layersByIds(document: HandoutDocument, ids: string[]) {
  const byId = new Map(document.layers.map((layer) => [layer.id, layer]))
  return ids
    .map((id) => byId.get(id))
    .filter((layer): layer is HandoutLayer => Boolean(layer))
}

export function layerIdsInZOrder(document: HandoutDocument, ids: string[]) {
  const requested = new Set(ids)
  return [...document.layers]
    .filter((layer) => requested.has(layer.id))
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((layer) => layer.id)
}

export function groupForLayer(document: HandoutDocument, layerId: string): LayerGroup | undefined {
  return document.groups.find((group) => group.layerIds.includes(layerId))
}

export function isLayerEffectivelyVisible(document: HandoutDocument, layer: HandoutLayer) {
  const group = groupForLayer(document, layer.id)
  return layer.visible && (group?.visible ?? true)
}
