import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

import {
  addImageLayer,
  addLayerGroup,
  addLayerToGroup,
  addPaintLayer,
  addShapeLayer,
  addTextLayer,
  appendPaintStroke,
  clearBackgroundMask,
  clearLayerMask,
  createCanvasLayerMask,
  createDefaultHandout,
  deleteBackgroundMask,
  deleteLayerMask,
  flattenLayersToImage,
  moveLayer,
  moveLayerGroup,
  moveLayerOutOfGroup,
  normalizeHandoutDocument,
  removeLayer,
  setBackgroundMask,
  setLayerMask,
  setLayerMaskEnabled,
  setLayerGroupVisibility,
  copyLayerMask,
  transferLayerMask,
  ungroupLayerGroup,
  updateCanvas,
  updateLayer,
  type HandoutDocument,
  type HandoutLayer,
  type FlattenedLayerBounds,
  type BrushKind,
  type ImageLayer,
  type LayerMask,
  type LayerEffects,
  type LayerPatch,
  type MaskCacheMeta,
  type PaintLayer,
  type PaintStroke,
  type ShapeKind,
  type ShapeLayer,
  type TextLayer,
} from '@/lib/handout'
import { createDirtyFlags, markLayerDirty as markDirtyFlag, markProjectPreviewDirty as markProjectDirtyFlag, type DirtyReason } from '@/lib/handout/dirty'
import { createHistory } from '@/lib/history'
import { createSolidMaskDataUrl, drawMaskStroke } from '@/lib/mask'
import { appConfiguration } from '@/lib/configuration'
import {
  emptyLibrary,
  appendDebugLog,
  copyProjectMasks,
  fileUrl,
  fontRecordFamily,
  createLibraryFolder,
  createProject,
  createProjectFolder,
  deleteLibraryEntries,
  deleteProjectEntries,
  getLibrary,
  importAsset,
  importBackground,
  importFont,
  listProjectFolders,
  listProjects,
  moveLibraryRecord,
  moveManagedProject,
  openManagedProject,
  openProject,
  renameLibraryFolder,
  renameLibraryRecord,
  renameManagedProject,
  renameProjectFolder,
  repairMissingThumbnails,
  readProjectFileDataUrl,
  deleteProjectMask,
  saveProjectMask,
  saveProjectMaskCache,
  saveFontPreview,
  saveManagedProject,
  saveProject,
  type LibraryIndex,
  type LibraryRecord,
  type ProjectSummary,
} from '@/lib/backend'
import { generateFontPreviewDataUrl } from '@/lib/font-preview'

const tagList = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)

function fontFamily(font?: LibraryRecord) {
  return fontRecordFamily(font)
}

function logText(message: string, data?: Record<string, unknown>) {
  console.debug(`[text] ${message}`, data)
  void appendDebugLog('text', message, data)
}

