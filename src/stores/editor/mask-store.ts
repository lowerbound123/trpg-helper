import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { ref } from 'vue'

import { appendDebugLog, deleteProjectMask, readProjectFileDataUrl, saveProjectMask, saveProjectMaskCache, type ProjectTarget } from '@/lib/backend'
import { appConfiguration } from '@/lib/configuration'
import { maskTransformFromLayer } from '@/lib/mask-geometry'
import { editorMaskGpuRuntime } from '@/lib/mask-runtime'
import { createMaskTileStore } from '@/lib/mask-tiles'
import { maskShapeGrayValue, maskShapeStrength, maskStrokeStrength, maskStrokeTargetValue } from '@/lib/mask-shapes'
import {
  clearBackgroundMask,
  clearLayerMask,
  copyLayerMask,
  createCanvasLayerMask,
  deleteBackgroundMask,
  deleteLayerMask,
  normalizeHandoutDocument,
  setBackgroundMask,
  setLayerMask,
  setLayerMaskEnabled,
  transferLayerMask,
  type HandoutDocument,
  type HandoutLayer,
  type LayerMask,
  type MaskShapeOperation,
  type MaskCacheMeta,
  type PaintStroke,
} from '@/lib/handout'
import type { DirtyReason } from '@/lib/handout/dirty'
import { createSolidMaskDataUrl, drawMaskEdits, maskHasPendingEdits } from '@/lib/mask'
import type { CommandHistory } from '@/lib/history'

export type MaskChangePulse = {
  id: number
  kind: 'layer' | 'background'
  maskId: string
  layerId?: string
  version: number
  reason: string
}

function changedTileKeys(before: LayerMask, after: LayerMask) {
  const keys = new Set([...Object.keys(before.tiles), ...Object.keys(after.tiles)])
  return [...keys].filter((key) => before.tiles[key]?.version !== after.tiles[key]?.version).sort()
}

