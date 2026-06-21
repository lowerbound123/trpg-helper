import { nextTick } from 'vue'
import type { Reactive, Ref } from 'vue'
import type Konva from 'konva'

import { hasVisibleEffects } from '@/lib/effects'
import { useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type NodeRef = { getNode: () => Konva.Node }
type LayerNodeRefs = Reactive<Record<string, NodeRef | undefined>>
type StageRef = Ref<{ getNode: () => Konva.Stage } | undefined>
type ViewportLog = (message: string, data?: Record<string, unknown>) => void

export function useLayerEffectCache(options: {
  editor: EditorStore
  layerNodeRefs: LayerNodeRefs
  stageRef: StageRef
  logViewport: ViewportLog
  editorEffectCacheMaxEdge: number
}) {
  const { editor, layerNodeRefs, stageRef, logViewport, editorEffectCacheMaxEdge } = options

  let effectCacheRaf: number | undefined
  const pendingEffectCacheLayerIds = new Set<string>()

  function refreshLayerEffectCache(layerId: string, options?: { recache?: boolean }) {
    const layer = editor.document.layers.find((item) => item.id === layerId)
    const node = layerNodeRefs[layerId]?.getNode()
    if (!layer || !node) return
    if (hasVisibleEffects(layer.effects)) {
      if (options?.recache || !node.isCached()) {
        const maxEdge = Math.max(1, layer.width, layer.height)
        const pixelRatio = Math.max(0.1, Math.min(1, editorEffectCacheMaxEdge / maxEdge))
        node.clearCache()
        node.cache({ pixelRatio })
        logViewport('effect-cache-recache', {
          layerId,
          layerType: layer.type,
          size: { width: layer.width, height: layer.height },
          pixelRatio,
        })
      }
    } else if (node.isCached()) {
      node.clearCache()
    }
    node.getLayer()?.batchDraw()
  }

  async function refreshLayerEffectCacheAfterUpdate(layerId: string) {
    await nextTick()
    refreshLayerEffectCache(layerId, { recache: true })
  }

  function scheduleLayerEffectCacheRefresh(layerIds: string[], options?: { recache?: boolean }) {
    for (const layerId of layerIds) pendingEffectCacheLayerIds.add(layerId)
    if (effectCacheRaf) return
    effectCacheRaf = window.requestAnimationFrame(async () => {
      effectCacheRaf = undefined
      const ids = Array.from(pendingEffectCacheLayerIds)
      pendingEffectCacheLayerIds.clear()
      await nextTick()
      const startedAt = performance.now()
      for (const layerId of ids) refreshLayerEffectCache(layerId, options)
      stageRef.value?.getNode().batchDraw()
      if (ids.length) {
        logViewport('effect-cache-refresh', {
          layerIds: ids,
          recache: Boolean(options?.recache),
          durationMs: Math.round(performance.now() - startedAt),
        })
      }
    })
  }

  function changedEffectLayerIds(nextSignature: string, previousSignature?: string) {
    if (!previousSignature) return editor.document.layers.map((layer) => layer.id)
    const previous = new Map(previousSignature.split('|').map((item) => {
      const [id, ...rest] = item.split(':')
      return [id, rest.join(':')]
    }))
    return nextSignature
      .split('|')
      .map((item) => {
        const [id, ...rest] = item.split(':')
        return previous.get(id) === rest.join(':') ? undefined : id
      })
      .filter((id): id is string => Boolean(id))
  }

  return {
    refreshLayerEffectCache,
    refreshLayerEffectCacheAfterUpdate,
    scheduleLayerEffectCacheRefresh,
    changedEffectLayerIds,
    cancelEffectCacheRefresh: () => {
      if (effectCacheRaf) window.cancelAnimationFrame(effectCacheRaf)
    },
  }
}
