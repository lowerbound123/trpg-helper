import { ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'

import { appConfiguration } from '@/lib/configuration'
import { appendDebugLog } from '@/lib/backend'
import type { HandoutDocument } from '@/lib/handout'
import { downsampleDataUrl, loadImageFromDataUrl } from '@/lib/mask'
import { editorMaskGpuRuntime } from '@/lib/mask-runtime'
import { renderHandoutPreviewToDataUrl, renderMaskedLayerImage } from '@/lib/render'
import { appendSpeedLog } from '@/lib/speed-log'
import { useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type ImageCache = Record<string, HTMLImageElement>
type MaskedImageMap = Record<string, HTMLCanvasElement | undefined>
type MaskPreviewUrlMap = Record<string, string | undefined>
type RenderStateLog = (message: string, data?: Record<string, unknown>) => void
type MaskRefreshInput = {
  layerIds?: Iterable<string>
  maskIds?: Iterable<string>
  reason?: string
  queuedAt?: number
}
type MaskCompositeScheduleOptions = MaskRefreshInput & {
  immediate?: boolean
}
type MaskCompositeTimer = {
  id: number
  kind: 'timeout' | 'raf'
}
export type MaskCompositeIdentity = {
  layerId: string
  maskId: string
  key: string
}

export function useMaskComposition(options: {
  editor: EditorStore
  imageElements: ImageCache
  maskFeatureEnabled: boolean
  isDraggingMask: Ref<boolean>
  stageScale: ComputedRef<number>
  editorMaskPreviewMaxEdge: number
  maskProxyMaxEdge: () => number
  activeMaskEditLayer: ComputedRef<import('@/lib/handout').HandoutLayer | undefined>
  logCanvasLayerRenderState: RenderStateLog
  maskedLayerImages: MaskedImageMap
  maskedLayerRenderRevisions: Record<string, number | undefined>
  requestMaskedLayerDraw: (layerId: string) => void
  maskPreviewUrls: MaskPreviewUrlMap
  maskEditImage: Ref<CanvasImageSource | undefined>
  maskEditImageRevision: Ref<number>
}) {
  const {
    editor,
    imageElements,
    maskFeatureEnabled,
    isDraggingMask,
    stageScale,
    editorMaskPreviewMaxEdge,
    maskProxyMaxEdge,
    activeMaskEditLayer,
    logCanvasLayerRenderState,
    maskedLayerImages,
    maskedLayerRenderRevisions,
    requestMaskedLayerDraw,
    maskPreviewUrls,
    maskEditImage,
    maskEditImageRevision,
  } = options

  const maskedBackgroundImage = ref<HTMLImageElement | undefined>(undefined)

  let maskedLayerRefreshSequence = 0
  let maskedBackgroundRefreshRunId = 0
  let maskEditImageRefreshRunId = 0
  let nextLayerCompositeToken = 0
  let nextMaskPreviewToken = 0
  const layerCompositeTokens = new Map<string, number>()
  const maskCompositeRefreshTimers = new Map<string, MaskCompositeTimer>()
  const maskPreviewTokens = new Map<string, number>()

  function targetSet(values?: Iterable<string>) {
    return values ? new Set(values) : undefined
  }

  function targetMatches(layer: import('@/lib/handout').HandoutLayer, layerIds?: Set<string>, maskIds?: Set<string>) {
    if (layerIds?.has(layer.id)) return true
    if (layer.mask && maskIds?.has(layer.mask.id)) return true
    return !layerIds && !maskIds
  }

  function maskCompositeIdentity(layer: import('@/lib/handout').HandoutLayer): MaskCompositeIdentity | undefined {
    const mask = layer.mask
    if (!mask?.enabled) return undefined
    const tileKey = Object.keys(mask.tiles)
      .sort()
      .map((key) => {
        const tile = mask.tiles[key]
        return `${key}:${tile.version}:${tile.updatedAt}`
      })
      .join(',')
    return {
      layerId: layer.id,
      maskId: mask.id,
      key: [
        mask.id,
        mask.version,
        mask.sourceVersion,
        mask.updatedAt,
        mask.width,
        mask.height,
        mask.defaultAlpha,
        mask.matrix.join(','),
        tileKey,
      ].join('|'),
    }
  }

  function currentMaskCompositeIdentity(layerId: string) {
    const currentLayer = editor.document.layers.find((item) => item.id === layerId)
    return currentLayer ? maskCompositeIdentity(currentLayer) : undefined
  }

  function maskCompositeIdentityMatches(expected?: MaskCompositeIdentity, current?: MaskCompositeIdentity) {
    return Boolean(
      expected
      && current
      && expected.layerId === current.layerId
      && expected.maskId === current.maskId
      && expected.key === current.key,
    )
  }

  function maskPreviewIdentity(mask: import('@/lib/handout').LayerMask) {
    const tileKey = Object.keys(mask.tiles)
      .sort()
      .map((key) => {
        const tile = mask.tiles[key]
        return `${key}:${tile.version}:${tile.updatedAt}`
      })
      .join(',')
    return [
      mask.id,
      mask.version,
      mask.sourceVersion,
      mask.updatedAt,
      mask.defaultAlpha,
      mask.width,
      mask.height,
      mask.matrix.join(','),
      tileKey,
    ].join('|')
  }

  function currentMaskById(maskId: string) {
    if (editor.document.canvas.backgroundMask?.id === maskId) return editor.document.canvas.backgroundMask
    return editor.document.layers.find((layer) => layer.mask?.id === maskId)?.mask
  }

  function beginMaskPreview(maskId: string) {
    const token = ++nextMaskPreviewToken
    maskPreviewTokens.set(maskId, token)
    return token
  }

  function maskPreviewIsCurrent(maskId: string, token: number, expectedIdentity: string) {
    const current = currentMaskById(maskId)
    return Boolean(
      current
      && maskPreviewTokens.get(maskId) === token
      && maskPreviewIdentity(current) === expectedIdentity,
    )
  }

  function bumpMaskedLayerRevision(layerId: string) {
    maskedLayerRenderRevisions[layerId] = (maskedLayerRenderRevisions[layerId] ?? 0) + 1
    requestMaskedLayerDraw(layerId)
  }

  function beginLayerComposite(layerId: string) {
    const token = ++nextLayerCompositeToken
    layerCompositeTokens.set(layerId, token)
    return token
  }

  function layerCompositeIsCurrent(layerId: string, token: number) {
    return layerCompositeTokens.get(layerId) === token
  }

  function commitMaskedLayerImage(layerId: string, image: HTMLCanvasElement) {
    maskedLayerImages[layerId] = image
    bumpMaskedLayerRevision(layerId)
  }

  async function refreshMaskedLayerImages(input: MaskRefreshInput = {}) {
    if (!maskFeatureEnabled) return
    if (editor.view !== 'editor') return
    if (isDraggingMask.value) {
      void appendDebugLog('mask', 'refresh-masked-layer-images-skipped-dragging')
      return
    }
    const layerIds = targetSet(input.layerIds)
    const maskIds = targetSet(input.maskIds)
    const targeted = Boolean(layerIds || maskIds)
    const runId = ++maskedLayerRefreshSequence
    const startedAt = performance.now()
    if (input.queuedAt !== undefined) {
      appendSpeedLog('mask-refresh-queue-delay', {
        runId,
        reason: input.reason,
        delayMs: Math.round(startedAt - input.queuedAt),
      })
    }
    const allMaskedLayers = editor.document.layers.filter((layer) => layer.mask?.enabled)
    const maskedLayers = allMaskedLayers.filter((layer) => targetMatches(layer, layerIds, maskIds))
    const proxyMaxEdge = maskProxyMaxEdge()
    void appendDebugLog('mask', 'refresh-masked-layer-images-start', {
      runId,
      reason: input.reason,
      targeted,
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
    const maskedIds = new Set(allMaskedLayers.map((layer) => layer.id))
    for (const layer of maskedLayers) {
      const compositeToken = beginLayerComposite(layer.id)
      const expectedIdentity = maskCompositeIdentity(layer)
      const layerStartedAt = performance.now()
      const image = await renderMaskedLayerImage(layer, editor.library, imageElements, {
        projectTarget: {
          projectId: editor.currentProjectId,
          projectDir: editor.projectDir || undefined,
        },
        masksEnabled: maskFeatureEnabled,
        maxCompositeEdge: proxyMaxEdge,
        usePixiMaskPreview: appConfiguration.mask.usePixiPreview,
      }) ?? maskedLayerImages[layer.id]
      if (!layerCompositeIsCurrent(layer.id, compositeToken) || isDraggingMask.value) {
        void appendDebugLog('mask', 'refresh-masked-layer-images-discarded-stale', {
          runId,
          layerId: layer.id,
          reason: isDraggingMask.value ? 'dragging' : 'superseded-layer-token',
        })
        continue
      }
      const currentIdentity = currentMaskCompositeIdentity(layer.id)
      if (!maskCompositeIdentityMatches(expectedIdentity, currentIdentity)) {
        void appendDebugLog('mask', 'mask-refresh-discarded-stale-identity', {
          runId,
          layerId: layer.id,
          expected: expectedIdentity,
          current: currentIdentity,
        })
        continue
      }
      void appendDebugLog('mask', 'refresh-layer-mask-rendered', {
        runId,
        layerId: layer.id,
        maskId: layer.mask?.id,
        producedImage: image
          ? { width: image.width, height: image.height }
          : null,
        durationMs: Math.round(performance.now() - layerStartedAt),
      })
      appendSpeedLog('mask-refresh-layer', {
        runId,
        reason: input.reason,
        layerId: layer.id,
        maskId: layer.mask?.id,
        durationMs: Math.round(performance.now() - layerStartedAt),
      })
      if (image) {
        commitMaskedLayerImage(layer.id, image)
      }
    }
    if (isDraggingMask.value) {
      void appendDebugLog('mask', 'refresh-masked-layer-images-discarded-stale', { runId, reason: 'dragging' })
      return
    }
    if (!targeted) {
      for (const id of Object.keys(maskedLayerImages)) {
        if (!maskedIds.has(id)) {
          delete maskedLayerImages[id]
          delete maskedLayerRenderRevisions[id]
        }
      }
    }
    void appendDebugLog('mask', 'refresh-masked-layer-images-complete', {
      runId,
      reason: input.reason,
      targeted,
      count: maskedLayers.length,
      durationMs: Math.round(performance.now() - startedAt),
    })
    appendSpeedLog('mask-refresh-layers-complete', {
      runId,
      reason: input.reason,
      targeted,
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

  async function refreshMaskPreviewUrls(input: { maskIds?: Iterable<string> } = {}) {
    if (!maskFeatureEnabled) return
    if (isDraggingMask.value) {
      void appendDebugLog('mask', 'refresh-mask-preview-urls-skipped-dragging')
      return
    }
    const startedAt = performance.now()
    const maskIdsFilter = targetSet(input.maskIds)
    const masks = editor.document.layers
      .map((layer) => layer.mask)
      .filter((mask) => Boolean(mask) && (!maskIdsFilter || maskIdsFilter.has(mask!.id)))
    void appendDebugLog('mask', 'refresh-mask-preview-urls-start', { count: masks.length })
    if (!maskIdsFilter) {
      const maskIds = new Set(masks.map((mask) => mask!.id))
      for (const id of Object.keys(maskPreviewUrls)) {
        if (!maskIds.has(id)) delete maskPreviewUrls[id]
      }
    }
    await Promise.all(masks.map(async (mask) => {
      if (!mask) return
      const token = beginMaskPreview(mask.id)
      const expectedIdentity = maskPreviewIdentity(mask)
      const maskStartedAt = performance.now()
      if (mask.path && !editorMaskGpuRuntime.hasMaskSource(mask, `path:${mask.path}`)) {
        const persisted = await editor.loadMaskDataUrl(mask)
        const persistedImage = await loadImageFromDataUrl(persisted)
        editorMaskGpuRuntime.seedMask(mask, persistedImage, `path:${mask.path}`, true)
      }
      const dataUrl = editorMaskGpuRuntime.thumbnail(mask, 96)
      if (!dataUrl) {
        if (!maskPreviewIsCurrent(mask.id, token, expectedIdentity)) {
          void appendDebugLog('mask', 'refresh-mask-preview-url-discarded-stale', {
            maskId: mask.id,
            reason: 'empty-stale',
          })
          return
        }
        delete maskPreviewUrls[mask.id]
        void appendDebugLog('mask', 'refresh-mask-preview-url-empty', {
          maskId: mask.id,
          sourceVersion: mask.sourceVersion,
        })
        return
      }
      const previewUrl = await downsampleDataUrl(dataUrl, 96)
      if (!maskPreviewIsCurrent(mask.id, token, expectedIdentity)) {
        void appendDebugLog('mask', 'refresh-mask-preview-url-discarded-stale', {
          maskId: mask.id,
          sourceVersion: mask.sourceVersion,
          token,
        })
        return
      }
      maskPreviewUrls[mask.id] = previewUrl
      void appendDebugLog('mask', 'refresh-mask-preview-url-complete', {
        maskId: mask.id,
        source: 'runtime',
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
    if (layer.mask.path && !editorMaskGpuRuntime.hasMaskSource(layer.mask, `path:${layer.mask.path}`)) {
      const persisted = await editor.loadMaskDataUrl(layer.mask)
      const persistedImage = await loadImageFromDataUrl(persisted)
      editorMaskGpuRuntime.seedMask(layer.mask, persistedImage, `path:${layer.mask.path}`, true)
    }
    const image = editorMaskGpuRuntime.maskCanvas(layer.mask)
    if (!image) {
      maskEditImage.value = undefined
      void appendDebugLog('mask', 'refresh-mask-edit-image-empty', {
        runId,
        layerId: layer.id,
        maskId: layer.mask.id,
        sourceVersion: layer.mask.sourceVersion,
      })
      return
    }
    if (runId !== maskEditImageRefreshRunId || isDraggingMask.value) {
      void appendDebugLog('mask', 'refresh-mask-edit-image-discarded-stale', { runId, layerId: layer.id, maskId: layer.mask.id })
      return
    }
    maskEditImage.value = image
    maskEditImageRevision.value += 1
    void appendDebugLog('mask', 'refresh-mask-edit-image-complete', {
      runId,
      layerId: layer.id,
      maskId: layer.mask.id,
      source: 'runtime',
      sourceLength: 0,
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
    const backgroundMaskPreview = backgroundMask ? await editor.loadMaskDataUrl(backgroundMask) : undefined
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

  function maskCompositeRefreshTimerKey(options: MaskCompositeScheduleOptions) {
    if (!options.layerIds && !options.maskIds) return 'all'
    const layerKeys = options.layerIds ? Array.from(options.layerIds).map((id) => `layer:${id}`) : []
    const maskKeys = options.maskIds ? Array.from(options.maskIds).map((id) => `mask:${id}`) : []
    return [...layerKeys, ...maskKeys].sort().join('|') || 'all'
  }

  function clearMaskCompositeTimer(timer: MaskCompositeTimer) {
    if (timer.kind === 'raf' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(timer.id)
      return
    }
    window.clearTimeout(timer.id)
  }

  function scheduleMaskCompositeRefresh(reason: string, options: MaskCompositeScheduleOptions = {}) {
    if (!maskFeatureEnabled) return
    const timerKey = maskCompositeRefreshTimerKey(options)
    if (timerKey === 'all') {
      for (const timer of maskCompositeRefreshTimers.values()) clearMaskCompositeTimer(timer)
      maskCompositeRefreshTimers.clear()
    } else {
      const existingTimer = maskCompositeRefreshTimers.get(timerKey)
      if (existingTimer) clearMaskCompositeTimer(existingTimer)
    }
    void appendDebugLog('mask', 'schedule-mask-composite-refresh', {
      reason,
      targeted: Boolean(options.layerIds || options.maskIds),
      immediate: Boolean(options.immediate),
      isDraggingMask: isDraggingMask.value,
      timerKey,
    })
    logCanvasLayerRenderState('editor-layer-render-state-scheduled', { reason })
    const queuedAt = performance.now()
    const run = () => {
      maskCompositeRefreshTimers.delete(timerKey)
      if (isDraggingMask.value) {
        void appendDebugLog('mask', 'schedule-mask-composite-refresh-skipped-dragging', { reason })
        return
      }
      void refreshMaskedLayerImages({ ...options, reason, queuedAt })
      if (!options.layerIds && !options.maskIds) void refreshMaskedBackgroundImage()
      else if (editor.document.canvas.backgroundMask && options.maskIds && targetSet(options.maskIds)?.has(editor.document.canvas.backgroundMask.id)) {
        void refreshMaskedBackgroundImage()
      }
    }
    if (options.immediate) {
      if (typeof window.requestAnimationFrame === 'function') {
        maskCompositeRefreshTimers.set(timerKey, { kind: 'raf', id: window.requestAnimationFrame(run) })
      } else {
        maskCompositeRefreshTimers.set(timerKey, { kind: 'timeout', id: window.setTimeout(run, 0) })
      }
      return
    }
    maskCompositeRefreshTimers.set(timerKey, { kind: 'timeout', id: window.setTimeout(run, 180) })
  }

  function cancelMaskCompositeRefresh() {
    for (const timer of maskCompositeRefreshTimers.values()) clearMaskCompositeTimer(timer)
    maskCompositeRefreshTimers.clear()
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
