import Konva from 'konva'

import type { ImageLayer } from '@/lib/handout'
import type { LibraryIndex } from '@/lib/backend'

import { loadImage, resolveImageRecord } from '../image-loading'
import { commonConfig, prepareEffectNode } from '../shared'
import type { ImageCache } from '../types'

export async function imageNode(layer: ImageLayer, library: LibraryIndex, cache: ImageCache) {
  const record = resolveImageRecord(library, layer.assetId)
  if (!record) return undefined
  return prepareEffectNode(new Konva.Image({
    ...commonConfig(layer),
    image: await loadImage(record, cache),
  }), layer.effects)
}
