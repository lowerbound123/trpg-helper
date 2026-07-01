import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { HandoutLayer, LayerMask } from '@/lib/handout'
import { identityMatrix } from '@/lib/mask-geometry'

import { useMaskActions } from './useMaskActions'

vi.mock('@tauri-apps/plugin-dialog', () => ({
  confirm: vi.fn(),
}))

function mask(): LayerMask {
  return {
    id: 'mask-1',
    layerId: 'layer-1',
    enabled: true,
    path: null,
    highResPath: 'masks/mask-1.png',
    width: 100,
    height: 80,
    matrix: identityMatrix(),
    tileSize: 512,
    defaultAlpha: 255,
    tiles: {},
    strokes: [],
    shapes: [],
    operations: [],
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    flipX: false,
    previewScale: 1,
    cache: null,
    sourceVersion: 1,
    version: 1,
    updatedAt: '2026-06-30T00:00:00.000Z',
  }
}

function layer(): HandoutLayer {
  return {
    id: 'layer-1',
    type: 'image',
    name: 'Layer',
    assetId: 'asset-1',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    rotation: 0,
    flipX: false,
    opacity: 1,
    blendMode: 'source-over',
    visible: true,
    locked: false,
    zIndex: 0,
    effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
    mask: mask(),
  } as HandoutLayer
}

function createActions(input: { isDraggingMask: Ref<boolean>; patchLayerMask: ReturnType<typeof vi.fn> }) {
  return useMaskActions({
    editor: {
      maskEditTarget: { kind: 'layer', layerId: 'layer-1' },
      patchLayerMask: input.patchLayerMask,
    } as any,
    maskFeatureEnabled: true,
    selectedMaskControlLayers: computed(() => []),
    selectedMaskControlDeletes: computed(() => false),
    refreshMaskPreviewUrls: vi.fn(),
    maskPreviewUrls: {},
    maskPreviewCacheDataUrls: {},
    layerName: (targetLayer) => targetLayer.name,
    maskEditNodeRef: ref(),
    activeTool: ref('select'),
    maskEditImage: ref(),
    maskEditImageRevision: ref(0),
    maskProxyMaxEdge: () => 1200,
    updateTransformer: vi.fn(),
    draggedMaskLayerId: ref(''),
    isDraggingMask: input.isDraggingMask,
  })
}

describe('useMaskActions', () => {
  it('clears dragging state before patching a dragged mask so targeted refresh is not skipped', () => {
    const isDraggingMask = ref(true)
    const patchLayerMask = vi.fn(() => {
      expect(isDraggingMask.value).toBe(false)
    })
    const actions = createActions({ isDraggingMask, patchLayerMask })

    actions.onMaskEditDragEnd(layer(), {
      target: {
        x: () => 42,
        y: () => 64,
      } as any,
    })

    expect(patchLayerMask).toHaveBeenCalledTimes(1)
    expect(isDraggingMask.value).toBe(false)
  })
})
