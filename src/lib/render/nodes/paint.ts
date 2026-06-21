import Konva from 'konva'

import { paintSceneFunc } from '@/lib/paint-rendering'
import type { PaintLayer } from '@/lib/handout'

import { commonConfig } from '../shared'

export function paintNode(layer: PaintLayer) {
  return new Konva.Shape({
    ...commonConfig(layer),
    sceneFunc: paintSceneFunc(layer),
  })
}
