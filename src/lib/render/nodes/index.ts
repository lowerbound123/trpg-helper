import type { HandoutLayer } from '@/lib/handout'
import type { LibraryIndex } from '@/lib/backend'

import { isImageLayer, isPaintLayer, isShapeLayer, isTextLayer } from '../types'
import { imageNode } from './image'
import { paintNode } from './paint'
import { shapeNode } from './shape'
import { textNode } from './text'
import { prepareEffectNode } from '../shared'
import type { ImageCache } from '../types'

export async function createLayerNode(layer: HandoutLayer, library: LibraryIndex, cache: ImageCache) {
  if (isImageLayer(layer)) return imageNode(layer, library, cache)
  if (isTextLayer(layer)) return textNode(layer, library, cache)
  if (isShapeLayer(layer)) return prepareEffectNode(shapeNode(layer), layer.effects)
  if (isPaintLayer(layer)) return prepareEffectNode(paintNode(layer), layer.effects)
  return undefined
}
