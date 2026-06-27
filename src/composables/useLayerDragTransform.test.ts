import Konva from 'konva'
import { computed, reactive, ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDefaultHandout, addImageLayer, type HandoutLayer, type ShapeLayer } from '@/lib/handout'
import { layerPositionFromNode } from '@/lib/layer-rendering'
import { useEditorStore } from '@/stores/editor'

import { useLayerDragTransform } from './useLayerDragTransform'

function createDragTransform() {
  return useLayerDragTransform({
    editor: useEditorStore(),
    layerNodeRefs: reactive({}),
    stageScale: computed(() => 1),
    isShapeLayer: (layer: HandoutLayer): layer is ShapeLayer => layer.type === 'shape',
    selectCanvasLayer: () => {},
    autoTextLayerHeight: () => 24,
    refreshLayerEffectCacheAfterUpdate: async () => {},
    logBackgroundRender: () => {},
    logShape: () => {},
    logSnap: () => {},
    curveControlRevision: ref(0),
  })
}

describe('layer drag transform helpers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('applies snapped x positions without jumping flipped layers', () => {
    const document = addImageLayer(createDefaultHandout(), {
      assetId: 'asset-1',
      x: 20,
      y: 30,
      width: 100,
      height: 60,
    })
    const layer = { ...document.layers[0], flipX: true }
    const node = new Konva.Rect({
      x: layer.x + layer.width,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      scaleX: -1,
    })

    createDragTransform().applySnappedNodePosition(layer, node, 'x', 42)

    expect(layerPositionFromNode(layer, node).x).toBe(42)
    expect(node.x()).toBe(142)
  })
})
