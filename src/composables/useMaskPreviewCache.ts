import { shallowReactive } from 'vue'
import type { ComputedRef } from 'vue'

import { appendDebugLog, readProjectFileDataUrl } from '@/lib/backend'
import type { LayerMask } from '@/lib/handout'
import { downsampleDataUrl } from '@/lib/mask'
import { useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>

export type MaskPreviewCacheRefresh = {
  refreshMaskPreviewUrls: () => void
  scheduleMaskCompositeRefresh: (reason: string) => void
}

export function useMaskPreviewCache(options: {
  editor: EditorStore
  stageScale: ComputedRef<number>
  maskFeatureEnabled: boolean
  editorMaskPreviewMaxEdge: number
  refresh: MaskPreviewCacheRefresh
}) {
  const { editor, stageScale, maskFeatureEnabled, editorMaskPreviewMaxEdge, refresh } = options

  const maskPreviewCacheDataUrls = shallowReactive<Record<string, string | undefined>>({})
  let maskPreviewCacheRunning = false
  const pendingMaskPreviewCacheIds = new Set<string>()
  const maskPreviewCacheQueue: LayerMask[] = []

  function maskProxyMaxEdge() {
    const largest = Math.max(editor.document.canvas.width, editor.document.canvas.height)
    const zoomAwareEdge = Math.max(256, Math.ceil(largest * Math.max(stageScale.value, 0.05) * 1.5))
    return Math.min(largest, editorMaskPreviewMaxEdge, zoomAwareEdge)
  }

  function maskProjectTarget() {
    return {
      projectId: editor.currentProjectId,
      projectDir: editor.projectDir || undefined,
    }
  }

  function maskPreviewCacheIsValid(mask: LayerMask) {
    return Boolean(
      mask.cache?.preview1200Path
      && mask.cache.sourceVersion === mask.sourceVersion
      && mask.cache.previewVersion === 1
      && mask.cache.maxEdge === editorMaskPreviewMaxEdge,
    )
  }

  function currentMaskById(maskId: string) {
    if (editor.document.canvas.backgroundMask?.id === maskId) return editor.document.canvas.backgroundMask
    return editor.document.layers.find((layer) => layer.mask?.id === maskId)?.mask
  }

  function requestIdleTask(task: () => void) {
    const win = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number }
    if (win.requestIdleCallback) {
      win.requestIdleCallback(task, { timeout: 1500 })
      return
    }
    window.setTimeout(task, 250)
  }

  function waitForIdleTask() {
    return new Promise<void>((resolve) => requestIdleTask(resolve))
  }

  function scheduleMaskPreviewCache(mask: LayerMask) {
    if (!maskFeatureEnabled) return
    if (!editor.currentProjectId && !editor.projectDir) return
    if (maskPreviewCacheIsValid(mask)) return
    if (pendingMaskPreviewCacheIds.has(mask.id)) {
      const queuedIndex = maskPreviewCacheQueue.findIndex((item) => item.id === mask.id)
      if (queuedIndex >= 0) maskPreviewCacheQueue[queuedIndex] = { ...mask }
      else maskPreviewCacheQueue.push({ ...mask })
      void appendDebugLog('mask', 'mask-preview-cache-rescheduled', {
        maskId: mask.id,
        sourceVersion: mask.sourceVersion,
        maxEdge: editorMaskPreviewMaxEdge,
      })
      return
    }
    pendingMaskPreviewCacheIds.add(mask.id)
    maskPreviewCacheQueue.push({ ...mask })
    void appendDebugLog('mask', 'mask-preview-cache-scheduled', {
      maskId: mask.id,
      sourceVersion: mask.sourceVersion,
      maxEdge: editorMaskPreviewMaxEdge,
    })
    runNextMaskPreviewCacheTask()
  }

  function runNextMaskPreviewCacheTask() {
    if (maskPreviewCacheRunning) return
    const nextMask = maskPreviewCacheQueue.shift()
    if (!nextMask) return
    maskPreviewCacheRunning = true
    requestIdleTask(() => {
      void generateMaskPreviewCache(nextMask)
        .finally(() => {
          if (!maskPreviewCacheQueue.some((item) => item.id === nextMask.id)) {
            pendingMaskPreviewCacheIds.delete(nextMask.id)
          }
          maskPreviewCacheRunning = false
          runNextMaskPreviewCacheTask()
        })
    })
  }

  async function generateMaskPreviewCache(mask: LayerMask) {
    const currentBefore = currentMaskById(mask.id)
    if (!currentBefore || currentBefore.sourceVersion !== mask.sourceVersion) {
      void appendDebugLog('mask', 'mask-preview-cache-skip-stale-before', {
        maskId: mask.id,
        queuedVersion: mask.sourceVersion,
        currentVersion: currentBefore?.sourceVersion,
      })
      return
    }
    try {
      const startedAt = performance.now()
      const source = await editor.loadMaskDataUrl(mask)
      const currentAfterLoad = currentMaskById(mask.id)
      if (!currentAfterLoad || currentAfterLoad.sourceVersion !== mask.sourceVersion) {
        void appendDebugLog('mask', 'mask-preview-cache-skip-stale-after-load', {
          maskId: mask.id,
          queuedVersion: mask.sourceVersion,
          currentVersion: currentAfterLoad?.sourceVersion,
        })
        return
      }
      const preview = await downsampleDataUrl(source, editorMaskPreviewMaxEdge)
      const currentAfterPreview = currentMaskById(mask.id)
      if (!currentAfterPreview || currentAfterPreview.sourceVersion !== mask.sourceVersion) {
        void appendDebugLog('mask', 'mask-preview-cache-skip-stale-after-preview', {
          maskId: mask.id,
          queuedVersion: mask.sourceVersion,
          currentVersion: currentAfterPreview?.sourceVersion,
        })
        return
      }
      const cache = await editor.saveMaskCache(currentAfterPreview, preview, editorMaskPreviewMaxEdge)
      if (!cache) return
      maskPreviewCacheDataUrls[mask.id] = preview
      await editor.saveProjectDocumentSnapshot()
      void appendDebugLog('mask', 'mask-preview-cache-saved', {
        maskId: mask.id,
        path: cache.preview1200Path,
        sourceVersion: cache.sourceVersion,
        maxEdge: cache.maxEdge,
        durationMs: Math.round(performance.now() - startedAt),
      })
      void refresh.refreshMaskPreviewUrls()
      refresh.scheduleMaskCompositeRefresh('mask-preview-cache-saved')
    } catch (error) {
      void appendDebugLog('mask', 'mask-preview-cache-failed', {
        maskId: mask.id,
        sourceVersion: mask.sourceVersion,
        error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      })
    }
  }

  async function loadMaskPreviewCacheDataUrl(mask: LayerMask) {
    if (!maskFeatureEnabled) return undefined
    const existing = maskPreviewCacheDataUrls[mask.id]
    if (existing && maskPreviewCacheIsValid(mask)) return existing
    if (maskPreviewCacheIsValid(mask) && mask.cache?.preview1200Path) {
      try {
        const dataUrl = await readProjectFileDataUrl(maskProjectTarget(), mask.cache.preview1200Path, 'image/png')
        maskPreviewCacheDataUrls[mask.id] = dataUrl
        void appendDebugLog('mask', 'mask-preview-cache-hit', {
          maskId: mask.id,
          path: mask.cache.preview1200Path,
          sourceVersion: mask.sourceVersion,
        })
        return dataUrl
      } catch (error) {
        void appendDebugLog('mask', 'mask-preview-cache-read-failed', {
          maskId: mask.id,
          path: mask.cache.preview1200Path,
          error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
        })
      }
    }
    delete maskPreviewCacheDataUrls[mask.id]
    scheduleMaskPreviewCache(mask)
    return undefined
  }

  return {
    maskPreviewCacheDataUrls,
    maskProxyMaxEdge,
    maskProjectTarget,
    maskPreviewCacheIsValid,
    currentMaskById,
    requestIdleTask,
    waitForIdleTask,
    scheduleMaskPreviewCache,
    loadMaskPreviewCacheDataUrl,
  }
}
