import Konva from 'konva'
import { computed, reactive, ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDefaultHandout, addImageLayer, type HandoutLayer, type ShapeLayer } from '@/lib/handout'
import { layerPositionFromNode } from '@/lib/layer-rendering'
import { useEditorStore } from '@/stores/editor'

import { normalizeRotationDegrees, useLayerDragTransform } from './useLayerDragTransform'

function createDragTransform() {
  const editor = useEditorStore()
  const layerNodeRefs = reactive<Record<string, { getNode: () => Konva.Node } | undefined>>({})
  return {
    editor,
    layerNodeRefs,
    ...useLayerDragTransform({
      editor,
      layerNodeRefs,
      stageScale: computed(() => 1),
      isShapeLayer: (layer: HandoutLayer): layer is ShapeLayer => layer.type === 'shape',
      selectCanvasLayer: () => {},
      autoTextLayerHeight: () => 24,
      refreshLayerEffectCacheAfterUpdate: async () => {},
      logBackgroundRender: () => {},
      logShape: () => {},
      logSnap: () => {},
      curveControlRevision: ref(0),
    }),
  }
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

  it('normalizes flipped transform rotations into the 0..359 model range', () => {
    expect(normalizeRotationDegrees(45)).toBe(45)
    expect(normalizeRotationDegrees(-45)).toBe(315)
    expect(normalizeRotationDegrees(-16)).toBe(344)
    expect(normalizeRotationDegrees(-0)).toBe(0)
    expect(normalizeRotationDegrees(390)).toBe(30)
  })

  it('persists resized arbitrary polygon points when transformer scale is reset', () => {
    const transform = createDragTransform()
    transform.editor.addPolygon({
      shape: 'polygon',
      x: 20,
      y: 30,
      width: 80,
      height: 60,
      polygonPoints: [
        { x: 0, y: 0 },
        { x: 80, y: 10 },
        { x: 40, y: 60 },
      ],
    })
    const layer = transform.editor.selectedLayer as ShapeLayer
    const node = new Konva.Line({
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      points: [0, 0, 80, 10, 40, 60],
      closed: true,
      scaleX: 2,
      scaleY: 0.5,
    })
    transform.layerNodeRefs[layer.id] = { getNode: () => node }

    transform.onTransformEnd(layer)

    const updated = transform.editor.document.layers.find((item) => item.id === layer.id) as ShapeLayer
    expect(updated.width).toBe(160)
    expect(updated.height).toBe(30)
    expect(updated.polygonPoints).toEqual([
      { x: 0, y: 0 },
      { x: 160, y: 5 },
      { x: 80, y: 30 },
    ])
    expect(node.scaleX()).toBe(1)
    expect(node.scaleY()).toBe(1)
  })
})
