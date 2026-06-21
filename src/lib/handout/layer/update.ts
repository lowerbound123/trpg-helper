import type { HandoutDocument } from '../document'
import { touch } from '../document'
import type { HandoutLayer, LayerPatch } from './types'

export function updateLayer(
  document: HandoutDocument,
  layerId: string,
  patch: LayerPatch,
): HandoutDocument {
  return touch({
    ...document,
    layers: document.layers.map((layer) => {
      if (layer.id !== layerId) return layer
      return { ...layer, ...patch } as HandoutLayer
    }),
  })
}
