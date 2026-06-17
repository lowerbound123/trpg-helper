import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

import {
  addImageLayer,
  addTextLayer,
  createDefaultHandout,
  moveLayer,
  removeLayer,
  updateCanvas,
  updateLayer,
  type HandoutDocument,
  type HandoutLayer,
  type ImageLayer,
  type LayerPatch,
  type TextLayer,
} from '@/lib/handout'
import { createHistory } from '@/lib/history'
import {
  emptyLibrary,
  fileUrl,
  createProject,
  getLibrary,
  importAsset,
  importBackground,
  importFont,
  listProjects,
  openManagedProject,
  openProject,
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

export const useEditorStore = defineStore('editor', () => {
  const history = shallowRef(createHistory(createDefaultHandout('Untitled handout')))
  const selectedLayerId = ref<string>()
  const projectDir = ref('')
  const currentProjectId = ref<string>()
  const view = ref<'manager' | 'editor'>('manager')
  const projects = ref<ProjectSummary[]>([])
  const library = ref<LibraryIndex>(emptyLibrary())
  const status = ref('Ready')

  const document = computed(() => history.value.current)
  const layers = computed(() => [...document.value.layers].sort((a, b) => b.zIndex - a.zIndex))
  const latestProjects = computed(() => projects.value)
  const selectedLayer = computed<HandoutLayer | undefined>(() =>
    document.value.layers.find((layer) => layer.id === selectedLayerId.value),
  )
  const canUndo = computed(() => history.value.canUndo.value)
  const canRedo = computed(() => history.value.canRedo.value)

  function commit(mutator: (document: HandoutDocument) => HandoutDocument) {
    history.value.commit(mutator)
  }

  function selectLayer(layerId?: string) {
    selectedLayerId.value = layerId
  }

  function addLayerFromAsset(asset: LibraryRecord) {
    commit((doc) =>
      addImageLayer(doc, {
        assetId: asset.id,
        name: asset.name,
        x: 120 + doc.layers.length * 20,
        y: 100 + doc.layers.length * 20,
      }),
    )
    selectedLayerId.value = document.value.layers.at(-1)?.id
  }

  function addText() {
    const firstFont = library.value.fonts[0]
    commit((doc) =>
      addTextLayer(doc, {
        text: 'New text',
        fontId: firstFont?.id,
        fontFamily: firstFont?.name?.replace(/\.[^.]+$/, '') || 'Inter',
        x: 180,
        y: 160,
      }),
    )
    selectedLayerId.value = document.value.layers.at(-1)?.id
  }

  function patchSelectedLayer(patch: LayerPatch) {
    const id = selectedLayerId.value
    if (!id) return
    commit((doc) => updateLayer(doc, id, patch))
  }

  function patchLayer(layerId: string, patch: LayerPatch) {
    commit((doc) => updateLayer(doc, layerId, patch))
  }

  function deleteSelectedLayer() {
    const id = selectedLayerId.value
    if (!id) return
    commit((doc) => removeLayer(doc, id))
    selectedLayerId.value = undefined
  }

  function moveSelectedLayer(delta: number) {
    const layer = selectedLayer.value
    if (!layer) return
    commit((doc) => moveLayer(doc, layer.id, layer.zIndex + delta))
  }

  function setBackground(background?: LibraryRecord) {
    commit((doc) => updateCanvas(doc, { backgroundAssetId: background?.id }))
  }

  function patchCanvas(canvas: Partial<HandoutDocument['canvas']>) {
    commit((doc) => updateCanvas(doc, canvas))
  }

  function renameDocument(title: string) {
    commit((doc) => ({
      ...doc,
      title,
      updatedAt: new Date().toISOString(),
    }))
  }

  function replaceDocument(next: HandoutDocument, dir?: string) {
    history.value.replace(next)
    selectedLayerId.value = undefined
    if (dir !== undefined) projectDir.value = dir
  }

  function undo() {
    history.value.undo()
  }

  function redo() {
    history.value.redo()
  }

  async function refreshLibrary() {
    library.value = await getLibrary()
    await loadFonts()
  }

  async function refreshProjects() {
    projects.value = await listProjects()
  }

  async function importAssetFile(file: File, tagText: string) {
    const result = await importAsset(file, tagList(tagText))
    library.value = result.library
    status.value = `Imported asset ${result.record.name}`
  }

  async function importBackgroundFile(file: File, tagText: string) {
    const result = await importBackground(file, tagList(tagText))
    library.value = result.library
    status.value = `Imported background ${result.record.name}`
  }

  async function importFontFile(file: File, tagText: string) {
    const result = await importFont(file, tagList(tagText))
    library.value = result.library
    await loadFont(result.record)
    status.value = `Imported font ${result.record.name}`
  }

  async function loadFont(font: LibraryRecord) {
    if (!font.path || !('FontFace' in window)) return
    const family = font.name.replace(/\.[^.]+$/, '')
    const face = new FontFace(family, `url("${fileUrl(font.path)}")`)
    await face.load()
    globalThis.document.fonts.add(face)
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

  async function createManagedHandout(title: string) {
    const next = createDefaultHandout(title.trim() || 'Untitled handout')
    const payload = await createProject(next.title, next)
    replaceDocument(payload.document)
    currentProjectId.value = String(payload.metadata.id ?? '')
    view.value = 'editor'
    await refreshProjects()
    status.value = `Created project ${payload.document.title}`
  }

  async function openManagedHandout(projectId: string) {
    const payload = await openManagedProject(projectId)
    replaceDocument(payload.document)
    currentProjectId.value = projectId
    view.value = 'editor'
    status.value = `Opened project ${payload.document.title}`
  }

  function closeEditor() {
    selectedLayerId.value = undefined
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
    addLayerFromAsset,
    addText,
    canRedo,
    canUndo,
    deleteSelectedLayer,
    document,
    closeEditor,
    createManagedHandout,
    currentProjectId,
    importBackgroundFile,
    importAssetFile,
    importFontFile,
    latestProjects,
    layers,
    library,
    moveSelectedLayer,
    openManagedHandout,
    openProjectFromPath,
    patchLayer,
    patchCanvas,
    patchSelectedLayer,
    projects,
    projectDir,
    redo,
    renameDocument,
    refreshLibrary,
    refreshProjects,
    replaceDocument,
    resolveAsset,
    resolveBackground,
    resolveFont,
    selectLayer,
    selectedLayer,
    selectedLayerId,
    setBackground,
    status,
    undo,
    view,
    saveCurrentProject,
  }
})

export function isImageLayer(layer?: HandoutLayer): layer is ImageLayer {
  return layer?.type === 'image'
}

export function isTextLayer(layer?: HandoutLayer): layer is TextLayer {
  return layer?.type === 'text'
}
