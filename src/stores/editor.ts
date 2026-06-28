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
  createDefaultHandout,
  flattenLayersToImage,
  moveLayer,
  moveLayerGroup,
  moveLayerInGroupAware,
  moveLayerOutOfGroup,
  normalizeHandoutDocument,
  removeLayer,
  setLayerGroupVisibility,
  ungroupLayerGroup,
  updateCanvas,
  updateLayer,
  type HandoutDocument,
  type HandoutLayer,
  type FlattenedLayerBounds,
  type BrushKind,
  type ImageLayer,
  type LayerEffects,
  type LayerPatch,
  type PaintLayer,
  type PaintStroke,
  type ShapeKind,
  type ShapeLayer,
  type TextLayer,
} from '@/lib/handout'
import { setLayerMask } from '@/lib/handout'
import { syncMaskWithLayerDelta } from '@/lib/mask-geometry'
import { createDirtyFlags, markLayerDirty as markDirtyFlag, markProjectPreviewDirty as markProjectDirtyFlag, type DirtyReason } from '@/lib/handout/dirty'
import { createHistory } from '@/lib/history'
import { appendDebugLog, emptyLibrary, fontRecordFamily, type LibraryIndex, type LibraryRecord } from '@/lib/backend'

import { createFontStore } from './editor/font-store'
import { createLibraryStore } from './editor/library-store'
import { createMaskStore } from './editor/mask-store'
import { createProjectStore } from './editor/project-store'

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
  const library = ref<LibraryIndex>(emptyLibrary())
  const status = ref('Ready')
  const continuousEditKey = ref<string>()
  const lastTextFontId = ref<string>()
  const toolSettings = ref({
    brushColor: '#111827',
    brushKind: 'pixel' as BrushKind,
    brushWidth: 6,
    brushOpacity: 1,
    eraserWidth: 12,
    eraserOpacity: 1,
    brushTension: 0.35,
  })
  const dirtyFlags = shallowRef(createDirtyFlags())

  const document = computed(() => history.value.current)
  const layers = computed(() => [...document.value.layers].sort((a, b) => b.zIndex - a.zIndex))
  const groups = computed(() => document.value.groups ?? [])
  const selectedLayer = computed<HandoutLayer | undefined>(() =>
    document.value.layers.find((layer) => layer.id === selectedLayerId.value),
  )
  const selectedLayers = computed<HandoutLayer[]>(() =>
    selectedLayerIds.value
      .map((id) => document.value.layers.find((layer) => layer.id === id))
      .filter((layer): layer is HandoutLayer => Boolean(layer)),
  )
  const canUndo = computed(() => history.value.canUndo.value)
  const canRedo = computed(() => history.value.canRedo.value)

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
    toolSettings.value = { ...toolSettings.value, ...patch }
  }

  function dirtyReasonForLayerPatch(patch: LayerPatch): DirtyReason {
    if ('effects' in patch) return 'effect-changed'
    if ('visible' in patch || 'opacity' in patch || 'blendMode' in patch) return 'visibility-changed'
    if (
      'x' in patch || 'y' in patch || 'width' in patch || 'height' in patch
      || 'rotation' in patch || 'flipX' in patch
    ) return 'transform-changed'
    return 'source-changed'
  }

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

  // --- 子 store 组装（在核心方法之后，因为依赖 commit/markLayerDirty/projectTarget） ---
  const fontStore = createFontStore({ library })
  const libraryStore = createLibraryStore({ library, status, document, fontStore })

  // projectTarget 依赖 projectStore 的 projectDir/currentProjectId，但 projectStore 又依赖 replaceDocument
  // 解决：projectStore 暴露 projectDir/currentProjectId ref，projectTarget 读取它们的 .value
  // 先创建一个占位 replaceDocument，待 projectStore 创建后再用真正的
  // 更简洁：projectTarget 直接读 projectStore 的 ref
  // 但 projectStore 创建时需要 replaceDocument... 用函数声明提升
  const maskStore = createMaskStore({
    document,
    commit,
    history,
    markLayerDirty,
    projectTarget: () => projectTarget(),
    selectedLayer,
    selectedLayerId,
  })

  function replaceDocument(next: HandoutDocument, dir?: string) {
    const normalized = normalizeHandoutDocument(next)
    history.value.replace(normalized)
    libraryStore.mergeProjectAssetsIntoLibrary(normalized)
    selectedLayerId.value = undefined
    selectedLayerIds.value = []
    if (dir !== undefined) projectDir.value = dir
  }

  function replaceDocumentWithoutHistory(next: HandoutDocument) {
    const normalized = normalizeHandoutDocument(next)
    history.value.replace(normalized)
    libraryStore.mergeProjectAssetsIntoLibrary(normalized)
    selectedLayerId.value = undefined
    selectedLayerIds.value = []
  }

  const projectStore = createProjectStore({
    document,
    replaceDocument,
    selectedLayerId,
    selectedLayerIds,
    status,
    persistProjectMasks: maskStore.persistProjectMasks,
  })

  // 从 projectStore 解构 state，供核心 projectTarget 使用
  const { projectDir, currentProjectId } = projectStore

  function projectTarget() {
    return {
      projectId: currentProjectId.value,
      projectDir: projectDir.value.trim() || undefined,
    }
  }

  function updateLayerWithMaskSync(doc: HandoutDocument, layerId: string, patch: LayerPatch) {
    const layer = doc.layers.find((item) => item.id === layerId)
    if (!layer) return doc
    const next = updateLayer(doc, layerId, patch)
    if (!layer.mask || maskStore.maskEditTarget.value?.kind === 'layer' && maskStore.maskEditTarget.value.layerId === layerId) return next
    const nextLayer = next.layers.find((item) => item.id === layerId)
    if (!nextLayer?.mask) return next
    const syncedMask = {
      ...syncMaskWithLayerDelta(layer, nextLayer, nextLayer.mask),
      x: nextLayer.x,
      y: nextLayer.y,
      scaleX: nextLayer.width / Math.max(1, nextLayer.mask.width),
      scaleY: nextLayer.height / Math.max(1, nextLayer.mask.height),
      rotation: nextLayer.rotation,
      flipX: nextLayer.flipX,
      updatedAt: new Date().toISOString(),
    }
    return setLayerMask(next, layerId, syncedMask)
  }

  function selectLayer(layerId?: string) {
    selectedLayerId.value = layerId
    selectedLayerIds.value = layerId ? [layerId] : []
    maskStore.reconcileMaskEditTarget()
  }

  function setLayerSelection(layerIds: string[]) {
    const existing = new Set(document.value.layers.map((layer) => layer.id))
    selectedLayerIds.value = layerIds.filter((id, index) => existing.has(id) && layerIds.indexOf(id) === index)
    selectedLayerId.value = selectedLayerIds.value.at(-1)
    maskStore.reconcileMaskEditTarget()
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
    const firstFont = font ?? libraryStore.resolveFont(lastTextFontId.value) ?? library.value.fonts[0]
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
    commit((doc) => addShapeLayer(doc, { shape, x: position?.x ?? 180, y: position?.y ?? 160 }))
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
        next = addPaintLayer(next, { width: next.canvas.width, height: next.canvas.height })
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

  /**
   * Toggle flipX on all selected layers, simultaneously negating rotation
   * so the visual orientation stays the same.  scaleX=-1 reverses the
   * visual rotation direction, so the model rotation must be compensated.
   */
  function toggleSelectedLayersFlipX() {
    const ids = selectedLayerIds.value
    if (!ids.length) return
    commit((doc) =>
      ids.reduce((next, id) => {
        const layer = next.layers.find((l) => l.id === id)
        if (!layer) return next
        const newFlipX = !layer.flipX
        // Negate rotation: scaleX=-1 reverses visual rotation direction.
        const newRotation = ((360 - layer.rotation) % 360 + 360) % 360

        // When flipping a rotated image, the rotation origin changes from
        // left-edge to right-edge (or vice versa), shifting the visual center.
        // Compensate x to keep the visual position stable.
        const rad = (layer.rotation * Math.PI) / 180
        const cos = Math.cos(rad)
        const sin = Math.sin(rad)
        let newX = layer.x
        if (newFlipX) {
          // Flipping TO flipped: origin moves from left-edge to right-edge.
          // Right-edge origin at (x+w, y). Compensate for rotation shift.
          newX = Math.round(layer.x + layer.width * cos - layer.height * sin - layer.width)
        } else {
          // Flipping FROM flipped: origin moves back to left-edge.
          // Use the TARGET rotation for compensation.
          const targetRad = (newRotation * Math.PI) / 180
          newX = Math.round(layer.x + layer.width - layer.width * Math.cos(targetRad) + layer.height * Math.sin(targetRad))
        }

        return updateLayerWithMaskSync(next, id, { flipX: newFlipX, rotation: newRotation, x: newX })
      }, doc),
    )
    ids.forEach((id) => markLayerDirty(id, 'transform-changed'))
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
        return updateLayer(next, id, { effects: { ...layer.effects, [kind]: value } })
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
        return updateLayer(next, id, { effects: { ...layer.effects, [kind]: value } })
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
    if (maskStore.maskEditTarget.value?.kind === 'layer' && ids.includes(maskStore.maskEditTarget.value.layerId)) {
      maskStore.maskEditTarget.value = undefined
    }
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
    commit((doc) => moveLayerInGroupAware(doc, layer.id, delta))
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
    commitContinuous(key, (doc) => updateCanvas(doc, { effects: { ...doc.canvas.effects, [kind]: value } }))
    markProjectPreviewDirty()
  }

  function renameDocument(title: string) {
    commit((doc) => ({ ...doc, title, updatedAt: new Date().toISOString() }))
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
    libraryStore.mergeProjectAssetsIntoLibrary(nextDocument)
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

  return {
    // 核心 state
    dirtyFlags,
    document,
    groups,
    layers,
    library,
    selectedLayer,
    selectedLayerId,
    selectedLayerIds,
    selectedLayers,
    status,
    toolSettings,
    canUndo,
    canRedo,
    // 核心方法
    addLayerFromAsset,
    addLayerFromAssetAt,
    addLayerToGroupAt,
    addPaint,
    addShape,
    addText,
    appendStrokeToPaintLayer,
    applyOrCreateTextWithFont,
    commit,
    commitContinuous,
    deleteSelectedLayer,
    endContinuousEdit,
    flattenSelectedLayersToImage,
    mergeSelectedLayersIntoGroup,
    moveGroupToIndex,
    moveLayerOutOfGroupToIndex,
    moveLayerToIndex,
    moveSelectedLayer,
    moveSelectedLayersOutOfGroup,
    patchCanvas,
    patchCanvasEffectContinuous,
    patchLayer,
    patchLayerContinuous,
    patchSelectedLayer,
    patchSelectedLayerEffect,
    patchSelectedLayerEffectContinuous,
    patchSelectedLayers,
    toggleSelectedLayersFlipX,
    patchSelectedLayersContinuous,
    patchToolSettings,
    projectTarget,
    redo,
    registerProjectAsset,
    renameDocument,
    replaceDocument,
    replaceDocumentWithoutHistory,
    selectLayer,
    setBackground,
    setLayerSelection,
    toggleGroupVisibility,
    toggleLayerSelection,
    undo,
    ungroupGroup,
    resolveAsset: libraryStore.resolveAsset,
    resolveBackground: libraryStore.resolveBackground,
    resolveFont: libraryStore.resolveFont,
    // 转发 font store
    scheduleFontPreviews: fontStore.scheduleFontPreviews,
    loadFont: fontStore.loadFont,
    createFontPreview: fontStore.createFontPreview,
    ensureFontPreviews: fontStore.ensureFontPreviews,
    // 转发 library store
    refreshLibrary: libraryStore.refreshLibrary,
    repairLibraryThumbnails: libraryStore.repairLibraryThumbnails,
    importAssetFile: libraryStore.importAssetFile,
    importBackgroundFile: libraryStore.importBackgroundFile,
    importFontFile: libraryStore.importFontFile,
    createResourceFolder: libraryStore.createResourceFolder,
    renameResource: libraryStore.renameResource,
    renameResourceFolder: libraryStore.renameResourceFolder,
    moveResourceToFolder: libraryStore.moveResourceToFolder,
    deleteResourceEntries: libraryStore.deleteResourceEntries,
    // 转发 mask store
    maskDataUrls: maskStore.maskDataUrls,
    maskEditTarget: maskStore.maskEditTarget,
    addMaskToLayer: maskStore.addMaskToLayer,
    addMaskToSelectedLayer: maskStore.addMaskToSelectedLayer,
    addBackgroundMask: maskStore.addBackgroundMask,
    editLayerMask: maskStore.editLayerMask,
    editBackgroundMask: maskStore.editBackgroundMask,
    exitMaskEdit: maskStore.exitMaskEdit,
    setSelectedLayerMaskEnabled: maskStore.setSelectedLayerMaskEnabled,
    patchLayerMask: maskStore.patchLayerMask,
    setMaskCacheMeta: maskStore.setMaskCacheMeta,
    saveMaskCache: maskStore.saveMaskCache,
    setBackgroundMaskEnabled: maskStore.setBackgroundMaskEnabled,
    clearSelectedLayerMask: maskStore.clearSelectedLayerMask,
    clearCanvasBackgroundMask: maskStore.clearCanvasBackgroundMask,
    deleteSelectedLayerMask: maskStore.deleteSelectedLayerMask,
    deleteLayerMaskById: maskStore.deleteLayerMaskById,
    deleteCanvasBackgroundMask: maskStore.deleteCanvasBackgroundMask,
    moveOrCopyLayerMask: maskStore.moveOrCopyLayerMask,
    paintMask: maskStore.paintMask,
    loadMaskDataUrl: maskStore.loadMaskDataUrl,
    // 转发 project store
    projectDir,
    currentProjectId,
    view: projectStore.view,
    projects: projectStore.projects,
    projectFolders: projectStore.projectFolders,
    latestProjects: projectStore.latestProjects,
    refreshProjects: projectStore.refreshProjects,
    addProjectFolder: projectStore.addProjectFolder,
    renameProjectFolderPath: projectStore.renameProjectFolderPath,
    renameProject: projectStore.renameProject,
    moveProjectToFolder: projectStore.moveProjectToFolder,
    deleteProjectEntriesFromLibrary: projectStore.deleteProjectEntriesFromLibrary,
    saveCurrentProject: projectStore.saveCurrentProject,
    saveProjectDocumentSnapshot: projectStore.saveProjectDocumentSnapshot,
    openProjectFromPath: projectStore.openProjectFromPath,
    createManagedHandout: projectStore.createManagedHandout,
    cloneManagedHandout: projectStore.cloneManagedHandout,
    openManagedHandout: projectStore.openManagedHandout,
    closeEditor: projectStore.closeEditor,
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
