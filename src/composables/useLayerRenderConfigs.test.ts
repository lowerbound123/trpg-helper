import { computed, ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useLayerRenderConfigs } from './useLayerRenderConfigs'
import type { LibraryRecord } from '@/lib/backend'
import { useEditorStore } from '@/stores/editor'

function asset(id = 'asset-1'): LibraryRecord {
  const now = '2026-06-30T00:00:00.000Z'
  return {
    id,
    name: 'Asset',
    fileName: 'asset.png',
    path: 'assets/asset.png',
    thumbnailPath: null,
    mediaType: 'image/png',
    tags: [],
    folder: '',
    createdAt: now,
    updatedAt: now,
  }
}

describe('layer render config mask fallback', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('falls back to the raw image branch while a masked image is not ready', () => {
    const editor = useEditorStore()
    const record = asset()
    editor.registerProjectAsset(record)
    editor.addLayerFromAsset(record, { width: 100, height: 80 })
    const layer = editor.selectedLayer!
    editor.addMaskToLayer(layer.id)
    const maskedLayer = editor.document.layers.find((item) => item.id === layer.id)!
    const image = {} as HTMLImageElement

    const configs = useLayerRenderConfigs({
      editor,
      imageElements: { [record.id]: image },
      previewUrl: () => 'asset://preview',
      maskedLayerImages: {},
      maskedLayerRenderRevisions: {},
      maskPreviewUrls: {},
      maskPreviewCacheDataUrls: {},
      maskFeatureEnabled: true,
      activeTool: ref('select'),
      visibleCanvasLayers: computed(() => [maskedLayer]),
    })

    expect(configs.canvasLayerRenderInfo(maskedLayer).branch).toBe('raw-image')
  })

  it('changes masked image config when the render revision changes even if the canvas is stable', () => {
    const editor = useEditorStore()
    const record = asset()
    editor.registerProjectAsset(record)
    editor.addLayerFromAsset(record, { width: 100, height: 80 })
    const layer = editor.selectedLayer!
    editor.addMaskToLayer(layer.id)
    const maskedLayer = editor.document.layers.find((item) => item.id === layer.id)!
    const stableCanvas = { width: 100, height: 80 } as HTMLCanvasElement
    const revisions = { [layer.id]: 1 }

    const configs = useLayerRenderConfigs({
      editor,
      imageElements: { [record.id]: {} as HTMLImageElement },
      previewUrl: () => 'asset://preview',
      maskedLayerImages: { [layer.id]: stableCanvas },
      maskedLayerRenderRevisions: revisions,
      maskPreviewUrls: {},
      maskPreviewCacheDataUrls: {},
      maskFeatureEnabled: true,
      activeTool: ref('select'),
      visibleCanvasLayers: computed(() => [maskedLayer]),
    })

    const before = configs.maskedLayerConfig(maskedLayer)
    revisions[layer.id] += 1
    const after = configs.maskedLayerConfig(maskedLayer)

    expect(before.image).toBe(stableCanvas)
    expect(after.image).toBe(stableCanvas)
    expect(before.maskRenderRevision).toBe(1)
    expect(after.maskRenderRevision).toBe(2)
    expect(before).not.toEqual(after)
  })
})
