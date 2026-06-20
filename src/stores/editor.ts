import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

import {
  addImageLayer,
  addPaintLayer,
  addShapeLayer,
  addTextLayer,
  appendPaintStroke,
  createDefaultHandout,
  moveLayer,
  normalizeHandoutDocument,
  removeLayer,
  updateCanvas,
  updateLayer,
  type HandoutDocument,
  type HandoutLayer,
  type ImageLayer,
  type LayerEffects,
  type LayerPatch,
  type PaintLayer,
  type PaintStroke,
  type ShapeKind,
  type ShapeLayer,
  type TextLayer,
} from '@/lib/handout'
import { createHistory } from '@/lib/history'
import {
  emptyLibrary,
  appendDebugLog,
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
  saveManagedProject,
  saveProject,
  type LibraryIndex,
  type LibraryRecord,
  type ProjectSummary,
} from '@/lib/backend'

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

  const document = computed(() => history.value.current)
  const layers = computed(() => [...document.value.layers].sort((a, b) => b.zIndex - a.zIndex))
  const latestProjects = computed(() => projects.value)
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
  }

  function setLayerSelection(layerIds: string[]) {
    const existing = new Set(document.value.layers.map((layer) => layer.id))
    selectedLayerIds.value = layerIds.filter((id, index) => existing.has(id) && layerIds.indexOf(id) === index)
    selectedLayerId.value = selectedLayerIds.value.at(-1)
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
    const firstFont = font ?? library.value.fonts[0]
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
    if (targetId) selectLayer(targetId)
  }

  function applyOrCreateTextWithFont(font: LibraryRecord, position?: { x?: number; y?: number }) {
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
    commit((doc) => updateLayer(doc, id, patch))
  }

  function patchSelectedLayers(patch: LayerPatch) {
    const ids = selectedLayerIds.value
    if (!ids.length) return
    commit((doc) => ids.reduce((next, id) => updateLayer(next, id, patch), doc))
  }

  function patchSelectedLayersContinuous(key: string, patch: LayerPatch) {
    const ids = selectedLayerIds.value
    if (!ids.length) return
    commitContinuous(key, (doc) => ids.reduce((next, id) => updateLayer(next, id, patch), doc))
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
  }

  function patchLayer(layerId: string, patch: LayerPatch) {
    commit((doc) => updateLayer(doc, layerId, patch))
  }

  function patchLayerContinuous(layerId: string, key: string, patch: LayerPatch) {
    commitContinuous(key, (doc) => updateLayer(doc, layerId, patch))
  }

  function deleteSelectedLayer() {
    const ids = selectedLayerIds.value.length ? selectedLayerIds.value : selectedLayerId.value ? [selectedLayerId.value] : []
    if (!ids.length) return
    commit((doc) => ids.reduce((next, id) => removeLayer(next, id), doc))
    selectedLayerId.value = undefined
    selectedLayerIds.value = []
  }

  function moveSelectedLayer(delta: number) {
    const layer = selectedLayer.value
    if (!layer) return
    commit((doc) => moveLayer(doc, layer.id, layer.zIndex + delta))
  }

  function moveLayerToIndex(layerId: string, targetIndex: number) {
    commit((doc) => moveLayer(doc, layerId, targetIndex))
  }

  function setBackground(background?: LibraryRecord) {
    commit((doc) => updateCanvas(doc, { backgroundAssetId: background?.id }))
  }

  function patchCanvas(canvas: Partial<HandoutDocument['canvas']>) {
    commit((doc) => updateCanvas(doc, canvas))
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
  }

  function renameDocument(title: string) {
    commit((doc) => ({
      ...doc,
      title,
      updatedAt: new Date().toISOString(),
    }))
  }

  function replaceDocument(next: HandoutDocument, dir?: string) {
    history.value.replace(normalizeHandoutDocument(next))
    selectedLayerId.value = undefined
    selectedLayerIds.value = []
    if (dir !== undefined) projectDir.value = dir
  }

  function undo() {
    endContinuousEdit()
    history.value.undo()
  }

  function redo() {
    endContinuousEdit()
    history.value.redo()
  }

  async function refreshLibrary() {
    library.value = await getLibrary()
    await loadFonts()
  }

  async function repairLibraryThumbnails() {
    library.value = await repairMissingThumbnails()
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

  async function loadFonts() {
    await Promise.allSettled(library.value.fonts.map((font) => loadFont(font)))
  }

  async function saveCurrentProject() {
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
    await createProject(title, document, project.folder)
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
    document,
    closeEditor,
    cloneManagedHandout,
    createManagedHandout,
    createResourceFolder,
    currentProjectId,
    importBackgroundFile,
    importAssetFile,
    importFontFile,
    latestProjects,
    layers,
    library,
    moveProjectToFolder,
    moveResourceToFolder,
    moveSelectedLayer,
    moveLayerToIndex,
    openManagedHandout,
    openProjectFromPath,
    appendStrokeToPaintLayer,
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
    replaceDocument,
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
    toggleLayerSelection,
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
