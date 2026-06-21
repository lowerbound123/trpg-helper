import { normalizeEffects } from './effects'
import type { HandoutDocument } from './document'
import { applyShapeAndPaintDefaults, nextGroupName, type HandoutLayer } from './layer'
import { normalizeMask } from './mask'

export function normalizeHandoutDocument(document: HandoutDocument): HandoutDocument {
  const canvasForMasks = {
    width: document.canvas.width,
    height: document.canvas.height,
  }
  const normalizedLayers = document.layers.map((layer) => ({
    ...applyShapeAndPaintDefaults(layer),
    flipX: layer.flipX ?? false,
    effects: normalizeEffects(layer.effects),
    mask: normalizeMask(layer.mask, canvasForMasks),
  })) as HandoutLayer[]
  const layerIds = new Set(normalizedLayers.map((layer) => layer.id))
  const claimed = new Set<string>()
  const normalizedGroups = (document.groups ?? []).map((group) => {
    const ids = group.layerIds.filter((id) => {
      if (!layerIds.has(id) || claimed.has(id)) return false
      claimed.add(id)
      return true
    })
    return {
      id: group.id,
      name: group.name || nextGroupName(document.groups ?? []),
      layerIds: ids,
      visible: group.visible ?? true,
    }
  }).filter((group) => group.layerIds.length)
  return {
    ...document,
    canvas: {
      ...document.canvas,
      backgroundVisible: document.canvas.backgroundVisible ?? true,
      backgroundMask: normalizeMask(document.canvas.backgroundMask, canvasForMasks),
      effects: normalizeEffects(document.canvas.effects),
    },
    layers: normalizedLayers,
    groups: normalizedGroups,
    projectAssets: document.projectAssets ?? [],
  }
}