export function createMaskStore(deps: {
  document: ComputedRef<HandoutDocument>
  commit: (mutator: (document: HandoutDocument) => HandoutDocument, options?: { merge?: boolean }) => void
  history: ShallowRef<CommandHistory<HandoutDocument>>
  markLayerDirty: (layerId: string, reason: DirtyReason) => void
  projectTarget: () => ProjectTarget
  selectedLayer: ComputedRef<HandoutLayer | undefined>
  selectedLayerId: Ref<string | undefined>
}) {
  const maskDataUrls = ref<Record<string, string>>({})
  const deletedMaskPaths = ref<string[]>([])
  const maskEditTarget = ref<{ kind: 'layer'; layerId: string } | { kind: 'background' }>()
  const maskChangePulse = ref<MaskChangePulse>({
    id: 0,
    kind: 'layer',
    maskId: '',
    version: 0,
    reason: 'init',
  })
  const maskPaintQueues = new Map<string, Promise<void>>()

  function emitMaskChangePulse(input: Omit<MaskChangePulse, 'id'>) {
    maskChangePulse.value = {
      ...input,
      id: maskChangePulse.value.id + 1,
    }
  }

  function newMask(input: Partial<LayerMask> = {}): LayerMask {
    const id = input.id || crypto.randomUUID()
    return createCanvasLayerMask(deps.document.value.canvas, {
      id,
      highResPath: `masks/${id}.png`,
      previewPath: `masks/${id}.preview.png`,
      previewScale: 1,
      ...input,
    })
  }

  function addMaskToLayer(layerId: string) {
    if (!appConfiguration.mask.enabled) return
    const layer = deps.document.value.layers.find((item) => item.id === layerId)
    if (!layer) return
    const mask = newMask({ layerId, width: layer.width, height: layer.height, matrix: maskTransformFromLayer(layer) })
    void appendDebugLog('mask', 'add-layer-mask-start', {
      layerId,
      maskId: mask.id,
      width: mask.width,
      height: mask.height,
    })
    void appendDebugLog('mask', 'add-layer-mask-dataurl-created', {
      layerId,
      maskId: mask.id,
      dataUrlLength: 0,
      durationMs: 0,
    })
    deps.commit((doc) => setLayerMask(doc, layerId, mask))
    emitMaskChangePulse({ kind: 'layer', layerId, maskId: mask.id, version: mask.version, reason: 'add' })
  }

  function editLayerMask(layerId: string) {
    if (!appConfiguration.mask.enabled) return
    const layer = deps.document.value.layers.find((item) => item.id === layerId)
    if (!layer) return
    if (!layer.mask) addMaskToLayer(layerId)
    maskEditTarget.value = { kind: 'layer', layerId }
  }

  function addMaskToSelectedLayer() {
    if (!appConfiguration.mask.enabled) return
    const layer = deps.selectedLayer.value
    if (!layer) return
    addMaskToLayer(layer.id)
  }

  function addBackgroundMask() {
    if (!appConfiguration.mask.enabled) return
    const mask = newMask()
    deps.commit((doc) => setBackgroundMask(doc, mask))
    emitMaskChangePulse({ kind: 'background', maskId: mask.id, version: mask.version, reason: 'add' })
  }

  function editBackgroundMask() {
    if (!appConfiguration.mask.enabled) return
    if (!deps.document.value.canvas.backgroundMask) addBackgroundMask()
    maskEditTarget.value = { kind: 'background' }
  }

  function exitMaskEdit() {
    maskEditTarget.value = undefined
  }

  function setSelectedLayerMaskEnabled(enabled: boolean) {
    if (!appConfiguration.mask.enabled) return
    const layer = deps.selectedLayer.value
    if (!layer?.mask) return
    deps.commit((doc) => setLayerMaskEnabled(doc, layer.id, enabled))
    emitMaskChangePulse({ kind: 'layer', layerId: layer.id, maskId: layer.mask.id, version: layer.mask.version, reason: 'enabled' })
  }

  function patchLayerMask(layerId: string, patch: Partial<LayerMask>) {
    if (!appConfiguration.mask.enabled) return
    const layer = deps.document.value.layers.find((item) => item.id === layerId)
    if (!layer?.mask) return
    const nextMask = {
      ...layer.mask!,
      ...patch,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    }
    deps.commit((doc) => setLayerMask(doc, layerId, {
      ...nextMask,
    }))
    deps.markLayerDirty(layerId, 'mask-changed')
    emitMaskChangePulse({ kind: 'layer', layerId, maskId: layer.mask.id, version: nextMask.version, reason: 'patch' })
  }

  function setMaskCacheMeta(maskId: string, cache: MaskCacheMeta) {
    if (!appConfiguration.mask.enabled) return
    const updateMask = (mask: LayerMask) => ({
      ...mask,
      cache,
      previewPath: cache.preview1200Path ?? null,
      previewUpdatedAt: cache.updatedAt,
    })
    let next = deps.document.value
    if (next.canvas.backgroundMask?.id === maskId) {
      next = setBackgroundMask(next, updateMask(next.canvas.backgroundMask))
    }
    for (const layer of next.layers) {
      if (layer.mask?.id === maskId) next = setLayerMask(next, layer.id, updateMask(layer.mask))
    }
    if (next !== deps.document.value) deps.history.value.replace(normalizeHandoutDocument(next))
  }

  async function saveMaskCache(mask: LayerMask, dataUrl: string, maxEdge: number) {
    if (!appConfiguration.mask.enabled) return undefined
    const target = deps.projectTarget()
    if (!target.projectId && !target.projectDir) return undefined
    const path = await saveProjectMaskCache(target, mask.id, dataUrl, maxEdge)
    const cache: MaskCacheMeta = {
      preview1200Path: path,
      sourceVersion: mask.sourceVersion,
      previewVersion: 1,
      maxEdge,
      updatedAt: new Date().toISOString(),
    }
    setMaskCacheMeta(mask.id, cache)
    return cache
  }

  function setBackgroundMaskEnabled(enabled: boolean) {
    if (!appConfiguration.mask.enabled) return
    const mask = deps.document.value.canvas.backgroundMask
    if (!mask) return
    deps.commit((doc) => setBackgroundMask(doc, { ...mask, enabled }))
    emitMaskChangePulse({ kind: 'background', maskId: mask.id, version: mask.version, reason: 'enabled' })
  }

  function queueMaskFilesForDeletion(mask?: LayerMask | null) {
    if (!mask) return
    const paths = [
      mask.path,
      mask.highResPath,
      mask.previewPath,
      mask.cache?.preview1200Path,
    ].filter((path): path is string => Boolean(path))
    for (const path of new Set(paths)) {
      if (!deletedMaskPaths.value.includes(path)) deletedMaskPaths.value.push(path)
    }
  }

  function queueMaskPreviewFilesForDeletion(mask?: LayerMask | null) {
    if (!mask) return
    const paths = [
      mask.previewPath,
      mask.cache?.preview1200Path,
    ].filter((path): path is string => Boolean(path))
    for (const path of new Set(paths)) {
      if (!deletedMaskPaths.value.includes(path)) deletedMaskPaths.value.push(path)
    }
  }

  function clearSelectedLayerMask() {
    if (!appConfiguration.mask.enabled) return
    const layer = deps.selectedLayer.value
    if (!layer?.mask) return
    const updatedAt = new Date().toISOString()
    deps.commit((doc) => clearLayerMask(doc, layer.id, updatedAt))
    emitMaskChangePulse({ kind: 'layer', layerId: layer.id, maskId: layer.mask.id, version: layer.mask.version + 1, reason: 'clear' })
  }

  function clearCanvasBackgroundMask() {
    if (!appConfiguration.mask.enabled) return
    const mask = deps.document.value.canvas.backgroundMask
    if (!mask) return
    const updatedAt = new Date().toISOString()
    deps.commit((doc) => clearBackgroundMask(doc, updatedAt))
    emitMaskChangePulse({ kind: 'background', maskId: mask.id, version: mask.version + 1, reason: 'clear' })
  }

  function deleteSelectedLayerMask() {
    if (!appConfiguration.mask.enabled) return
    const layer = deps.selectedLayer.value
    if (!layer?.mask) return
    queueMaskFilesForDeletion(layer.mask)
    delete maskDataUrls.value[layer.mask.id]
    if (maskEditTarget.value?.kind === 'layer' && maskEditTarget.value.layerId === layer.id) exitMaskEdit()
    deps.commit((doc) => deleteLayerMask(doc, layer.id))
    emitMaskChangePulse({ kind: 'layer', layerId: layer.id, maskId: layer.mask.id, version: layer.mask.version, reason: 'delete' })
  }

  function deleteLayerMaskById(layerId: string) {
    if (!appConfiguration.mask.enabled) return
    const layer = deps.document.value.layers.find((item) => item.id === layerId)
    if (!layer?.mask) return
    queueMaskFilesForDeletion(layer.mask)
    delete maskDataUrls.value[layer.mask.id]
    if (maskEditTarget.value?.kind === 'layer' && maskEditTarget.value.layerId === layer.id) exitMaskEdit()
    deps.commit((doc) => deleteLayerMask(doc, layer.id))
    emitMaskChangePulse({ kind: 'layer', layerId, maskId: layer.mask.id, version: layer.mask.version, reason: 'delete' })
  }

  function deleteCanvasBackgroundMask() {
    if (!appConfiguration.mask.enabled) return
    const mask = deps.document.value.canvas.backgroundMask
    if (!mask) return
    queueMaskFilesForDeletion(mask)
    delete maskDataUrls.value[mask.id]
    if (maskEditTarget.value?.kind === 'background') exitMaskEdit()
    deps.commit((doc) => deleteBackgroundMask(doc))
    emitMaskChangePulse({ kind: 'background', maskId: mask.id, version: mask.version, reason: 'delete' })
  }

  async function moveOrCopyLayerMask(sourceLayerId: string, targetLayerId: string, copy = false) {
    if (!appConfiguration.mask.enabled) return
    if (sourceLayerId === targetLayerId) return
    const source = deps.document.value.layers.find((item) => item.id === sourceLayerId)
    const target = deps.document.value.layers.find((item) => item.id === targetLayerId)
    if (!source?.mask || !target) return
    const sourceDataUrl = await loadMaskDataUrl(source.mask)
    queueMaskFilesForDeletion(target.mask)
    if (copy) {
      const nextMaskId = crypto.randomUUID()
      maskDataUrls.value[nextMaskId] = sourceDataUrl
      deps.commit((doc) => copyLayerMask(doc, sourceLayerId, targetLayerId, nextMaskId))
      emitMaskChangePulse({ kind: 'layer', layerId: targetLayerId, maskId: nextMaskId, version: source.mask.version, reason: 'copy' })
      return
    }
    maskDataUrls.value[source.mask.id] = sourceDataUrl
    deps.commit((doc) => transferLayerMask(doc, sourceLayerId, targetLayerId))
    emitMaskChangePulse({ kind: 'layer', layerId: targetLayerId, maskId: source.mask.id, version: source.mask.version, reason: 'move' })
    if (maskEditTarget.value?.kind === 'layer' && maskEditTarget.value.layerId === sourceLayerId) {
      maskEditTarget.value = { kind: 'layer', layerId: targetLayerId }
    }
  }

  async function applyMaskStroke(maskId: string, stroke: PaintStroke) {
    if (!appConfiguration.mask.enabled) return
    const currentMask = deps.document.value.canvas.backgroundMask?.id === maskId
      ? deps.document.value.canvas.backgroundMask
      : deps.document.value.layers.find((item) => item.mask?.id === maskId)?.mask
    if (!currentMask) return
    const nextMask = createMaskTileStore(currentMask).applyStroke(stroke)
    editorMaskGpuRuntime.syncStrokeApplied(currentMask, stroke, nextMask.version)
    queueMaskPreviewFilesForDeletion(currentMask)
    const strokePayload = {
      maskId: currentMask.id,
      strokeId: stroke.id,
      mode: stroke.mode,
      source: 'opacity',
      brushOpacity: stroke.opacity ?? null,
      eraserOpacity: stroke.eraserOpacity ?? null,
      targetValue: maskStrokeTargetValue(stroke),
      strength: maskStrokeStrength(stroke),
      strokeWidth: stroke.strokeWidth,
      pointCount: Math.floor((stroke.points?.length ?? 0) / 2),
      versionBefore: currentMask.version,
      versionAfter: nextMask.version,
      dirtyTileKeys: changedTileKeys(currentMask, nextMask),
    }
    if (deps.document.value.canvas.backgroundMask?.id === currentMask.id) {
      deps.commit((doc) => setBackgroundMask(doc, nextMask))
      void appendDebugLog('mask', 'mask-stroke-committed', {
        ...strokePayload,
        targetKind: 'background',
      })
      emitMaskChangePulse({ kind: 'background', maskId: nextMask.id, version: nextMask.version, reason: 'stroke' })
      return
    }
    const layer = deps.document.value.layers.find((item) => item.mask?.id === currentMask.id)
    if (layer) {
      deps.commit((doc) => setLayerMask(doc, layer.id, nextMask))
      deps.markLayerDirty(layer.id, 'mask-changed')
      void appendDebugLog('mask', 'mask-stroke-committed', {
        ...strokePayload,
        targetKind: 'layer',
        layerId: layer.id,
      })
      emitMaskChangePulse({ kind: 'layer', layerId: layer.id, maskId: nextMask.id, version: nextMask.version, reason: 'stroke' })
    }
  }

  async function applyMaskShape(maskId: string, shape: MaskShapeOperation) {
    if (!appConfiguration.mask.enabled) return
    const currentMask = deps.document.value.canvas.backgroundMask?.id === maskId
      ? deps.document.value.canvas.backgroundMask
      : deps.document.value.layers.find((item) => item.mask?.id === maskId)?.mask
    if (!currentMask) return
    const nextMask = createMaskTileStore(currentMask).applyShape(shape)
    editorMaskGpuRuntime.syncShapeApplied(currentMask, shape, nextMask.version)
    queueMaskPreviewFilesForDeletion(currentMask)
    const shapePayload = {
      maskId: currentMask.id,
      shapeId: shape.id,
      shape: shape.shape,
      source: 'opacity',
      targetValue: 255,
      strength: maskShapeStrength(shape),
      strengthValue: maskShapeGrayValue(shape),
      value: maskShapeGrayValue(shape),
      bounds: { x: shape.x, y: shape.y, width: shape.width, height: shape.height },
      strokeWidth: shape.strokeWidth,
      pointCount: shape.polygonPoints?.length ?? 0,
      versionBefore: currentMask.version,
      versionAfter: nextMask.version,
      dirtyTileKeys: changedTileKeys(currentMask, nextMask),
    }
    if (deps.document.value.canvas.backgroundMask?.id === currentMask.id) {
      deps.commit((doc) => setBackgroundMask(doc, nextMask))
      void appendDebugLog('mask', 'mask-shape-committed', {
        ...shapePayload,
        targetKind: 'background',
      })
      emitMaskChangePulse({ kind: 'background', maskId: nextMask.id, version: nextMask.version, reason: 'shape' })
      return
    }
    const layer = deps.document.value.layers.find((item) => item.mask?.id === currentMask.id)
    if (layer) {
      deps.commit((doc) => setLayerMask(doc, layer.id, nextMask))
      deps.markLayerDirty(layer.id, 'mask-changed')
      void appendDebugLog('mask', 'mask-shape-committed', {
        ...shapePayload,
        targetKind: 'layer',
        layerId: layer.id,
      })
      emitMaskChangePulse({ kind: 'layer', layerId: layer.id, maskId: nextMask.id, version: nextMask.version, reason: 'shape' })
    }
  }

  async function paintMask(mask: LayerMask, stroke: PaintStroke) {
    if (!appConfiguration.mask.enabled) return
    const previous = maskPaintQueues.get(mask.id) ?? Promise.resolve()
    const next = previous.then(() => applyMaskStroke(mask.id, stroke))
    maskPaintQueues.set(mask.id, next.catch(() => undefined))
    await next
  }

  async function addMaskShape(mask: LayerMask, shape: MaskShapeOperation) {
    if (!appConfiguration.mask.enabled) return
    const previous = maskPaintQueues.get(mask.id) ?? Promise.resolve()
    const next = previous.then(() => applyMaskShape(mask.id, shape))
    maskPaintQueues.set(mask.id, next.catch(() => undefined))
    await next
  }

  async function loadMaskDataUrl(mask: LayerMask) {
    if (!appConfiguration.mask.enabled) return createSolidMaskDataUrl(mask.width, mask.height)
    const existing = maskDataUrls.value[mask.id]
    if (existing) {
      return maskHasPendingEdits(mask)
        ? drawMaskEdits(existing, mask)
        : existing
    }
    if (mask.path) {
      try {
        const dataUrl = await readProjectFileDataUrl(deps.projectTarget(), mask.path, 'image/png')
        if (!maskHasPendingEdits(mask)) maskDataUrls.value[mask.id] = dataUrl
        else return drawMaskEdits(dataUrl, mask)
        return dataUrl
      } catch (error) {
        void appendDebugLog('mask', 'load-mask-failed', {
          maskId: mask.id,
          path: mask.path,
          error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
        })
      }
    }
    const fallback = createSolidMaskDataUrl(mask.width, mask.height)
    if (!maskHasPendingEdits(mask)) maskDataUrls.value[mask.id] = fallback
    else return drawMaskEdits(fallback, mask)
    return fallback
  }

  async function persistProjectMasks() {
    if (!appConfiguration.mask.enabled) return
    const target = deps.projectTarget()
    if (!target.projectId && !target.projectDir) return
    for (const relativePath of deletedMaskPaths.value.splice(0)) {
      await deleteProjectMask(target, relativePath)
    }
    let nextDocument = deps.document.value
    const loadStoredMaskBaseDataUrl = async (mask: LayerMask) => {
      if (maskDataUrls.value[mask.id]) return maskDataUrls.value[mask.id]
      if (!mask.path) return createSolidMaskDataUrl(mask.width, mask.height)
      try {
        return await readProjectFileDataUrl(target, mask.path, 'image/png')
      } catch (error) {
        void appendDebugLog('mask', 'load-mask-for-persist-failed', {
          maskId: mask.id,
          path: mask.path,
          error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
        })
        return createSolidMaskDataUrl(mask.width, mask.height)
      }
    }
    const saveOne = async (mask: LayerMask) => {
      const baseDataUrl = await loadStoredMaskBaseDataUrl(mask)
      const dataUrl = maskHasPendingEdits(mask)
        ? await drawMaskEdits(baseDataUrl, mask)
        : baseDataUrl
      if (!dataUrl) return mask
      const path = await saveProjectMask(target, mask.id, dataUrl)
      const updatedAt = new Date().toISOString()
      return {
        ...mask,
        path,
        highResPath: path,
        strokes: [],
        shapes: [],
        operations: [],
        previewPath: null,
        previewUpdatedAt: null,
        cache: null,
        updatedAt,
      }
    }
    const backgroundMask = nextDocument.canvas.backgroundMask
    if (backgroundMask) {
      const saved = await saveOne(backgroundMask)
      nextDocument = setBackgroundMask(nextDocument, saved)
      delete maskDataUrls.value[saved.id]
    }
    for (const layer of nextDocument.layers) {
      if (!layer.mask) continue
      const saved = await saveOne(layer.mask)
      nextDocument = setLayerMask(nextDocument, layer.id, saved)
      delete maskDataUrls.value[saved.id]
    }
    if (nextDocument !== deps.document.value) {
      deps.history.value.replace(normalizeHandoutDocument(nextDocument))
    }
  }

  function reconcileMaskEditTarget() {
    const target = maskEditTarget.value
    if (!target || target.kind === 'background') return
    if (deps.selectedLayerId.value !== target.layerId) maskEditTarget.value = undefined
  }

  return {
    maskDataUrls,
    deletedMaskPaths,
    maskEditTarget,
    maskChangePulse,
    addMaskToLayer,
    editLayerMask,
    addMaskToSelectedLayer,
    addBackgroundMask,
    editBackgroundMask,
    exitMaskEdit,
    setSelectedLayerMaskEnabled,
    patchLayerMask,
    setMaskCacheMeta,
    saveMaskCache,
    setBackgroundMaskEnabled,
    clearSelectedLayerMask,
    clearCanvasBackgroundMask,
    deleteSelectedLayerMask,
    deleteLayerMaskById,
    deleteCanvasBackgroundMask,
    moveOrCopyLayerMask,
    addMaskShape,
    paintMask,
    loadMaskDataUrl,
    persistProjectMasks,
    reconcileMaskEditTarget,
  }
}
