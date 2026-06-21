import { ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'

import { appConfiguration } from '@/lib/configuration'
import { appendDebugLog } from '@/lib/backend'
import type { HandoutDocument } from '@/lib/handout'
import { downsampleDataUrl, loadImageFromDataUrl } from '@/lib/mask'
import { renderHandoutPreviewToDataUrl, renderMaskedLayerImage } from '@/lib/render'
import { useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type ImageCache = Record<string, HTMLImageElement>
type MaskedImageMap = Record<string, HTMLCanvasElement | undefined>
type MaskPreviewUrlMap = Record<string, string | undefined>
type RenderStateLog = (message: string, data?: Record<string, unknown>) => void

export function useMaskComposition(options: {
  editor: EditorStore
  imageElements: ImageCache
  maskFeatureEnabled: boolean
  isDraggingMask: Ref<boolean>
  stageScale: ComputedRef<number>
  editorMaskPreviewMaxEdge: number
  maskProxyMaxEdge: () => number
  loadMaskPreviewCacheDataUrl: (mask: import('@/lib/handout').LayerMask) => Promise<string | undefined>
  activeMaskEditLayer: ComputedRef<import('@/lib/handout').HandoutLayer | undefined>
  logCanvasLayerRenderState: RenderStateLog
  maskedLayerImages: MaskedImageMap
  maskPreviewUrls: MaskPreviewUrlMap
  maskEditImage: Ref<HTMLImageElement | undefined>
}) {
  const {
    editor,
    imageElements,
    maskFeatureEnabled,
    isDraggingMask,
    stageScale,
    editorMaskPreviewMaxEdge,
    maskProxyMaxEdge,
    loadMaskPreviewCacheDataUrl,
    activeMaskEditLayer,
    logCanvasLayerRenderState,
    maskedLayerImages,
    maskPreviewUrls,
    maskEditImage,
  } = options

  const maskedBackgroundImage = ref<HTMLImageElement | undefined>(undefined)

  let maskedLayerRefreshRunId = 0
  let maskedBackgroundRefreshRunId = 0
  let maskEditImageRefreshRunId = 0
  let maskCompositeRefreshTimer: number | undefined

  async function refreshMaskedLayerImages() {
    if (!maskFeatureEnabled) return
    if (editor.view !== 'editor') return
    if (isDraggingMask.value) {
      void appendDebugLog('mask', 'refresh-masked-layer-images-skipped-dragging')
      return
    }
    const runId = ++maskedLayerRefreshRunId
    const startedAt = performance.now()
    const maskedLayers = editor.document.layers.filter((layer) => layer.mask?.enabled)
    const proxyMaxEdge = maskProxyMaxEdge()
    void appendDebugLog('mask', 'refresh-masked-layer-images-start', {
      runId,
      count: maskedLayers.length,
      stageScale: stageScale.value,
      proxyMaxEdge,
      previewMaxEdge: editorMaskPreviewMaxEdge,
      canvas: { width: editor.document.canvas.width, height: editor.document.canvas.height },
    })
    logCanvasLayerRenderState('editor-layer-render-state-before-mask-refresh', {
      runId,
      maskedLayerIds: maskedLayers.map((layer) => layer.id),
      proxyMaxEdge,
    })
    const maskedIds = new Set(maskedLayers.map((layer) => layer.id))
    const nextImages: MaskedImageMap = {}
    for (const layer of maskedLayers) {
      const layerStartedAt = performance.now()
      const maskDataUrls = { ...editor.maskDataUrls }
      if (layer.mask) {
        const inMemoryMask = editor.maskDataUrls[layer.mask.id]
        const current = inMemoryMask || await loadMaskPreviewCacheDataUrl(layer.mask)
        if (runId !== maskedLayerRefreshRunId || isDraggingMask.value) {
          void appendDebugLog('mask', 'refresh-masked-layer-images-discarded-stale', { runId, layerId: layer.id })
          return
        }
        if (!current) {
          nextImages[layer.id] = maskedLayerImages[layer.id]
          void appendDebugLog('mask', 'refresh-layer-mask-waiting-for-cache', {
            runId,
            layerId: layer.id,
            maskId: layer.mask.id,
            sourceVersion: layer.mask.sourceVersion,
          })
          continue
        }
        void appendDebugLog('mask', 'refresh-layer-mask-loaded', {
          runId,
          layerId: layer.id,
          maskId: layer.mask.id,
          source: inMemoryMask ? 'memory' : 'cache',
          dataUrlLength: current.length,
          durationMs: Math.round(performance.now() - layerStartedAt),
        })
        maskDataUrls[layer.mask.id] = proxyMaxEdge < editorMaskPreviewMaxEdge
          ? await downsampleDataUrl(current, proxyMaxEdge)
          : current
        if (runId !== maskedLayerRefreshRunId || isDraggingMask.value) {
          void appendDebugLog('mask', 'refresh-masked-layer-images-discarded-stale', { runId, layerId: layer.id })
          return
        }
        void appendDebugLog('mask', 'refresh-layer-mask-downsampled', {
          runId,
          layerId: layer.id,
          maskId: layer.mask.id,
          proxyMaxEdge,
          dataUrlLength: maskDataUrls[layer.mask.id]?.length || 0,
          durationMs: Math.round(performance.now() - layerStartedAt),
        })
      }
      if (!nextImages[layer.id]) {
        nextImages[layer.id] = await renderMaskedLayerImage(layer, editor.library, imageElements, {
          projectTarget: {
            projectId: editor.currentProjectId,
            projectDir: editor.projectDir || undefined,
          },
          masksEnabled: maskFeatureEnabled,
          maskDataUrls,
          maxMaskEdge: proxyMaxEdge,
          maxCompositeEdge: proxyMaxEdge,
          usePixiMaskPreview: appConfiguration.mask.usePixiPreview,
        })
      }
      if (runId !== maskedLayerRefreshRunId || isDraggingMask.value) {
        void appendDebugLog('mask', 'refresh-masked-layer-images-discarded-stale', { runId, layerId: layer.id })
        return
      }
      void appendDebugLog('mask', 'refresh-layer-mask-rendered', {
        runId,
        layerId: layer.id,
        maskId: layer.mask?.id,
        producedImage: nextImages[layer.id]
          ? { width: nextImages[layer.id]?.width, height: nextImages[layer.id]?.height }
          : null,
        durationMs: Math.round(performance.now() - layerStartedAt),
      })
    }
    if (runId !== maskedLayerRefreshRunId || isDraggingMask.value) {
      void appendDebugLog('mask', 'refresh-masked-layer-images-discarded-stale', { runId })
      return
    }
    for (const id of Object.keys(maskedLayerImages)) {
      if (!maskedIds.has(id)) delete maskedLayerImages[id]
    }
    for (const [id, image] of Object.entries(nextImages)) {
      maskedLayerImages[id] = image
    }
    void appendDebugLog('mask', 'refresh-masked-layer-images-complete', {
      runId,
      count: maskedLayers.length,
      durationMs: Math.round(performance.now() - startedAt),
    })
    logCanvasLayerRenderState('editor-layer-render-state-after-mask-refresh', {
      runId,
      maskedLayerIds: maskedLayers.map((layer) => layer.id),
      maskedImageIds: Object.keys(maskedLayerImages),
      durationMs: Math.round(performance.now() - startedAt),
    })
  }

  async function refreshMaskPreviewUrls() {
    if (!maskFeatureEnabled) return
    if (isDraggingMask.value) {
      void appendDebugLog('mask', 'refresh-mask-preview-urls-skipped-dragging')
      return
    }
    const startedAt = performance.now()
    const masks = editor.document.layers.map((layer) => layer.mask).filter(Boolean)
    void appendDebugLog('mask', 'refresh-mask-preview-urls-start', { count: masks.length })
    const maskIds = new Set(masks.map((mask) => mask!.id))
    for (const id of Object.keys(maskPreviewUrls)) {
      if (!maskIds.has(id)) delete maskPreviewUrls[id]
    }
    await Promise.all(masks.map(async (mask) => {
      if (!mask) return
      const maskStartedAt = performance.now()
      const inMemoryMask = editor.maskDataUrls[mask.id]
      const dataUrl = inMemoryMask || await loadMaskPreviewCacheDataUrl(mask)
      if (!dataUrl) {
        delete maskPreviewUrls[mask.id]
        void appendDebugLog('mask', 'refresh-mask-preview-url-waiting-for-cache', {
          maskId: mask.id,
          sourceVersion: mask.sourceVersion,
        })
        return
      }
      maskPreviewUrls[mask.id] = await downsampleDataUrl(dataUrl, 96)
      void appendDebugLog('mask', 'refresh-mask-preview-url-complete', {
        maskId: mask.id,
        source: inMemoryMask ? 'memory' : 'cache',
        sourceLength: dataUrl.length,
        previewLength: maskPreviewUrls[mask.id]?.length || 0,
        durationMs: Math.round(performance.now() - maskStartedAt),
      })
    }))
    void appendDebugLog('mask', 'refresh-mask-preview-urls-complete', {
      count: masks.length,
      durationMs: Math.round(performance.now() - startedAt),
    })
  }

  async function refreshMaskEditImage() {
    if (!maskFeatureEnabled) return
    if (isDraggingMask.value) {
      void appendDebugLog('mask', 'refresh-mask-edit-image-skipped-dragging')
      return
    }
    const runId = ++maskEditImageRefreshRunId
    const startedAt = performance.now()
    const layer = activeMaskEditLayer.value
    if (!layer?.mask) {
      maskEditImage.value = undefined
      return
    }
    const proxyMaxEdge = maskProxyMaxEdge()
    void appendDebugLog('mask', 'refresh-mask-edit-image-start', {
      runId,
      layerId: layer.id,
      maskId: layer.mask.id,
      proxyMaxEdge,
      previewMaxEdge: editorMaskPreviewMaxEdge,
    })
    const inMemoryMask = editor.maskDataUrls[layer.mask.id]
    const dataUrl = inMemoryMask || await loadMaskPreviewCacheDataUrl(layer.mask)
    if (!dataUrl) {
      maskEditImage.value = undefined
      void appendDebugLog('mask', 'refresh-mask-edit-image-waiting-for-cache', {
        runId,
        layerId: layer.id,
        maskId: layer.mask.id,
        sourceVersion: layer.mask.sourceVersion,
      })
      return
    }
    const image = await loadImageFromDataUrl(await downsampleDataUrl(dataUrl, proxyMaxEdge))
    if (runId !== maskEditImageRefreshRunId || isDraggingMask.value) {
      void appendDebugLog('mask', 'refresh-mask-edit-image-discarded-stale', { runId, layerId: layer.id, maskId: layer.mask.id })
      return
    }
    maskEditImage.value = image
    void appendDebugLog('mask', 'refresh-mask-edit-image-complete', {
      runId,
      layerId: layer.id,
      maskId: layer.mask.id,
      source: inMemoryMask ? 'memory' : 'cache',
      sourceLength: dataUrl.length,
      durationMs: Math.round(performance.now() - startedAt),
    })
  }

  async function refreshMaskedBackgroundImage() {
    if (!maskFeatureEnabled) return
    if (editor.view !== 'editor') return
    if (isDraggingMask.value) {
      void appendDebugLog('mask', 'refresh-masked-background-skipped-dragging')
      return
    }
    const runId = ++maskedBackgroundRefreshRunId
    if (!editor.document.canvas.backgroundMask?.enabled) {
      maskedBackgroundImage.value = undefined
      return
    }
    const proxyMaxEdge = maskProxyMaxEdge()
    void appendDebugLog('mask', 'refresh-masked-background-start', {
      runId,
      proxyMaxEdge,
      previewMaxEdge: editorMaskPreviewMaxEdge,
      canvas: { width: editor.document.canvas.width, height: editor.document.canvas.height },
    })
    const backgroundDocument: HandoutDocument = {
      ...editor.document,
      layers: [],
      groups: [],
    }
    const backgroundMask = editor.document.canvas.backgroundMask
    const backgroundMaskPreview = backgroundMask ? await loadMaskPreviewCacheDataUrl(backgroundMask) : undefined
    if (backgroundMask && !backgroundMaskPreview) {
      maskedBackgroundImage.value = undefined
      void appendDebugLog('mask', 'refresh-masked-background-waiting-for-cache', {
        runId,
        maskId: backgroundMask.id,
        sourceVersion: backgroundMask.sourceVersion,
      })
      return
    }
    const dataUrl = await renderHandoutPreviewToDataUrl(backgroundDocument, editor.library, imageElements, {
      projectTarget: {
        projectId: editor.currentProjectId,
        projectDir: editor.projectDir || undefined,
      },
      maskDataUrls: editor.document.canvas.backgroundMask
        ? {
            ...editor.maskDataUrls,
            [editor.document.canvas.backgroundMask.id]: proxyMaxEdge < editorMaskPreviewMaxEdge
              ? await downsampleDataUrl(backgroundMaskPreview || '', proxyMaxEdge)
              : backgroundMaskPreview || '',
          }
        : editor.maskDataUrls,
      masksEnabled: maskFeatureEnabled,
      maxMaskEdge: proxyMaxEdge,
      maxCompositeEdge: proxyMaxEdge,
      usePixiMaskPreview: appConfiguration.mask.usePixiPreview,
    })
    const image = await loadImageFromDataUrl(dataUrl)
    if (runId !== maskedBackgroundRefreshRunId || isDraggingMask.value) {
      void appendDebugLog('mask', 'refresh-masked-background-discarded-stale', { runId })
      return
    }
    maskedBackgroundImage.value = image
    void appendDebugLog('mask', 'refresh-masked-background-complete', {
      runId,
      dataUrlLength: dataUrl.length,
    })
  }

  function scheduleMaskCompositeRefresh(reason: string) {
    if (!maskFeatureEnabled) return
    if (maskCompositeRefreshTimer) window.clearTimeout(maskCompositeRefreshTimer)
    void appendDebugLog('mask', 'schedule-mask-composite-refresh', {
      reason,
      isDraggingMask: isDraggingMask.value,
    })
    logCanvasLayerRenderState('editor-layer-render-state-scheduled', { reason })
    maskCompositeRefreshTimer = window.setTimeout(() => {
      maskCompositeRefreshTimer = undefined
      if (isDraggingMask.value) {
        void appendDebugLog('mask', 'schedule-mask-composite-refresh-skipped-dragging', { reason })
        return
      }
      void refreshMaskedLayerImages()
      void refreshMaskedBackgroundImage()
    }, 180)
  }

  function cancelMaskCompositeRefresh() {
    if (maskCompositeRefreshTimer) window.clearTimeout(maskCompositeRefreshTimer)
  }

  return {
    maskedBackgroundImage,
    refreshMaskedLayerImages,
    refreshMaskPreviewUrls,
    refreshMaskEditImage,
    refreshMaskedBackgroundImage,
    scheduleMaskCompositeRefresh,
    cancelMaskCompositeRefresh,
  }
}