export const useEditorStore = defineStore('editor', () => {
  const history = shallowRef(createHistory(createDefaultHandout('Untitled handout')))
  const selectedLayerId = ref<string>()
  const selectedLayerIds = ref<string[]>([])
  const projectDir = ref('')
  const currentProjectId = ref<string>()
  const view = ref<'manager' | 'editor'>('manager')
  const projects = ref<ProjectSummary[]>([])
  const projectFolders = ref<string[]>([])
  const library = ref<LibraryIndex>(emptyLibrary())
  const status = ref('Ready')
  const continuousEditKey = ref<string>()
  const lastTextFontId = ref<string>()
  const maskDataUrls = ref<Record<string, string>>({})
  const deletedMaskPaths = ref<string[]>([])
  const maskEditTarget = ref<{ kind: 'layer'; layerId: string } | { kind: 'background' }>()
  const toolSettings = ref({
    brushColor: '#111827',
    brushKind: 'pixel' as BrushKind,
    brushWidth: 6,
    brushOpacity: 1,
    eraserWidth: 12,
    eraserOpacity: 1,
    brushTension: 0.35,
  })
  const maskPaintQueues = new Map<string, Promise<void>>()
  const dirtyFlags = shallowRef(createDirtyFlags())

  const document = computed(() => history.value.current)
  const layers = computed(() => [...document.value.layers].sort((a, b) => b.zIndex - a.zIndex))
  const groups = computed(() => document.value.groups ?? [])
  const latestProjects = computed(() => projects.value)
  const selectedLayer = computed<HandoutLayer | undefined>(() =>
    document.value.layers.find((layer) => layer.id === selectedLayerId.value),
  )

  function markLayerDirty(layerId: string, reason: DirtyReason) {
    const next = createDirtyFlags()
    for (const id of dirtyFlags.value.layerIds) next.layerIds.add(id)
    for (const id of dirtyFlags.value.maskLayerIds) next.maskLayerIds.add(id)
    for (const id of dirtyFlags.value.paintLayerIds) next.paintLayerIds.add(id)
    next.projectPreview = dirtyFlags.value.projectPreview
    markDirtyFlag(next, layerId, reason)
    dirtyFlags.value = next
  }

  function markProjectPreviewDirty() {
    const next = createDirtyFlags()
    for (const id of dirtyFlags.value.layerIds) next.layerIds.add(id)
    for (const id of dirtyFlags.value.maskLayerIds) next.maskLayerIds.add(id)
    for (const id of dirtyFlags.value.paintLayerIds) next.paintLayerIds.add(id)
    next.projectPreview = dirtyFlags.value.projectPreview
    markProjectDirtyFlag(next)
    dirtyFlags.value = next
  }

  function patchToolSettings(patch: Partial<typeof toolSettings.value>) {
    toolSettings.value = {
      ...toolSettings.value,
      ...patch,
    }
  }

  function dirtyReasonForLayerPatch(patch: LayerPatch): DirtyReason {
    if ('effects' in patch) return 'effect-changed'
    if ('visible' in patch || 'opacity' in patch || 'blendMode' in patch) return 'visibility-changed'
    if (
      'x' in patch
      || 'y' in patch
      || 'width' in patch
      || 'height' in patch
      || 'rotation' in patch
      || 'flipX' in patch
    ) return 'transform-changed'
    return 'source-changed'
  }
  const selectedLayers = computed<HandoutLayer[]>(() =>
    selectedLayerIds.value
      .map((id) => document.value.layers.find((layer) => layer.id === id))
      .filter((layer): layer is HandoutLayer => Boolean(layer)),
  )
  const canUndo = computed(() => history.value.canUndo.value)
  const canRedo = computed(() => history.value.canRedo.value)

  function commit(mutator: (document: HandoutDocument) => HandoutDocument, options?: { merge?: boolean }) {
    history.value.commit(mutator, options)
  }

  function commitContinuous(key: string, mutator: (document: HandoutDocument) => HandoutDocument) {
    const merge = continuousEditKey.value === key
    commit(mutator, { merge })
    continuousEditKey.value = key
  }

  function endContinuousEdit(key?: string) {
    if (!key || continuousEditKey.value === key) continuousEditKey.value = undefined
  }

  function selectLayer(layerId?: string) {
    selectedLayerId.value = layerId
    selectedLayerIds.value = layerId ? [layerId] : []
    reconcileMaskEditTarget()
  }

  function setLayerSelection(layerIds: string[]) {
    const existing = new Set(document.value.layers.map((layer) => layer.id))
    selectedLayerIds.value = layerIds.filter((id, index) => existing.has(id) && layerIds.indexOf(id) === index)
    selectedLayerId.value = selectedLayerIds.value.at(-1)
    reconcileMaskEditTarget()
  }

  function toggleLayerSelection(layerId: string) {
    if (!document.value.layers.some((layer) => layer.id === layerId)) return
    if (selectedLayerIds.value.includes(layerId)) {
      setLayerSelection(selectedLayerIds.value.filter((id) => id !== layerId))
      return
    }
    setLayerSelection([...selectedLayerIds.value, layerId])
  }

  function addLayerFromAsset(asset: LibraryRecord, size?: { width?: number; height?: number }) {
    commit((doc) =>
      addImageLayer(doc, {
        assetId: asset.id,
        name: asset.name,
        x: 120 + doc.layers.length * 20,
        y: 100 + doc.layers.length * 20,
        width: size?.width,
        height: size?.height,
      }),
    )
    selectedLayerId.value = document.value.layers.at(-1)?.id
    selectedLayerIds.value = selectedLayerId.value ? [selectedLayerId.value] : []
  }

  function addLayerFromAssetAt(asset: LibraryRecord, x: number, y: number, size?: { width?: number; height?: number }) {
    commit((doc) =>
      addImageLayer(doc, {
        assetId: asset.id,
        name: asset.name,
        x: Math.max(0, Math.round(x)),
        y: Math.max(0, Math.round(y)),
        width: size?.width,
        height: size?.height,
      }),
    )
    selectedLayerId.value = document.value.layers.at(-1)?.id
    selectedLayerIds.value = selectedLayerId.value ? [selectedLayerId.value] : []
  }

  function addText(font?: LibraryRecord, position?: { x?: number; y?: number }) {
    const firstFont = font ?? resolveFont(lastTextFontId.value) ?? library.value.fonts[0]
    commit((doc) =>
      addTextLayer(doc, {
        text: 'New text',
        fontId: firstFont?.id,
        fontFamily: fontFamily(firstFont),
        x: position?.x ?? 180,
        y: position?.y ?? 160,
      }),
    )
    selectedLayerId.value = document.value.layers.at(-1)?.id
    selectedLayerIds.value = selectedLayerId.value ? [selectedLayerId.value] : []
    if (firstFont?.id) lastTextFontId.value = firstFont.id
    logText('add-text-layer', {
      layerId: selectedLayerId.value,
      fontId: firstFont?.id,
      fontName: firstFont?.name,
      fontFamily: fontFamily(firstFont),
      position,
    })
  }

  function addShape(shape: ShapeKind, position?: { x?: number; y?: number }) {
    commit((doc) =>
      addShapeLayer(doc, {
        shape,
        x: position?.x ?? 180,
        y: position?.y ?? 160,
      }),
    )
    selectedLayerId.value = document.value.layers.at(-1)?.id
    selectedLayerIds.value = selectedLayerId.value ? [selectedLayerId.value] : []
  }

  function addPaint(position?: { x?: number; y?: number }) {
    commit((doc) =>
      addPaintLayer(doc, {
        x: position?.x ?? 0,
        y: position?.y ?? 0,
        width: doc.canvas.width,
        height: doc.canvas.height,
      }),
    )
    selectedLayerId.value = document.value.layers.at(-1)?.id
    selectedLayerIds.value = selectedLayerId.value ? [selectedLayerId.value] : []
  }

  function appendStrokeToPaintLayer(stroke: PaintStroke) {
    let targetId = isPaintLayer(selectedLayer.value) ? selectedLayer.value.id : ''
    commit((doc) => {
      let next = doc
      if (!targetId) {
        next = addPaintLayer(next, {
          width: next.canvas.width,
          height: next.canvas.height,
        })
        targetId = next.layers.at(-1)?.id ?? ''
      }
      return targetId ? appendPaintStroke(next, targetId, stroke) : next
    })
    if (targetId) {
      markLayerDirty(targetId, 'paint-changed')
      selectLayer(targetId)
    }
  }

  function applyOrCreateTextWithFont(font: LibraryRecord, position?: { x?: number; y?: number }) {
    lastTextFontId.value = font.id
    const textLayerIds = selectedLayers.value.filter((layer) => layer.type === 'text').map((layer) => layer.id)
    if (textLayerIds.length) {
      commit((doc) =>
        textLayerIds.reduce((next, id) => updateLayer(next, id, {
          fontId: font.id,
          fontFamily: fontFamily(font),
        }), doc),
      )
      logText('apply-font-to-selection', {
        fontId: font.id,
        fontName: font.name,
        fontFamily: fontFamily(font),
        layerIds: textLayerIds,
      })
      return
    }
    addText(font, position)
  }

  function patchSelectedLayer(patch: LayerPatch) {
    const id = selectedLayerId.value
    if (!id) return
    commit((doc) => updateLayerWithMaskSync(doc, id, patch))
    markLayerDirty(id, dirtyReasonForLayerPatch(patch))
  }

  function patchSelectedLayers(patch: LayerPatch) {
    const ids = selectedLayerIds.value
    if (!ids.length) return
    commit((doc) => ids.reduce((next, id) => updateLayerWithMaskSync(next, id, patch), doc))
    const reason = dirtyReasonForLayerPatch(patch)
    ids.forEach((id) => markLayerDirty(id, reason))
  }

  function patchSelectedLayersContinuous(key: string, patch: LayerPatch) {
    const ids = selectedLayerIds.value
    if (!ids.length) return
    commitContinuous(key, (doc) => ids.reduce((next, id) => updateLayerWithMaskSync(next, id, patch), doc))
    const reason = dirtyReasonForLayerPatch(patch)
    ids.forEach((id) => markLayerDirty(id, reason))
  }

  function patchSelectedLayerEffect(kind: keyof LayerEffects, value: number) {
    const ids = selectedLayerIds.value
    if (!ids.length) return
    commit((doc) =>
      ids.reduce((next, id) => {
        const layer = next.layers.find((item) => item.id === id)
        if (!layer) return next
        return updateLayer(next, id, {
          effects: {
            ...layer.effects,
            [kind]: value,
          },
        })
      }, doc),
    )
    ids.forEach((id) => markLayerDirty(id, 'effect-changed'))
  }

  function patchSelectedLayerEffectContinuous(key: string, kind: keyof LayerEffects, value: number) {
    const ids = selectedLayerIds.value
    if (!ids.length) return
    commitContinuous(key, (doc) =>
      ids.reduce((next, id) => {
        const layer = next.layers.find((item) => item.id === id)
        if (!layer) return next
        return updateLayer(next, id, {
          effects: {
            ...layer.effects,
            [kind]: value,
          },
        })
      }, doc),
    )
    ids.forEach((id) => markLayerDirty(id, 'effect-changed'))
  }

  function patchLayer(layerId: string, patch: LayerPatch) {
    commit((doc) => updateLayerWithMaskSync(doc, layerId, patch))
    markLayerDirty(layerId, dirtyReasonForLayerPatch(patch))
  }

  function patchLayerContinuous(layerId: string, key: string, patch: LayerPatch) {
    commitContinuous(key, (doc) => updateLayerWithMaskSync(doc, layerId, patch))
    markLayerDirty(layerId, dirtyReasonForLayerPatch(patch))
  }

  function deleteSelectedLayer() {
    const ids = selectedLayerIds.value.length ? selectedLayerIds.value : selectedLayerId.value ? [selectedLayerId.value] : []
    if (!ids.length) return
    commit((doc) => ids.reduce((next, id) => removeLayer(next, id), doc))
    ids.forEach((id) => markLayerDirty(id, 'visibility-changed'))
    if (maskEditTarget.value?.kind === 'layer' && ids.includes(maskEditTarget.value.layerId)) maskEditTarget.value = undefined
    selectedLayerId.value = undefined
    selectedLayerIds.value = []
  }

  function mergeSelectedLayersIntoGroup() {
    const ids = selectedLayerIds.value.length ? selectedLayerIds.value : selectedLayerId.value ? [selectedLayerId.value] : []
    if (!ids.length) return
    commit((doc) => addLayerGroup(doc, ids))
  }

  function ungroupGroup(groupId: string) {
    commit((doc) => ungroupLayerGroup(doc, groupId))
  }

  function toggleGroupVisibility(groupId: string) {
    const group = groups.value.find((item) => item.id === groupId)
    if (!group) return
    commit((doc) => setLayerGroupVisibility(doc, groupId, !group.visible))
    group.layerIds.forEach((id) => markLayerDirty(id, 'visibility-changed'))
  }

  function moveSelectedLayersOutOfGroup() {
    const ids = selectedLayerIds.value.length ? selectedLayerIds.value : selectedLayerId.value ? [selectedLayerId.value] : []
    if (!ids.length) return
    commit((doc) => ids.reduce((next, id) => moveLayerOutOfGroup(next, id), doc))
  }

  function addLayerToGroupAt(layerId: string, groupId: string, targetLayerId?: string) {
    const group = groups.value.find((item) => item.id === groupId)
    const targetIndex = targetLayerId && group ? group.layerIds.indexOf(targetLayerId) : undefined
    commit((doc) => addLayerToGroup(doc, layerId, groupId, targetIndex !== undefined && targetIndex >= 0 ? targetIndex : undefined))
  }

  function moveLayerOutOfGroupToIndex(layerId: string, targetIndex: number) {
    commit((doc) => moveLayer(moveLayerOutOfGroup(doc, layerId), layerId, targetIndex))
  }

  function moveSelectedLayer(delta: number) {
    const layer = selectedLayer.value
    if (!layer) return
    commit((doc) => moveLayer(doc, layer.id, layer.zIndex + delta))
    markLayerDirty(layer.id, 'transform-changed')
  }

  function moveLayerToIndex(layerId: string, targetIndex: number) {
    commit((doc) => moveLayer(doc, layerId, targetIndex))
    markLayerDirty(layerId, 'transform-changed')
  }

  function moveGroupToIndex(groupId: string, targetIndex: number) {
    const group = groups.value.find((item) => item.id === groupId)
    commit((doc) => moveLayerGroup(doc, groupId, targetIndex))
    group?.layerIds.forEach((id) => markLayerDirty(id, 'transform-changed'))
  }

  function setBackground(background?: LibraryRecord) {
    commit((doc) => updateCanvas(doc, { backgroundAssetId: background?.id }))
    markProjectPreviewDirty()
  }

  function patchCanvas(canvas: Partial<HandoutDocument['canvas']>) {
    commit((doc) => updateCanvas(doc, canvas))
    markProjectPreviewDirty()
  }

  function patchCanvasEffectContinuous(key: string, kind: keyof LayerEffects, value: number) {
    commitContinuous(key, (doc) =>
      updateCanvas(doc, {
        effects: {
          ...doc.canvas.effects,
          [kind]: value,
        },
      }),
    )
    markProjectPreviewDirty()
  }

  function projectTarget() {
    return {
      projectId: currentProjectId.value,
      projectDir: projectDir.value.trim() || undefined,
    }
  }

  function reconcileMaskEditTarget() {
    const target = maskEditTarget.value
    if (!target || target.kind === 'background') return
    if (selectedLayerId.value !== target.layerId) maskEditTarget.value = undefined
  }

  function updateLayerWithMaskSync(doc: HandoutDocument, layerId: string, patch: LayerPatch) {
    const layer = doc.layers.find((item) => item.id === layerId)
    if (!layer) return doc
    const next = updateLayer(doc, layerId, patch)
    if (!layer.mask || maskEditTarget.value?.kind === 'layer' && maskEditTarget.value.layerId === layerId) return next
    const nextLayer = next.layers.find((item) => item.id === layerId)
    if (!nextLayer?.mask) return next
    const dx = (nextLayer.x ?? layer.x) - layer.x
    const dy = (nextLayer.y ?? layer.y) - layer.y
    const widthRatio = layer.width ? nextLayer.width / layer.width : 1
    const heightRatio = layer.height ? nextLayer.height / layer.height : 1
    const syncedMask = {
      ...nextLayer.mask,
      x: nextLayer.mask.x + dx,
      y: nextLayer.mask.y + dy,
      scaleX: nextLayer.mask.scaleX * (Number.isFinite(widthRatio) ? widthRatio : 1),
      scaleY: nextLayer.mask.scaleY * (Number.isFinite(heightRatio) ? heightRatio : 1),
      rotation: nextLayer.mask.rotation + (nextLayer.rotation - layer.rotation),
      flipX: nextLayer.flipX === layer.flipX ? nextLayer.mask.flipX : !nextLayer.mask.flipX,
      updatedAt: new Date().toISOString(),
    }
    return setLayerMask(next, layerId, syncedMask)
  }

  function newMask(input: Partial<LayerMask> = {}): LayerMask {
    const id = input.id || crypto.randomUUID()
    return createCanvasLayerMask(document.value.canvas, {
      id,
      highResPath: `masks/${id}.png`,
      previewPath: `masks/${id}.preview.png`,
      previewScale: 1,
      ...input,
    })
  }

  function addMaskToLayer(layerId: string) {
    if (!appConfiguration.mask.enabled) return
    const layer = document.value.layers.find((item) => item.id === layerId)
    if (!layer) return
    const mask = newMask({ layerId })
    void appendDebugLog('mask', 'add-layer-mask-start', {
      layerId,
      maskId: mask.id,
      width: mask.width,
      height: mask.height,
    })
    const startedAt = performance.now()
    maskDataUrls.value[mask.id] = createSolidMaskDataUrl(mask.width, mask.height)
    void appendDebugLog('mask', 'add-layer-mask-dataurl-created', {
      layerId,
      maskId: mask.id,
      dataUrlLength: maskDataUrls.value[mask.id]?.length || 0,
      durationMs: Math.round(performance.now() - startedAt),
    })
    commit((doc) => setLayerMask(doc, layerId, mask))
  }

  function editLayerMask(layerId: string) {
    if (!appConfiguration.mask.enabled) return
    const layer = document.value.layers.find((item) => item.id === layerId)
    if (!layer) return
    if (!layer.mask) addMaskToLayer(layerId)
    maskEditTarget.value = { kind: 'layer', layerId }
  }

  function addMaskToSelectedLayer() {
    if (!appConfiguration.mask.enabled) return
    const layer = selectedLayer.value
    if (!layer) return
    addMaskToLayer(layer.id)
  }

  function addBackgroundMask() {
    if (!appConfiguration.mask.enabled) return
    const mask = newMask()
    maskDataUrls.value[mask.id] = createSolidMaskDataUrl(mask.width, mask.height)
    commit((doc) => setBackgroundMask(doc, mask))
  }

  function editBackgroundMask() {
    if (!appConfiguration.mask.enabled) return
    if (!document.value.canvas.backgroundMask) addBackgroundMask()
    maskEditTarget.value = { kind: 'background' }
  }

  function exitMaskEdit() {
    maskEditTarget.value = undefined
  }

  function setSelectedLayerMaskEnabled(enabled: boolean) {
    if (!appConfiguration.mask.enabled) return
    const layer = selectedLayer.value
    if (!layer?.mask) return
    commit((doc) => setLayerMaskEnabled(doc, layer.id, enabled))
  }

  function patchLayerMask(layerId: string, patch: Partial<LayerMask>) {
    if (!appConfiguration.mask.enabled) return
    const layer = document.value.layers.find((item) => item.id === layerId)
    if (!layer?.mask) return
    commit((doc) => setLayerMask(doc, layerId, {
      ...layer.mask!,
      ...patch,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    }))
    markLayerDirty(layerId, 'mask-changed')
  }

  function setMaskCacheMeta(maskId: string, cache: MaskCacheMeta) {
    if (!appConfiguration.mask.enabled) return
    const updateMask = (mask: LayerMask) => ({
      ...mask,
      cache,
      previewPath: cache.preview1200Path ?? null,
      previewUpdatedAt: cache.updatedAt,
    })
    let next = document.value
    if (next.canvas.backgroundMask?.id === maskId) {
      next = setBackgroundMask(next, updateMask(next.canvas.backgroundMask))
    }
    for (const layer of next.layers) {
      if (layer.mask?.id === maskId) next = setLayerMask(next, layer.id, updateMask(layer.mask))
    }
    if (next !== document.value) history.value.replace(normalizeHandoutDocument(next))
  }

  async function saveMaskCache(mask: LayerMask, dataUrl: string, maxEdge: number) {
    if (!appConfiguration.mask.enabled) return undefined
    const target = projectTarget()
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
    const mask = document.value.canvas.backgroundMask
    if (!mask) return
    commit((doc) => setBackgroundMask(doc, { ...mask, enabled }))
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
    const layer = selectedLayer.value
    if (!layer?.mask) return
    const updatedAt = new Date().toISOString()
    maskDataUrls.value[layer.mask.id] = createSolidMaskDataUrl(layer.mask.width, layer.mask.height)
    commit((doc) => clearLayerMask(doc, layer.id, updatedAt))
  }

  function clearCanvasBackgroundMask() {
    if (!appConfiguration.mask.enabled) return
    const mask = document.value.canvas.backgroundMask
    if (!mask) return
    const updatedAt = new Date().toISOString()
    maskDataUrls.value[mask.id] = createSolidMaskDataUrl(mask.width, mask.height)
    commit((doc) => clearBackgroundMask(doc, updatedAt))
  }

  function deleteSelectedLayerMask() {
    if (!appConfiguration.mask.enabled) return
    const layer = selectedLayer.value
    if (!layer?.mask) return
    queueMaskFilesForDeletion(layer.mask)
    delete maskDataUrls.value[layer.mask.id]
    if (maskEditTarget.value?.kind === 'layer' && maskEditTarget.value.layerId === layer.id) exitMaskEdit()
    commit((doc) => deleteLayerMask(doc, layer.id))
  }

  function deleteLayerMaskById(layerId: string) {
    if (!appConfiguration.mask.enabled) return
    const layer = document.value.layers.find((item) => item.id === layerId)
    if (!layer?.mask) return
    queueMaskFilesForDeletion(layer.mask)
    delete maskDataUrls.value[layer.mask.id]
    if (maskEditTarget.value?.kind === 'layer' && maskEditTarget.value.layerId === layer.id) exitMaskEdit()
    commit((doc) => deleteLayerMask(doc, layer.id))
  }

  function deleteCanvasBackgroundMask() {
    if (!appConfiguration.mask.enabled) return
    const mask = document.value.canvas.backgroundMask
    if (!mask) return
    queueMaskFilesForDeletion(mask)
    delete maskDataUrls.value[mask.id]
    if (maskEditTarget.value?.kind === 'background') exitMaskEdit()
    commit((doc) => deleteBackgroundMask(doc))
  }

  async function moveOrCopyLayerMask(sourceLayerId: string, targetLayerId: string, copy = false) {
    if (!appConfiguration.mask.enabled) return
    if (sourceLayerId === targetLayerId) return
    const source = document.value.layers.find((item) => item.id === sourceLayerId)
    const target = document.value.layers.find((item) => item.id === targetLayerId)
    if (!source?.mask || !target) return
    const sourceDataUrl = await loadMaskDataUrl(source.mask)
    queueMaskFilesForDeletion(target.mask)
    if (copy) {
      const nextMaskId = crypto.randomUUID()
      maskDataUrls.value[nextMaskId] = sourceDataUrl
      commit((doc) => copyLayerMask(doc, sourceLayerId, targetLayerId, nextMaskId))
      return
    }
    maskDataUrls.value[source.mask.id] = sourceDataUrl
    commit((doc) => transferLayerMask(doc, sourceLayerId, targetLayerId))
    if (maskEditTarget.value?.kind === 'layer' && maskEditTarget.value.layerId === sourceLayerId) {
      maskEditTarget.value = { kind: 'layer', layerId: targetLayerId }
    }
  }

  async function applyMaskStroke(maskId: string, stroke: PaintStroke) {
    if (!appConfiguration.mask.enabled) return
    const currentMask = document.value.canvas.backgroundMask?.id === maskId
      ? document.value.canvas.backgroundMask
      : document.value.layers.find((item) => item.mask?.id === maskId)?.mask
    if (!currentMask) return
    const current = await loadMaskDataUrl(currentMask)
    const nextDataUrl = await drawMaskStroke(current, currentMask.width, currentMask.height, stroke)
    maskDataUrls.value[currentMask.id] = nextDataUrl
    const nextMask = {
      ...currentMask,
      path: currentMask.path || currentMask.highResPath || `masks/${currentMask.id}.png`,
      highResPath: currentMask.highResPath || currentMask.path || `masks/${currentMask.id}.png`,
      cache: null,
      previewPath: null,
      previewUpdatedAt: null,
      sourceVersion: currentMask.sourceVersion + 1,
      version: currentMask.version + 1,
      updatedAt: new Date().toISOString(),
    }
    queueMaskPreviewFilesForDeletion(currentMask)
    if (document.value.canvas.backgroundMask?.id === currentMask.id) {
      commit((doc) => setBackgroundMask(doc, nextMask))
      return
    }
    const layer = document.value.layers.find((item) => item.mask?.id === currentMask.id)
    if (layer) {
      commit((doc) => setLayerMask(doc, layer.id, nextMask))
      markLayerDirty(layer.id, 'mask-changed')
    }
  }

  async function paintMask(mask: LayerMask, stroke: PaintStroke) {
    if (!appConfiguration.mask.enabled) return
    const previous = maskPaintQueues.get(mask.id) ?? Promise.resolve()
    const next = previous.then(() => applyMaskStroke(mask.id, stroke))
    maskPaintQueues.set(mask.id, next.catch(() => undefined))
    await next
  }

  async function loadMaskDataUrl(mask: LayerMask) {
    if (!appConfiguration.mask.enabled) return createSolidMaskDataUrl(mask.width, mask.height)
    const existing = maskDataUrls.value[mask.id]
    if (existing) return existing
    if (mask.path) {
      try {
        const dataUrl = await readProjectFileDataUrl(projectTarget(), mask.path, 'image/png')
        maskDataUrls.value[mask.id] = dataUrl
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
    maskDataUrls.value[mask.id] = fallback
    return fallback
  }

  async function persistProjectMasks() {
    if (!appConfiguration.mask.enabled) return
    const target = projectTarget()
    if (!target.projectId && !target.projectDir) return
    for (const relativePath of deletedMaskPaths.value.splice(0)) {
      await deleteProjectMask(target, relativePath)
    }
    let nextDocument = document.value
    const saveOne = async (mask: LayerMask) => {
      const dataUrl = maskDataUrls.value[mask.id]
      if (!dataUrl) return mask
      const path = await saveProjectMask(target, mask.id, dataUrl)
      const updatedAt = new Date().toISOString()
      return {
        ...mask,
        path,
        highResPath: path,
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
    if (nextDocument !== document.value) {
      history.value.replace(normalizeHandoutDocument(nextDocument))
    }
  }

  function renameDocument(title: string) {
    commit((doc) => ({
      ...doc,
      title,
      updatedAt: new Date().toISOString(),
    }))
  }

  function replaceDocument(next: HandoutDocument, dir?: string) {
    const normalized = normalizeHandoutDocument(next)
    history.value.replace(normalized)
    mergeProjectAssetsIntoLibrary(normalized)
    selectedLayerId.value = undefined
    selectedLayerIds.value = []
    if (dir !== undefined) projectDir.value = dir
  }

  function replaceDocumentWithoutHistory(next: HandoutDocument) {
    const normalized = normalizeHandoutDocument(next)
    history.value.replace(normalized)
    mergeProjectAssetsIntoLibrary(normalized)
    selectedLayerId.value = undefined
    selectedLayerIds.value = []
  }

  function mergeProjectAssetsIntoLibrary(doc: HandoutDocument) {
    const projectAssets = doc.projectAssets ?? []
    if (!projectAssets.length) return
    const existing = new Set(library.value.assets.map((asset) => asset.id))
    const nextAssets = [...library.value.assets]
    for (const asset of projectAssets) {
      if (existing.has(asset.id)) continue
      nextAssets.push(asset as LibraryRecord)
      existing.add(asset.id)
    }
    library.value = { ...library.value, assets: nextAssets }
  }

  function registerProjectAsset(asset: LibraryRecord) {
    const exists = document.value.projectAssets?.some((item) => item.id === asset.id)
    const nextDocument = exists
      ? document.value
      : {
          ...document.value,
          projectAssets: [...(document.value.projectAssets ?? []), asset],
          updatedAt: new Date().toISOString(),
        }
    history.value.replace(normalizeHandoutDocument(nextDocument))
    mergeProjectAssetsIntoLibrary(nextDocument)
  }

  function flattenSelectedLayersToImage(asset: LibraryRecord, bounds: FlattenedLayerBounds) {
    const ids = selectedLayerIds.value.length ? selectedLayerIds.value : selectedLayerId.value ? [selectedLayerId.value] : []
    if (!ids.length) return
    const next = flattenLayersToImage(document.value, ids, asset.id, `flat-${asset.name.replace(/\.[^.]+$/, '')}`, bounds)
    history.value.replace(normalizeHandoutDocument(next))
    const inserted = next.layers.find((layer) => layer.type === 'image' && layer.assetId === asset.id)
    selectedLayerId.value = inserted?.id
    selectedLayerIds.value = inserted ? [inserted.id] : []
  }

  function undo() {
    endContinuousEdit()
    history.value.undo()
  }

  function redo() {
    endContinuousEdit()
    history.value.redo()
  }

  function scheduleFontPreviews() {
    const run = () => { void ensureFontPreviews() }
    const win = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number }
    if (win.requestIdleCallback) win.requestIdleCallback(run, { timeout: 1500 })
    else window.setTimeout(run, 250)
  }

  async function refreshLibrary() {
    library.value = await getLibrary()
    scheduleFontPreviews()
  }

  async function repairLibraryThumbnails() {
    library.value = await repairMissingThumbnails()
    scheduleFontPreviews()
  }

  async function refreshProjects() {
    const [nextProjects, nextFolders] = await Promise.all([listProjects(), listProjectFolders()])
    projects.value = nextProjects
    projectFolders.value = nextFolders
  }

  async function importAssetFile(file: File, tagText: string, folder = '') {
    const result = await importAsset(file, tagList(tagText), folder)
    library.value = result.library
    status.value = `Imported asset ${result.record.name}`
    return result.record
  }

  async function importBackgroundFile(file: File, tagText: string, folder = '') {
    const result = await importBackground(file, tagList(tagText), folder)
    library.value = result.library
    status.value = `Imported background ${result.record.name}`
    return result.record
  }

  async function importFontFile(file: File, tagText: string, folder = '') {
    const result = await importFont(file, tagList(tagText), folder)
    library.value = result.library
    await loadFont(result.record)
    await createFontPreview(result.record)
    status.value = `Imported font ${result.record.name}`
    return result.record
  }

  async function createResourceFolder(kind: 'background' | 'asset' | 'font', folder: string) {
    library.value = await createLibraryFolder(kind, folder)
    status.value = `Created ${kind} folder ${folder.trim()}`
  }

  async function addProjectFolder(folder: string) {
    projectFolders.value = await createProjectFolder(folder)
    status.value = `Created handout folder ${folder.trim()}`
  }

  async function renameResource(kind: 'background' | 'asset' | 'font', id: string, name: string) {
    library.value = await renameLibraryRecord(kind, id, name)
    status.value = `Renamed ${kind} to ${name.trim()}`
  }

  async function renameResourceFolder(kind: 'background' | 'asset' | 'font', oldFolder: string, newFolder: string) {
    library.value = await renameLibraryFolder(kind, oldFolder, newFolder)
    status.value = `Renamed folder ${oldFolder} to ${newFolder.trim()}`
  }

  async function moveResourceToFolder(kind: 'background' | 'asset' | 'font', id: string, folder: string) {
    library.value = await moveLibraryRecord(kind, id, folder)
    status.value = `Moved ${kind} to ${folder.trim() || 'root'}`
  }

  async function renameProjectFolderPath(oldFolder: string, newFolder: string) {
    projectFolders.value = await renameProjectFolder(oldFolder, newFolder)
    await refreshProjects()
    status.value = `Renamed folder ${oldFolder} to ${newFolder.trim()}`
  }

  async function renameProject(projectId: string, title: string) {
    const payload = await renameManagedProject(projectId, title)
    if (currentProjectId.value === projectId) replaceDocument(payload.document)
    await refreshProjects()
    status.value = `Renamed project to ${title.trim()}`
  }

  async function moveProjectToFolder(projectId: string, folder: string) {
    const payload = await moveManagedProject(projectId, folder)
    if (currentProjectId.value === projectId) replaceDocument(payload.document)
    await refreshProjects()
    status.value = `Moved project to ${folder.trim() || 'root'}`
  }

  async function deleteResourceEntries(kind: 'background' | 'asset' | 'font', entries: { ids: string[]; folders: string[] }) {
    library.value = await deleteLibraryEntries(kind, entries)
    status.value = `Deleted ${kind} item${entries.ids.length + entries.folders.length === 1 ? '' : 's'}`
  }

  async function deleteProjectEntriesFromLibrary(entries: { ids: string[]; folders: string[] }) {
    projectFolders.value = await deleteProjectEntries(entries)
    if (currentProjectId.value && entries.ids.includes(currentProjectId.value)) closeEditor({ save: false })
    await refreshProjects()
    status.value = `Deleted handout item${entries.ids.length + entries.folders.length === 1 ? '' : 's'}`
  }

  async function loadFont(font: LibraryRecord) {
    if (!font.path || !('FontFace' in window)) {
      logText('font-load-skipped', {
        id: font.id,
        name: font.name,
        path: font.path,
        hasFontFace: 'FontFace' in window,
      })
      return
    }
    const family = fontFamily(font)
    const source = fileUrl(font.path)
    logText('font-load-start', {
      id: font.id,
      name: font.name,
      family,
      recordFamily: font.fontFamily,
      mediaType: font.mediaType,
      source,
    })
    try {
      const face = new FontFace(family, `url("${source}")`)
      await face.load()
      globalThis.document.fonts.add(face)
      logText('font-load-success', {
        id: font.id,
        name: font.name,
        family,
        recordFamily: font.fontFamily,
        status: face.status,
        check: globalThis.document.fonts.check(`16px "${family}"`),
      })
    } catch (error) {
      logText('font-load-failed', {
        id: font.id,
        name: font.name,
        family,
        error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
      })
      throw error
    }
  }

  async function createFontPreview(font: LibraryRecord) {
    try {
      const dataUrl = await generateFontPreviewDataUrl(font)
      library.value = await saveFontPreview(font.id, dataUrl)
      logText('font-preview-saved', {
        id: font.id,
        name: font.name,
        dataUrlBytes: Math.round((dataUrl.length * 3) / 4),
      })
    } catch (error) {
      logText('font-preview-failed', {
        id: font.id,
        name: font.name,
        error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      })
    }
  }

  async function ensureFontPreviews() {
    for (const font of library.value.fonts) {
      if (font.thumbnailPath) continue
      await createFontPreview(font)
    }
  }

  async function saveCurrentProject() {
    await persistProjectMasks()
    if (currentProjectId.value) {
      await saveManagedProject(currentProjectId.value, document.value)
      await refreshProjects()
      status.value = `Saved project ${document.value.title}`
      return true
    }
    if (!projectDir.value.trim()) {
      status.value = 'Set a project folder path before saving.'
      return false
    }
    await saveProject(projectDir.value.trim(), document.value)
    status.value = `Saved project to ${projectDir.value.trim()}`
    return true
  }

  async function saveProjectDocumentSnapshot() {
    try {
      if (currentProjectId.value) {
        await saveManagedProject(currentProjectId.value, document.value)
        return true
      }
      if (projectDir.value.trim()) {
        await saveProject(projectDir.value.trim(), document.value)
        return true
      }
    } catch (error) {
      void appendDebugLog('mask', 'save-mask-cache-document-failed', {
        error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      })
    }
    return false
  }

  async function openProjectFromPath(path: string) {
    const payload = await openProject(path.trim())
    replaceDocument(payload.document, path.trim())
    currentProjectId.value = undefined
    view.value = 'editor'
    status.value = `Opened project from ${path.trim()}`
  }

  async function createManagedHandout(
    title: string,
    options?: {
      width?: number
      height?: number
      backgroundId?: string
      folder?: string
    },
  ) {
    const next = createDefaultHandout(title.trim() || 'Untitled handout')
    if (options?.width && options?.height) {
      next.canvas.width = Math.max(1, Math.round(options.width))
      next.canvas.height = Math.max(1, Math.round(options.height))
    }
    if (options?.backgroundId) {
      next.canvas.backgroundAssetId = options.backgroundId
    }
    const payload = await createProject(next.title, next, options?.folder ?? '')
    replaceDocument(payload.document)
    currentProjectId.value = String(payload.metadata.id ?? '')
    view.value = 'editor'
    await refreshProjects()
    status.value = `Created project ${payload.document.title}`
  }

  function nextProjectCloneTitle(title: string, folder: string) {
    const base = (title.trim() || 'Untitled handout').replace(/-\d+$/, '')
    const used = new Set(
      projects.value
        .filter((project) => (project.folder || '') === (folder || ''))
        .map((project) => project.title),
    )
    for (let index = 2; index < 10000; index += 1) {
      const candidate = `${base}-${index}`
      if (!used.has(candidate)) return candidate
    }
    return `${base}-${Date.now()}`
  }

  async function cloneManagedHandout(projectId: string) {
    const project = projects.value.find((item) => item.id === projectId)
    if (!project) return
    const payload = await openManagedProject(projectId)
    const title = nextProjectCloneTitle(project.title, project.folder)
    const document = {
      ...payload.document,
      id: crypto.randomUUID(),
      title,
      updatedAt: new Date().toISOString(),
    }
    const cloned = await createProject(title, document, project.folder)
    const targetProjectId = String(cloned.metadata.id ?? '')
    if (targetProjectId) await copyProjectMasks(projectId, targetProjectId)
    await refreshProjects()
    status.value = `Cloned project ${title}`
  }

  async function openManagedHandout(projectId: string) {
    const payload = await openManagedProject(projectId)
    replaceDocument(payload.document)
    currentProjectId.value = projectId
    view.value = 'editor'
    status.value = `Opened project ${payload.document.title}`
  }

  async function closeEditor(options: { save?: boolean } = {}) {
    if (options.save !== false && (currentProjectId.value || projectDir.value.trim())) {
      await saveCurrentProject()
    }
    selectedLayerId.value = undefined
    selectedLayerIds.value = []
    view.value = 'manager'
  }

  function resolveAsset(assetId?: string) {
    return library.value.assets.find((asset) => asset.id === assetId)
      || document.value.projectAssets?.find((asset) => asset.id === assetId) as LibraryRecord | undefined
  }

  function resolveBackground(backgroundId?: string) {
    return library.value.backgrounds.find((background) => background.id === backgroundId)
  }

  function resolveFont(fontId?: string) {
    return library.value.fonts.find((font) => font.id === fontId)
  }

  return {
    addPaint,
    addLayerFromAsset,
    addLayerFromAssetAt,
    addShape,
    addText,
    applyOrCreateTextWithFont,
    addProjectFolder,
    canRedo,
    canUndo,
    deleteSelectedLayer,
    dirtyFlags,
    document,
    closeEditor,
    cloneManagedHandout,
    createManagedHandout,
    createResourceFolder,
    currentProjectId,
    importBackgroundFile,
    importAssetFile,
    importFontFile,
    groups,
    latestProjects,
    layers,
    library,
    moveProjectToFolder,
    moveResourceToFolder,
    moveSelectedLayer,
    moveLayerToIndex,
    moveGroupToIndex,
    moveLayerOutOfGroupToIndex,
    moveSelectedLayersOutOfGroup,
    openManagedHandout,
    openProjectFromPath,
    appendStrokeToPaintLayer,
    addMaskToLayer,
    addMaskToSelectedLayer,
    addBackgroundMask,
    setSelectedLayerMaskEnabled,
    patchLayerMask,
    setBackgroundMaskEnabled,
    setMaskCacheMeta,
    saveMaskCache,
    saveProjectDocumentSnapshot,
    clearSelectedLayerMask,
    clearCanvasBackgroundMask,
    deleteSelectedLayerMask,
    deleteLayerMaskById,
    deleteCanvasBackgroundMask,
    moveOrCopyLayerMask,
    paintMask,
    loadMaskDataUrl,
    maskDataUrls,
    maskEditTarget,
    editLayerMask,
    editBackgroundMask,
    exitMaskEdit,
    patchLayer,
    patchLayerContinuous,
    patchCanvas,
    patchCanvasEffectContinuous,
    patchSelectedLayerEffect,
    patchSelectedLayerEffectContinuous,
    patchSelectedLayer,
    patchSelectedLayers,
    patchSelectedLayersContinuous,
    projects,
    projectFolders,
    projectDir,
    redo,
    repairLibraryThumbnails,
    renameDocument,
    renameProject,
    renameProjectFolderPath,
    renameResource,
    renameResourceFolder,
    deleteProjectEntriesFromLibrary,
    deleteResourceEntries,
    refreshLibrary,
    refreshProjects,
    mergeSelectedLayersIntoGroup,
    replaceDocument,
    replaceDocumentWithoutHistory,
    registerProjectAsset,
    flattenSelectedLayersToImage,
    resolveAsset,
    resolveBackground,
    resolveFont,
    selectLayer,
    selectedLayer,
    selectedLayerId,
    selectedLayerIds,
    selectedLayers,
    setLayerSelection,
    setBackground,
    status,
    toolSettings,
    patchToolSettings,
    toggleLayerSelection,
    toggleGroupVisibility,
    ungroupGroup,
    addLayerToGroupAt,
    undo,
    view,
    endContinuousEdit,
    saveCurrentProject,
  }
})

export function isImageLayer(layer?: HandoutLayer): layer is ImageLayer {
  return layer?.type === 'image'
}

export function isTextLayer(layer?: HandoutLayer): layer is TextLayer {
  return layer?.type === 'text'
}

export function isShapeLayer(layer?: HandoutLayer): layer is ShapeLayer {
  return layer?.type === 'shape'
}

export function isPaintLayer(layer?: HandoutLayer): layer is PaintLayer {
  return layer?.type === 'paint'
}
