import type { HandoutDocument } from '../document'
import { touch } from '../document'
import { normalizeZIndex } from './shared'

export function removeLayer(document: HandoutDocument, layerId: string): HandoutDocument {
  return touch({
    ...document,
    layers: normalizeZIndex(document.layers.filter((layer) => layer.id !== layerId)),
    groups: document.groups
      .map((group) => ({
        ...group,
        layerIds: group.layerIds.filter((id) => id !== layerId),
      }))
      .filter((group) => group.layerIds.length),
  })
}
