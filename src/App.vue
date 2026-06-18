<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type Konva from 'konva'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Image,
  Layers,
  Plus,
  Redo2,
  Save,
  Trash2,
  Type,
  Undo2,
  Upload,
} from '@lucide/vue'
import { VueFinder, type DirEntry, type Driver, type FsData } from 'vuefinder'
import 'vuefinder/dist/vuefinder.css'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { exportImage, fileUrl, readFileDataUrl, type LibraryRecord } from '@/lib/backend'
import type { HandoutLayer, ImageLayer, TextLayer } from '@/lib/handout'
import { isImageLayer, isTextLayer, useEditorStore } from '@/stores/editor'

type NodeRef = { getNode: () => Konva.Node }
type KonvaEvent = { target: Konva.Node; cancelBubble?: boolean }
type FinderKind = 'handout' | 'background' | 'asset' | 'font'

const editor = useEditorStore()
const stageRef = ref<{ getNode: () => Konva.Stage }>()
const transformerRef = ref<{ getNode: () => Konva.Transformer }>()
const layerNodeRefs = reactive<Record<string, NodeRef | undefined>>({})
const imageElements = reactive<Record<string, HTMLImageElement>>({})

const newProjectTitle = ref('Untitled handout')
const createMode = ref<'blank' | 'upload-background'>('blank')
const isCreateDialogOpen = ref(false)
const blankWidth = ref(1280)
const blankHeight = ref(720)
const projectPathInput = ref('')
const exportPathInput = ref('')
const exportScale = ref(1)
const backgroundTags = ref('')
const assetTags = ref('')
const fontTags = ref('')
const backgroundSearch = ref('')
const assetSearch = ref('')
const fontSearch = ref('')
const selectedProjectFolder = ref('')
const selectedBackgroundFolder = ref('')
const selectedAssetFolder = ref('')
const selectedFontFolder = ref('')
const newBackgroundFolder = ref('')
const newAssetFolder = ref('')
const newFontFolder = ref('')
const resourcePreviewUrls = reactive<Record<string, string>>({})
const isDraggingBackground = ref(false)
const isDraggingAsset = ref(false)
const isDraggingFont = ref(false)
const draggedAssetId = ref('')

const finderStorages: Record<FinderKind, string> = {
  handout: 'handouts',
  background: 'backgrounds',
  asset: 'assets',
  font: 'fonts',
}
const finderFeatures = {
  archive: false,
  copy: false,
  delete: false,
  download: false,
  edit: false,
  fullscreen: false,
  history: false,
  language: false,
  move: false,
  newfile: false,
  newfolder: true,
  pinned: false,
  preview: true,
  rename: true,
  search: true,
  theme: false,
  unarchive: false,
  upload: false,
}

const stageScale = computed(() => {
  const maxWidth = 920
  const maxHeight = 620
  return Math.min(maxWidth / editor.document.canvas.width, maxHeight / editor.document.canvas.height, 1)
})

const stageConfig = computed(() => ({
  width: editor.document.canvas.width * stageScale.value,
  height: editor.document.canvas.height * stageScale.value,
  scaleX: stageScale.value,
  scaleY: stageScale.value,
}))

const backgroundAsset = computed(() => editor.resolveBackground(editor.document.canvas.backgroundAssetId))
const backgroundImage = computed(() =>
  backgroundAsset.value ? imageElements[backgroundAsset.value.id] : undefined,
)

const filteredProjects = computed(() =>
  editor.latestProjects.filter((project) => folderMatches(project.folder, selectedProjectFolder.value)),
)
const filteredBackgrounds = computed(() =>
  filterRecords(editor.library.backgrounds, backgroundSearch.value, selectedBackgroundFolder.value),
)
const filteredAssets = computed(() =>
  filterRecords(editor.library.assets, assetSearch.value, selectedAssetFolder.value),
)
const filteredFonts = computed(() =>
  filterRecords(editor.library.fonts, fontSearch.value, selectedFontFolder.value),
)
const finderDrivers = computed<Record<FinderKind, Driver>>(() => ({
  handout: createFinderDriver('handout'),
  background: createFinderDriver('background'),
  asset: createFinderDriver('asset'),
  font: createFinderDriver('font'),
}))

function folderMatches(recordFolder: string | undefined, selectedFolder: string) {
  return (recordFolder || '') === selectedFolder
}

function filterRecords(records: LibraryRecord[], queryText: string, selectedFolder: string) {
  const query = queryText.trim().toLowerCase()
  const scoped = records.filter((record) => folderMatches(record.folder, selectedFolder))
  if (!query) return scoped
  return scoped.filter((record) =>
    [record.name, ...record.tags].some((part) => part.toLowerCase().includes(query)),
  )
}

function foldersForKind(kind: 'background' | 'asset' | 'font') {
  if (kind === 'background') return editor.library.backgroundFolders
  if (kind === 'asset') return editor.library.assetFolders
  return editor.library.fontFolders
}

function projectPreviewUrl(project: { backgroundAssetId?: string | null }) {
  const background = editor.resolveBackground(project.backgroundAssetId || undefined)
  return background ? previewUrl(background) : ''
}

function allFoldersForKind(kind: FinderKind) {
  if (kind === 'handout') return editor.projectFolders
  return foldersForKind(kind)
}

function selectedFolderForFinder(kind: FinderKind) {
  if (kind === 'handout') return selectedProjectFolder.value
  return folderValue(kind)
}

function setSelectedFolderForFinder(kind: FinderKind, folder: string) {
  if (kind === 'handout') selectedProjectFolder.value = folder
  else setFolderValue(kind, folder)
}

function finderRoot(kind: FinderKind) {
  return `${finderStorages[kind]}://`
}

function normalizeFinderFolder(value?: string) {
  if (!value) return ''
  return value.replace(/^[^:]+:\/\//, '').replace(/^\/+|\/+$/g, '')
}

function finderPath(kind: FinderKind, folder = '', id?: string) {
  const root = finderRoot(kind)
  const normalized = normalizeFinderFolder(folder)
  const parts = normalized ? [normalized] : []
  if (id) parts.push(`__${kind}-${id}`)
  return `${root}${parts.join('/')}`
}

function finderParentPath(kind: FinderKind, folder = '') {
  const normalized = normalizeFinderFolder(folder)
  return normalized ? `${finderRoot(kind)}${normalized}` : finderRoot(kind)
}

function entryBase(path: string) {
  return normalizeFinderFolder(path).split('/').filter(Boolean).at(-1) || ''
}

function entryFolder(path: string) {
  const folder = normalizeFinderFolder(path)
  if (!folder) return ''
  return folder.split('/').slice(0, -1).join('/')
}

function extensionForName(name: string) {
  const extension = name.split('.').at(-1) || ''
  return extension === name ? '' : extension
}

function makeDirEntry(kind: FinderKind, parent: string, folderPath: string, basename: string): DirEntry {
  return {
    dir: finderParentPath(kind, parent),
    basename,
    extension: '',
    path: finderParentPath(kind, folderPath),
    storage: finderStorages[kind],
    type: 'dir',
    file_size: null,
    last_modified: null,
    mime_type: null,
    visibility: 'public',
  }
}

function makeFileEntry(
  kind: FinderKind,
  folder: string,
  id: string,
  name: string,
  mediaType: string,
  updatedAt: string,
  preview?: string,
): DirEntry {
  return {
    dir: finderParentPath(kind, folder),
    basename: name,
    extension: extensionForName(name),
    path: finderPath(kind, folder, id),
    storage: finderStorages[kind],
    type: 'file',
    file_size: null,
    last_modified: Date.parse(updatedAt) || null,
    mime_type: mediaType,
    visibility: 'public',
    previewUrl: preview,
  }
}

function finderFoldersAt(kind: FinderKind, currentFolder: string) {
  const folders = allFoldersForKind(kind)
  const seen = new Set<string>()
  return folders
    .map(normalizeFinderFolder)
    .filter(Boolean)
    .flatMap((folder) => {
      const parent = entryFolder(folder)
      if (parent !== currentFolder) return []
      const basename = entryBase(folder)
      if (seen.has(basename)) return []
      seen.add(basename)
      return [makeDirEntry(kind, currentFolder, folder, basename)]
    })
}

function finderFilesAt(kind: FinderKind, currentFolder: string) {
  if (kind === 'handout') {
    return editor.latestProjects
      .filter((project) => folderMatches(project.folder, currentFolder))
      .map((project) =>
        makeFileEntry(
          kind,
          project.folder,
          project.id,
          project.title,
          'application/x-handout-project',
          project.updatedAt,
          projectPreviewUrl(project),
        ),
      )
  }

  return recordsForKindWithoutSearch(kind)
    .filter((record) => folderMatches(record.folder, currentFolder))
    .map((record) =>
      makeFileEntry(kind, record.folder, record.id, record.name, record.mediaType, record.updatedAt, previewUrl(record)),
    )
}

function recordsForKindWithoutSearch(kind: Exclude<FinderKind, 'handout'>) {
  if (kind === 'background') return editor.library.backgrounds
  if (kind === 'asset') return editor.library.assets
  return editor.library.fonts
}

function finderData(kind: FinderKind, path?: string): FsData {
  const folder = normalizeFinderFolder(path)
  return {
    storages: [finderStorages[kind]],
    dirname: finderParentPath(kind, folder),
    read_only: false,
    files: [...finderFoldersAt(kind, folder), ...finderFilesAt(kind, folder)],
  }
}

function finderResult(kind: FinderKind, path?: string) {
  const data = finderData(kind, path)
  return {
    ...data,
    read_only: Boolean(data.read_only),
  }
}

function idFromFinderPath(kind: FinderKind, path: string) {
  return entryBase(path).replace(`__${kind}-`, '')
}

async function createFolderFromFinder(kind: FinderKind, parentPath: string, name: string) {
  const parent = normalizeFinderFolder(parentPath)
  const folder = [parent, name.trim()].filter(Boolean).join('/')
  if (kind === 'handout') await editor.addProjectFolder(folder)
  else await editor.createResourceFolder(kind, folder)
}

async function renameFromFinder(kind: FinderKind, params: { path: string; item: string; name: string }) {
  const itemPath = params.item.includes('://')
    ? params.item
    : `${finderParentPath(kind, normalizeFinderFolder(params.path)).replace(/\/$/, '')}/${params.item}`
  const basename = entryBase(itemPath)
  if (basename.startsWith(`__${kind}-`)) {
    const id = idFromFinderPath(kind, itemPath)
    if (kind === 'handout') await editor.renameProject(id, params.name)
    else await editor.renameResource(kind, id, params.name)
    return
  }

  const oldFolder = normalizeFinderFolder(itemPath)
  const newFolder = [entryFolder(oldFolder), params.name.trim()].filter(Boolean).join('/')
  if (kind === 'handout') await editor.renameProjectFolderPath(oldFolder, newFolder)
  else await editor.renameResourceFolder(kind, oldFolder, newFolder)
  if (selectedFolderForFinder(kind) === oldFolder) setSelectedFolderForFinder(kind, newFolder)
}

function createFinderDriver(kind: FinderKind): Driver {
  const unsupported = async () => {
    throw new Error('This file operation is not supported in the handout library yet.')
  }

  return {
    async list(params) {
      return finderData(kind, params?.path)
    },
    async createFolder(params) {
      await createFolderFromFinder(kind, params.path, params.name)
      return finderResult(kind, params.path)
    },
    async rename(params) {
      await renameFromFinder(kind, params)
      return finderResult(kind, params.path)
    },
    async delete() {
      return unsupported()
    },
    async copy() {
      return unsupported()
    },
    async move() {
      return unsupported()
    },
    async archive() {
      return unsupported()
    },
    async unarchive() {
      return unsupported()
    },
    async createFile() {
      return unsupported()
    },
    async getContent() {
      return { content: '' }
    },
    getPreviewUrl(params) {
      const id = idFromFinderPath(kind, params.path)
      if (kind === 'handout') return projectPreviewUrl({ backgroundAssetId: editor.projects.find((p) => p.id === id)?.backgroundAssetId })
      const record = recordsForKindWithoutSearch(kind).find((item) => item.id === id)
      return record ? previewUrl(record) : ''
    },
    getDownloadUrl() {
      return ''
    },
    async search(params) {
      const query = params.filter.trim().toLowerCase()
      return finderData(kind, params.path).files.filter((file) => file.basename.toLowerCase().includes(query))
    },
    async save() {
      return ''
    },
  }
}

function handleFinderPathChange(kind: FinderKind, path: string) {
  setSelectedFolderForFinder(kind, normalizeFinderFolder(path))
}

function handleFinderFileDoubleClick(kind: FinderKind, event: { item: DirEntry; preventDefault: () => void }) {
  if (event.item.type !== 'file') return
  event.preventDefault()
  const id = idFromFinderPath(kind, event.item.path)
  if (kind === 'handout') void editor.openManagedHandout(id)
  if (kind === 'asset') {
    const asset = editor.resolveAsset(id)
    if (asset) void addAssetToCanvas(asset)
  }
}

function folderValue(kind: 'background' | 'asset' | 'font') {
  if (kind === 'background') return selectedBackgroundFolder.value
  if (kind === 'asset') return selectedAssetFolder.value
  return selectedFontFolder.value
}

function setFolderValue(kind: 'background' | 'asset' | 'font', value: string) {
  if (kind === 'background') selectedBackgroundFolder.value = value
  if (kind === 'asset') selectedAssetFolder.value = value
  if (kind === 'font') selectedFontFolder.value = value
}

function folderInput(kind: 'background' | 'asset' | 'font') {
  if (kind === 'background') return newBackgroundFolder.value
  if (kind === 'asset') return newAssetFolder.value
  return newFontFolder.value
}

function clearFolderInput(kind: 'background' | 'asset' | 'font') {
  if (kind === 'background') newBackgroundFolder.value = ''
  if (kind === 'asset') newAssetFolder.value = ''
  if (kind === 'font') newFontFolder.value = ''
}

async function createResourceFolder(kind: 'background' | 'asset' | 'font') {
  const folder = folderInput(kind).trim()
  if (!folder) return
  await editor.createResourceFolder(kind, folder)
  setFolderValue(kind, folder)
  clearFolderInput(kind)
}

function recordsForKind(kind: 'background' | 'asset' | 'font') {
  if (kind === 'background') return filteredBackgrounds.value
  if (kind === 'asset') return filteredAssets.value
  return filteredFonts.value
}

function tagsForKind(kind: 'background' | 'asset' | 'font') {
  if (kind === 'background') return backgroundTags.value
  if (kind === 'asset') return assetTags.value
  return fontTags.value
}

function clearTags(kind: 'background' | 'asset' | 'font') {
  if (kind === 'background') backgroundTags.value = ''
  if (kind === 'asset') assetTags.value = ''
  if (kind === 'font') fontTags.value = ''
}

function previewUrl(record: LibraryRecord) {
  return resourcePreviewUrls[record.id] || fileUrl(record.path)
}

async function imageSize(record: LibraryRecord) {
  await loadImage(record)
  const image = imageElements[record.id]
  return {
    width: image?.naturalWidth || image?.width || blankWidth.value,
    height: image?.naturalHeight || image?.height || blankHeight.value,
  }
}

function draggingRef(kind: 'background' | 'asset' | 'font') {
  if (kind === 'background') return isDraggingBackground
  if (kind === 'asset') return isDraggingAsset
  return isDraggingFont
}

function layerName(layer: HandoutLayer) {
  if (isTextLayer(layer)) return layer.text || layer.name
  return layer.name
}

function imageForLayer(layer: ImageLayer) {
  const asset = editor.resolveAsset(layer.assetId)
  return asset ? imageElements[asset.id] : undefined
}

async function loadImage(record: LibraryRecord) {
  if (imageElements[record.id]) return imageElements[record.id]
  const image = new window.Image()
  image.crossOrigin = 'anonymous'
  const src = await readFileDataUrl(record.path, record.mediaType)
  resourcePreviewUrls[record.id] = src
  await new Promise<void>((resolve, reject) => {
    image.onload = () => {
      imageElements[record.id] = image
      resolve()
    }
    image.onerror = () => reject(new Error(`Failed to load ${record.name}`))
    image.src = src
  })
  return image
}

function importFolderForKind(kind: 'background' | 'asset' | 'font') {
  return folderValue(kind)
}

function startAssetDrag(asset: LibraryRecord, event: DragEvent) {
  draggedAssetId.value = asset.id
  event.dataTransfer?.setData('application/x-handout-asset', asset.id)
  event.dataTransfer?.setData('text/plain', asset.name)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

function clearAssetDrag() {
  draggedAssetId.value = ''
}

async function addAssetToCanvas(asset: LibraryRecord) {
  const size = await imageSize(asset)
  editor.addLayerFromAsset(asset, size)
  void updateTransformer()
}

function handleCanvasAssetDrop(event: DragEvent) {
  event.preventDefault()
  const assetId = event.dataTransfer?.getData('application/x-handout-asset') || draggedAssetId.value
  const asset = editor.resolveAsset(assetId)
  const stage = stageRef.value?.getNode()
  if (!asset || !stage) return
  const rect = stage.container().getBoundingClientRect()
  const x = (event.clientX - rect.left) / stageScale.value
  const y = (event.clientY - rect.top) / stageScale.value
  void imageSize(asset).then((size) => {
    editor.addLayerFromAssetAt(asset, x, y, size)
    void updateTransformer()
  })
  draggedAssetId.value = ''
}

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  if (!element) return false
  return Boolean(element.closest('input, textarea, select, [contenteditable="true"]'))
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (editor.view !== 'editor' || isEditableTarget(event.target)) return
  if (event.key !== 'Delete' && event.key !== 'Backspace') return
  if (!editor.selectedLayerId) return
  event.preventDefault()
  deleteLayer()
}

function syncImages() {
  void Promise.all([...editor.library.backgrounds, ...editor.library.assets].map((record) => loadImage(record)))
}

function layerConfig(layer: HandoutLayer) {
  return {
    id: layer.id,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    draggable: !layer.locked,
    globalCompositeOperation: layer.blendMode,
  }
}

function textConfig(layer: TextLayer) {
  return {
    ...layerConfig(layer),
    text: layer.text,
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontStyle: `${layer.fontWeight}`,
    fill: layer.fill,
    align: layer.align,
    lineHeight: layer.lineHeight,
    verticalAlign: 'top',
  }
}

function selectCanvasLayer(layerId: string, event?: KonvaEvent) {
  if (event) event.cancelBubble = true
  editor.selectLayer(layerId)
  void updateTransformer()
}

function deleteLayer(layerId?: string) {
  if (layerId) editor.selectLayer(layerId)
  editor.deleteSelectedLayer()
  void updateTransformer()
}

function handleStagePointer(event: KonvaEvent) {
  const stage = stageRef.value?.getNode()
  if (stage && event.target === stage) {
    editor.selectLayer(undefined)
    void updateTransformer()
  }
}

function onTransformEnd(layer: HandoutLayer) {
  const node = layerNodeRefs[layer.id]?.getNode()
  if (!node) return
  const scaleX = node.scaleX()
  const scaleY = node.scaleY()
  node.scaleX(1)
  node.scaleY(1)
  editor.patchLayer(layer.id, {
    x: Math.round(node.x()),
    y: Math.round(node.y()),
    width: Math.max(12, Math.round(node.width() * scaleX)),
    height: Math.max(12, Math.round(node.height() * scaleY)),
    rotation: Math.round(node.rotation()),
  })
}

function onDragEnd(layer: HandoutLayer) {
  const node = layerNodeRefs[layer.id]?.getNode()
  if (!node) return
  editor.patchLayer(layer.id, {
    x: Math.round(node.x()),
    y: Math.round(node.y()),
  })
}

async function updateTransformer() {
  await nextTick()
  const transformer = transformerRef.value?.getNode()
  if (!transformer) return
  const selected = editor.selectedLayerId ? layerNodeRefs[editor.selectedLayerId]?.getNode() : undefined
  transformer.nodes(selected ? [selected] : [])
  transformer.getLayer()?.batchDraw()
}

async function importFiles(kind: 'background' | 'asset' | 'font', files: FileList | File[]) {
  const fileArray = Array.from(files)
  const imported: LibraryRecord[] = []
  for (const file of fileArray) {
    if (kind === 'background') imported.push(await editor.importBackgroundFile(file, tagsForKind(kind), importFolderForKind(kind)))
    if (kind === 'asset') imported.push(await editor.importAssetFile(file, tagsForKind(kind), importFolderForKind(kind)))
    if (kind === 'font') imported.push(await editor.importFontFile(file, tagsForKind(kind), importFolderForKind(kind)))
  }
  clearTags(kind)
  syncImages()
  return imported
}

async function handleFileInput(kind: 'background' | 'asset' | 'font', event: Event) {
  const files = (event.target as HTMLInputElement).files
  if (!files?.length) return
  await importFiles(kind, files)
  ;(event.target as HTMLInputElement).value = ''
}

async function handleDrop(kind: 'background' | 'asset' | 'font', event: DragEvent) {
  event.preventDefault()
  draggingRef(kind).value = false
  const files = event.dataTransfer?.files
  if (!files?.length) return
  await importFiles(kind, files)
}

async function createProject() {
  if (createMode.value === 'blank') {
    await editor.createManagedHandout(newProjectTitle.value, {
      width: blankWidth.value,
      height: blankHeight.value,
      folder: selectedProjectFolder.value,
    })
    isCreateDialogOpen.value = false
    return
  }
}

async function createProjectFromBackground(background: LibraryRecord) {
  const size = await imageSize(background)
  await editor.createManagedHandout(newProjectTitle.value, {
    width: size.width,
    height: size.height,
    backgroundId: background.id,
    folder: selectedProjectFolder.value,
  })
  isCreateDialogOpen.value = false
}

async function handleCreateBackgroundInput(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const [background] = await importFiles('background', [file])
  await createProjectFromBackground(background)
  ;(event.target as HTMLInputElement).value = ''
}

async function handleCreateBackgroundDrop(event: DragEvent) {
  event.preventDefault()
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  const [background] = await importFiles('background', [file])
  await createProjectFromBackground(background)
}

async function openProjectFromPath() {
  if (!projectPathInput.value.trim()) return
  await editor.openProjectFromPath(projectPathInput.value)
}

async function saveProject() {
  await editor.saveCurrentProject()
}

async function exportCurrentImage() {
  const path = exportPathInput.value.trim()
  const stage = stageRef.value?.getNode()
  if (!path || !stage) return
  const dataUrl = stage.toDataURL({
    pixelRatio: Math.max(0.1, Number(exportScale.value) || 1) / stageScale.value,
    mimeType: path.toLowerCase().endsWith('.jpg') || path.toLowerCase().endsWith('.jpeg')
      ? 'image/jpeg'
      : 'image/png',
  })
  await exportImage(path, dataUrl)
  editor.status = `Exported image to ${path}`
}

function setFont(fontId: string) {
  const font = editor.resolveFont(fontId)
  editor.patchSelectedLayer({
    fontId,
    fontFamily: font?.name.replace(/\.[^.]+$/, '') || 'Inter',
  })
}

onMounted(async () => {
  try {
    await Promise.all([editor.refreshLibrary(), editor.refreshProjects()])
    syncImages()
    window.addEventListener('keydown', handleGlobalKeydown)
  } catch (error) {
    editor.status = String(error)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})

watch(() => editor.library.backgrounds, syncImages, { deep: true })
watch(() => editor.library.assets, syncImages, { deep: true })
watch(() => editor.selectedLayerId, updateTransformer)
watch(() => editor.document.layers, updateTransformer, { deep: true })
</script>

<template>
  <div v-if="editor.view === 'manager'" class="manager-shell">
    <header class="manager-header">
      <div>
        <h1>Handout Generator</h1>
        <p>Manage handouts, backgrounds, assets, and fonts before opening the canvas editor.</p>
      </div>
      <Badge variant="secondary">{{ editor.status }}</Badge>
    </header>

    <Tabs default-value="handouts" class="manager-tabs">
      <TabsList class="manager-tab-list">
        <TabsTrigger value="handouts">Handouts</TabsTrigger>
        <TabsTrigger value="backgrounds">Backgrounds</TabsTrigger>
        <TabsTrigger value="assets">Assets</TabsTrigger>
        <TabsTrigger value="fonts">Fonts</TabsTrigger>
      </TabsList>

      <TabsContent value="handouts" class="manager-tab-content">
        <section class="manager-actions">
          <div class="create-header">
            <Input v-model="projectPathInput" placeholder="/path/to/existing/project-folder" />
            <Button variant="outline" @click="openProjectFromPath">
              <FolderOpen data-icon="inline-start" />
              Open folder
            </Button>
            <Button @click="isCreateDialogOpen = true">
              <Plus data-icon="inline-start" />
              New handout
            </Button>
          </div>
        </section>

        <VueFinder
          id="handout-finder"
          class="manager-finder"
          :driver="finderDrivers.handout"
          :features="finderFeatures"
          selection-mode="single"
          selection-filter-type="both"
          @path-change="(path) => handleFinderPathChange('handout', path)"
          @file-dclick="(event) => handleFinderFileDoubleClick('handout', event)"
        />

        <div class="project-grid">
          <Card v-for="project in filteredProjects" :key="project.id" class="project-card">
            <div class="project-thumb">
              <img v-if="projectPreviewUrl(project)" :src="projectPreviewUrl(project)" alt="" />
              <span v-else>Transparent</span>
            </div>
            <CardHeader>
              <CardTitle>{{ project.title }}</CardTitle>
            </CardHeader>
            <CardContent class="project-card-content">
              <Badge variant="outline">{{ project.folder || 'Root' }}</Badge>
              <span>{{ new Date(project.updatedAt).toLocaleString() }}</span>
              <Button @click="editor.openManagedHandout(project.id)">Open editor</Button>
            </CardContent>
          </Card>
          <Card v-if="!filteredProjects.length" class="empty-card">
            <CardContent>No handout projects yet.</CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="backgrounds" class="manager-tab-content">
        <section
          class="drop-panel"
          :class="{ dragging: isDraggingBackground }"
          @dragenter.prevent="isDraggingBackground = true"
          @dragover.prevent="isDraggingBackground = true"
          @dragleave.prevent="isDraggingBackground = false"
          @drop="handleDrop('background', $event)"
        >
          <Image />
          <strong>Drop background images here</strong>
          <span>Used as full-canvas base images in handout projects.</span>
          <div class="drop-actions">
            <Input v-model="backgroundTags" placeholder="tags: map, paper, room" />
            <Button as="label" variant="outline">
              <Upload data-icon="inline-start" />
              Upload
              <input class="sr-only" type="file" accept="image/*" multiple @change="handleFileInput('background', $event)" />
            </Button>
          </div>
        </section>
        <div class="folder-toolbar">
          <label>
            Background folder
            <select v-model="selectedBackgroundFolder" class="folder-select">
              <option value="">Root</option>
              <option v-for="folder in foldersForKind('background')" :key="folder" :value="folder">{{ folder }}</option>
            </select>
          </label>
          <Input v-model="newBackgroundFolder" placeholder="New folder" />
          <Button variant="outline" @click="createResourceFolder('background')">New folder</Button>
        </div>
        <VueFinder
          id="background-finder"
          class="manager-finder compact-finder"
          :driver="finderDrivers.background"
          :features="finderFeatures"
          selection-mode="single"
          selection-filter-type="both"
          @path-change="(path) => handleFinderPathChange('background', path)"
          @file-dclick="(event) => handleFinderFileDoubleClick('background', event)"
        />
        <Input v-model="backgroundSearch" placeholder="Search backgrounds or tags" />
        <div class="resource-grid">
          <button v-for="record in recordsForKind('background')" :key="record.id" class="resource-card" type="button">
            <img :src="previewUrl(record)" alt="" />
            <strong>{{ record.name }}</strong>
            <span>{{ record.tags.join(', ') || 'No tags' }}</span>
            <Button size="sm" @click.stop="createProjectFromBackground(record)">Create handout</Button>
          </button>
        </div>
      </TabsContent>

      <TabsContent value="assets" class="manager-tab-content">
        <section
          class="drop-panel"
          :class="{ dragging: isDraggingAsset }"
          @dragenter.prevent="isDraggingAsset = true"
          @dragover.prevent="isDraggingAsset = true"
          @dragleave.prevent="isDraggingAsset = false"
          @drop="handleDrop('asset', $event)"
        >
          <Image />
          <strong>Drop image assets and textures here</strong>
          <span>Assets can be inserted as movable layers inside a handout.</span>
          <div class="drop-actions">
            <Input v-model="assetTags" placeholder="tags: clue, texture, token" />
            <Button as="label" variant="outline">
              <Upload data-icon="inline-start" />
              Upload
              <input class="sr-only" type="file" accept="image/*" multiple @change="handleFileInput('asset', $event)" />
            </Button>
          </div>
        </section>
        <div class="folder-toolbar">
          <label>
            Asset folder
            <select v-model="selectedAssetFolder" class="folder-select">
              <option value="">Root</option>
              <option v-for="folder in foldersForKind('asset')" :key="folder" :value="folder">{{ folder }}</option>
            </select>
          </label>
          <Input v-model="newAssetFolder" placeholder="New folder" />
          <Button variant="outline" @click="createResourceFolder('asset')">New folder</Button>
        </div>
        <VueFinder
          id="asset-finder"
          class="manager-finder compact-finder"
          :driver="finderDrivers.asset"
          :features="finderFeatures"
          selection-mode="single"
          selection-filter-type="both"
          @path-change="(path) => handleFinderPathChange('asset', path)"
          @file-dclick="(event) => handleFinderFileDoubleClick('asset', event)"
        />
        <Input v-model="assetSearch" placeholder="Search assets or tags" />
        <div class="resource-grid">
          <button
            v-for="record in recordsForKind('asset')"
            :key="record.id"
            class="resource-card"
            type="button"
            draggable="true"
            @dragstart="startAssetDrag(record, $event)"
            @dragend="clearAssetDrag"
          >
            <img :src="previewUrl(record)" alt="" />
            <strong>{{ record.name }}</strong>
            <span>{{ record.tags.join(', ') || 'No tags' }}</span>
          </button>
        </div>
      </TabsContent>

      <TabsContent value="fonts" class="manager-tab-content">
        <section
          class="drop-panel"
          :class="{ dragging: isDraggingFont }"
          @dragenter.prevent="isDraggingFont = true"
          @dragover.prevent="isDraggingFont = true"
          @dragleave.prevent="isDraggingFont = false"
          @drop="handleDrop('font', $event)"
        >
          <Type />
          <strong>Drop font files here</strong>
          <span>Fonts are added to the global font library and can be tagged.</span>
          <div class="drop-actions">
            <Input v-model="fontTags" placeholder="tags: serif, handwriting, title" />
            <Button as="label" variant="outline">
              <Upload data-icon="inline-start" />
              Upload
              <input
                class="sr-only"
                type="file"
                accept=".ttf,.otf,.woff,.woff2,font/*"
                multiple
                @change="handleFileInput('font', $event)"
              />
            </Button>
          </div>
        </section>
        <div class="folder-toolbar">
          <label>
            Font folder
            <select v-model="selectedFontFolder" class="folder-select">
              <option value="">Root</option>
              <option v-for="folder in foldersForKind('font')" :key="folder" :value="folder">{{ folder }}</option>
            </select>
          </label>
          <Input v-model="newFontFolder" placeholder="New folder" />
          <Button variant="outline" @click="createResourceFolder('font')">New folder</Button>
        </div>
        <VueFinder
          id="font-finder"
          class="manager-finder compact-finder"
          :driver="finderDrivers.font"
          :features="finderFeatures"
          selection-mode="single"
          selection-filter-type="both"
          @path-change="(path) => handleFinderPathChange('font', path)"
          @file-dclick="(event) => handleFinderFileDoubleClick('font', event)"
        />
        <Input v-model="fontSearch" placeholder="Search fonts or tags" />
        <div class="font-grid">
          <div v-for="font in recordsForKind('font')" :key="font.id" class="font-card">
            <strong>{{ font.name }}</strong>
            <span>{{ font.tags.join(', ') || 'No tags' }}</span>
          </div>
        </div>
      </TabsContent>
    </Tabs>

    <Dialog v-model:open="isCreateDialogOpen">
      <DialogContent class="create-dialog">
        <DialogHeader>
          <DialogTitle>Create handout</DialogTitle>
          <DialogDescription>Start from an uploaded background file or a blank transparent canvas.</DialogDescription>
        </DialogHeader>
        <Input v-model="newProjectTitle" placeholder="New handout title" />
        <div class="create-options">
          <button
            class="create-option"
            :class="{ selected: createMode === 'upload-background' }"
            type="button"
            @click="createMode = 'upload-background'"
          >
            <Upload />
            <strong>Upload file</strong>
            <span>Use the uploaded image size as the canvas size.</span>
          </button>
          <button
            class="create-option"
            :class="{ selected: createMode === 'blank' }"
            type="button"
            @click="createMode = 'blank'"
          >
            <Plus />
            <strong>Blank canvas</strong>
            <span>Set the canvas size manually.</span>
          </button>
        </div>

        <section
          v-if="createMode === 'upload-background'"
          class="drop-panel compact-drop"
          @dragover.prevent
          @drop="handleCreateBackgroundDrop"
        >
          <Image />
          <strong>Drop a background image here</strong>
          <span>The image will be imported and used as the handout background.</span>
          <Button as="label" variant="outline">
            <Upload data-icon="inline-start" />
            Upload background
            <input class="sr-only" type="file" accept="image/*" @change="handleCreateBackgroundInput" />
          </Button>
        </section>

        <div v-if="createMode === 'blank'" class="create-controls">
          <Input v-model="blankWidth" type="number" placeholder="Width" />
          <Input v-model="blankHeight" type="number" placeholder="Height" />
          <Button @click="createProject">Create blank handout</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>

  <div v-else class="app-shell">
    <aside class="left-rail">
      <div class="brand-strip">
        <Button variant="outline" size="sm" @click="editor.closeEditor()">
          <ArrowLeft data-icon="inline-start" />
          Projects
        </Button>
        <div>
          <h1>{{ editor.document.title }}</h1>
          <p>Single-page canvas editor</p>
        </div>
      </div>

      <Tabs default-value="assets" class="rail-tabs">
        <TabsList class="grid grid-cols-3">
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="fonts">Fonts</TabsTrigger>
          <TabsTrigger value="layers">Layers</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" class="rail-tab-content">
          <section
            class="mini-drop"
            :class="{ dragging: isDraggingAsset }"
            @dragenter.prevent="isDraggingAsset = true"
            @dragover.prevent="isDraggingAsset = true"
            @dragleave.prevent="isDraggingAsset = false"
            @drop="handleDrop('asset', $event)"
          >
            Drop assets here
          </section>
          <div class="import-row">
            <Input v-model="assetTags" placeholder="tags: paper, clue" />
            <Button as="label" size="sm" variant="outline">
              <Upload data-icon="inline-start" />
              Import
              <input class="sr-only" type="file" accept="image/*" multiple @change="handleFileInput('asset', $event)" />
            </Button>
          </div>
          <div class="folder-toolbar compact">
            <label>
              Folder
              <select v-model="selectedAssetFolder" class="folder-select">
                <option value="">Root</option>
                <option v-for="folder in foldersForKind('asset')" :key="folder" :value="folder">{{ folder }}</option>
              </select>
            </label>
            <Input v-model="newAssetFolder" placeholder="New folder" />
            <Button size="sm" variant="outline" @click="createResourceFolder('asset')">New</Button>
          </div>
          <VueFinder
            id="editor-asset-finder"
            class="rail-finder"
            :driver="finderDrivers.asset"
            :features="finderFeatures"
            selection-mode="single"
            selection-filter-type="both"
            @path-change="(path) => handleFinderPathChange('asset', path)"
            @file-dclick="(event) => handleFinderFileDoubleClick('asset', event)"
          />
          <Input v-model="assetSearch" placeholder="Search assets or tags" />
          <ScrollArea class="rail-scroll">
            <button
              v-for="asset in filteredAssets"
              :key="asset.id"
              class="asset-row"
              type="button"
              draggable="true"
              @click="addAssetToCanvas(asset)"
              @dragstart="startAssetDrag(asset, $event)"
              @dragend="clearAssetDrag"
            >
              <span class="asset-thumb"><img :src="previewUrl(asset)" alt="" /></span>
              <span class="asset-meta">
                <strong>{{ asset.name }}</strong>
                <span>Click or drag to add · {{ asset.tags.join(', ') || 'No tags' }}</span>
              </span>
            </button>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="fonts" class="rail-tab-content">
          <section
            class="mini-drop"
            :class="{ dragging: isDraggingFont }"
            @dragenter.prevent="isDraggingFont = true"
            @dragover.prevent="isDraggingFont = true"
            @dragleave.prevent="isDraggingFont = false"
            @drop="handleDrop('font', $event)"
          >
            Drop fonts here
          </section>
          <div class="import-row">
            <Input v-model="fontTags" placeholder="tags: serif, title" />
            <Button as="label" size="sm" variant="outline">
              <Upload data-icon="inline-start" />
              Import
              <input
                class="sr-only"
                type="file"
                accept=".ttf,.otf,.woff,.woff2,font/*"
                multiple
                @change="handleFileInput('font', $event)"
              />
            </Button>
          </div>
          <div class="folder-toolbar compact">
            <label>
              Folder
              <select v-model="selectedFontFolder" class="folder-select">
                <option value="">Root</option>
                <option v-for="folder in foldersForKind('font')" :key="folder" :value="folder">{{ folder }}</option>
              </select>
            </label>
            <Input v-model="newFontFolder" placeholder="New folder" />
            <Button size="sm" variant="outline" @click="createResourceFolder('font')">New</Button>
          </div>
          <VueFinder
            id="editor-font-finder"
            class="rail-finder"
            :driver="finderDrivers.font"
            :features="finderFeatures"
            selection-mode="single"
            selection-filter-type="both"
            @path-change="(path) => handleFinderPathChange('font', path)"
            @file-dclick="(event) => handleFinderFileDoubleClick('font', event)"
          />
          <Input v-model="fontSearch" placeholder="Search fonts or tags" />
          <ScrollArea class="rail-scroll">
            <div v-for="font in filteredFonts" :key="font.id" class="font-row">
              <strong>{{ font.name }}</strong>
              <span>{{ font.tags.join(', ') || 'No tags' }}</span>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="layers" class="rail-tab-content">
          <div class="layer-actions">
            <Button size="sm" variant="outline" @click="editor.addText()">
              <Type data-icon="inline-start" />
              Text
            </Button>
            <Button size="sm" variant="outline" @click="editor.moveSelectedLayer(1)">
              <ArrowUp data-icon="inline-start" />
              Up
            </Button>
            <Button size="sm" variant="outline" @click="editor.moveSelectedLayer(-1)">
              <ArrowDown data-icon="inline-start" />
              Down
            </Button>
            <Button size="sm" variant="destructive" :disabled="!editor.selectedLayer" @click="deleteLayer()">
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </div>
          <ScrollArea class="rail-scroll">
            <div
              v-for="layer in editor.layers"
              :key="layer.id"
              class="layer-row"
              :class="{ selected: editor.selectedLayerId === layer.id }"
              role="button"
              tabindex="0"
              @click="selectCanvasLayer(layer.id)"
              @keydown.enter="selectCanvasLayer(layer.id)"
            >
              <Layers class="layer-icon" />
              <span>
                <strong>{{ layerName(layer) }}</strong>
                <em>{{ layer.type }} · z{{ layer.zIndex }}</em>
              </span>
              <Eye v-if="layer.visible" class="layer-state" />
              <EyeOff v-else class="layer-state" />
              <Button
                class="row-delete"
                size="icon"
                variant="ghost"
                @click.stop="deleteLayer(layer.id)"
              >
                <Trash2 />
              </Button>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div class="project-fields">
          <Input v-model="projectPathInput" placeholder="/path/to/project-folder" />
          <Button variant="outline" @click="openProjectFromPath">
            <FolderOpen data-icon="inline-start" />
            Open
          </Button>
          <Button @click="saveProject">
            <Save data-icon="inline-start" />
            Save
          </Button>
        </div>
        <Separator orientation="vertical" />
        <div class="topbar-actions">
          <Button variant="outline" :disabled="!editor.canUndo" @click="editor.undo()">
            <Undo2 data-icon="inline-start" />
            Undo
          </Button>
          <Button variant="outline" :disabled="!editor.canRedo" @click="editor.redo()">
            <Redo2 data-icon="inline-start" />
            Redo
          </Button>
        </div>
      </header>

      <section class="canvas-wrap">
        <div class="canvas-meta">
          <Badge variant="secondary">{{ editor.document.canvas.width }} x {{ editor.document.canvas.height }} px</Badge>
          <Badge variant="outline">{{ Math.round(stageScale * 100) }}%</Badge>
          <span>{{ editor.status }}</span>
        </div>

        <div
          class="stage-frame"
          :class="{ 'stage-frame-dropping': draggedAssetId }"
          @dragover.prevent
          @drop="handleCanvasAssetDrop"
        >
          <v-stage ref="stageRef" :config="stageConfig" @click="handleStagePointer" @tap="handleStagePointer">
            <v-layer>
              <v-rect
                :config="{
                  x: 0,
                  y: 0,
                  width: editor.document.canvas.width,
                  height: editor.document.canvas.height,
                  fill: editor.document.canvas.backgroundColor,
                }"
              />
              <v-image
                v-if="backgroundImage"
                :config="{
                  image: backgroundImage,
                  x: 0,
                  y: 0,
                  width: editor.document.canvas.width,
                  height: editor.document.canvas.height,
                  listening: false,
                }"
              />
              <template v-for="layer in editor.document.layers" :key="layer.id">
                <v-image
                  v-if="isImageLayer(layer) && imageForLayer(layer)"
                  :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                  :config="{ ...layerConfig(layer), image: imageForLayer(layer) }"
                  @click="selectCanvasLayer(layer.id, $event)"
                  @tap="selectCanvasLayer(layer.id, $event)"
                  @dragstart="selectCanvasLayer(layer.id, $event)"
                  @dragend="onDragEnd(layer)"
                  @transformend="onTransformEnd(layer)"
                />
                <v-text
                  v-else-if="isTextLayer(layer)"
                  :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                  :config="textConfig(layer)"
                  @click="selectCanvasLayer(layer.id, $event)"
                  @tap="selectCanvasLayer(layer.id, $event)"
                  @dragstart="selectCanvasLayer(layer.id, $event)"
                  @dragend="onDragEnd(layer)"
                  @transformend="onTransformEnd(layer)"
                />
              </template>
              <v-transformer
                ref="transformerRef"
                :config="{
                  rotateEnabled: true,
                  ignoreStroke: true,
                  boundBoxFunc: (oldBox: unknown, newBox: { width: number; height: number }) =>
                    newBox.width < 12 || newBox.height < 12 ? oldBox : newBox,
                }"
              />
            </v-layer>
          </v-stage>
        </div>
      </section>
    </main>

    <aside class="right-rail">
      <Tabs default-value="inspect" class="rail-tabs">
        <TabsList class="grid grid-cols-3">
          <TabsTrigger value="inspect">Inspect</TabsTrigger>
          <TabsTrigger value="document">Doc Type</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        <TabsContent value="inspect" class="rail-tab-content">
          <div v-if="editor.selectedLayer" class="panel-stack inspector-panel">
          <label>
            Name
            <Input :model-value="editor.selectedLayer.name" @update:model-value="(value) => editor.patchSelectedLayer({ name: String(value) })" />
          </label>
          <div class="two-col">
            <label>
              X
              <Input type="number" :model-value="editor.selectedLayer.x" @update:model-value="(value) => editor.patchSelectedLayer({ x: Number(value) || 0 })" />
            </label>
            <label>
              Y
              <Input type="number" :model-value="editor.selectedLayer.y" @update:model-value="(value) => editor.patchSelectedLayer({ y: Number(value) || 0 })" />
            </label>
          </div>
          <div class="two-col">
            <label>
              Width
              <Input type="number" :model-value="editor.selectedLayer.width" @update:model-value="(value) => editor.patchSelectedLayer({ width: Number(value) || 1 })" />
            </label>
            <label>
              Height
              <Input type="number" :model-value="editor.selectedLayer.height" @update:model-value="(value) => editor.patchSelectedLayer({ height: Number(value) || 1 })" />
            </label>
          </div>
          <label>
            Opacity {{ Math.round(editor.selectedLayer.opacity * 100) }}%
            <Slider
              :model-value="[editor.selectedLayer.opacity * 100]"
              :max="100"
              :step="1"
              @update:model-value="(value) => editor.patchSelectedLayer({ opacity: ((value?.[0] ?? 100) as number) / 100 })"
            />
          </label>
          <label>
            Blend mode
            <Select :model-value="editor.selectedLayer.blendMode" @update:model-value="(value) => editor.patchSelectedLayer({ blendMode: value as any })">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="source-over">Normal</SelectItem>
                <SelectItem value="multiply">Multiply</SelectItem>
                <SelectItem value="screen">Screen</SelectItem>
                <SelectItem value="overlay">Overlay</SelectItem>
                <SelectItem value="darken">Darken</SelectItem>
                <SelectItem value="lighten">Lighten</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <template v-if="isTextLayer(editor.selectedLayer)">
            <label>
              Text
              <Textarea :model-value="editor.selectedLayer.text" @update:model-value="(value) => editor.patchSelectedLayer({ text: String(value) })" />
            </label>
            <div class="two-col">
              <label>
                Font size
                <Input type="number" :model-value="editor.selectedLayer.fontSize" @update:model-value="(value) => editor.patchSelectedLayer({ fontSize: Number(value) || 1 })" />
              </label>
              <label>
                Color
                <Input type="color" :model-value="editor.selectedLayer.fill" @update:model-value="(value) => editor.patchSelectedLayer({ fill: String(value) })" />
              </label>
            </div>
            <label>
              Font
              <Select :model-value="editor.selectedLayer.fontId" @update:model-value="(value) => setFont(String(value))">
                <SelectTrigger><SelectValue :placeholder="editor.selectedLayer.fontFamily" /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="font in editor.library.fonts" :key="font.id" :value="font.id">
                    {{ font.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
          </template>
          <Separator />
          <div class="effect-grid">
            <label>
              Blur {{ editor.selectedLayer.effects.blur }}
              <Slider
                :model-value="[editor.selectedLayer.effects.blur]"
                :max="40"
                :step="1"
                @update:model-value="(value) => editor.patchSelectedLayer({ effects: { ...editor.selectedLayer!.effects, blur: (value?.[0] ?? 0) as number } })"
              />
            </label>
            <label>
              Brightness {{ editor.selectedLayer.effects.brightness }}
              <Slider
                :model-value="[editor.selectedLayer.effects.brightness]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="(value) => editor.patchSelectedLayer({ effects: { ...editor.selectedLayer!.effects, brightness: (value?.[0] ?? 0) as number } })"
              />
            </label>
            <label>
              Contrast {{ editor.selectedLayer.effects.contrast }}
              <Slider
                :model-value="[editor.selectedLayer.effects.contrast]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="(value) => editor.patchSelectedLayer({ effects: { ...editor.selectedLayer!.effects, contrast: (value?.[0] ?? 0) as number } })"
              />
            </label>
            <label>
              Saturation {{ editor.selectedLayer.effects.saturation }}
              <Slider
                :model-value="[editor.selectedLayer.effects.saturation]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="(value) => editor.patchSelectedLayer({ effects: { ...editor.selectedLayer!.effects, saturation: (value?.[0] ?? 0) as number } })"
              />
            </label>
          </div>
          <div class="danger-row">
            <Button variant="outline" @click="editor.patchSelectedLayer({ visible: !editor.selectedLayer.visible })">
              <Eye data-icon="inline-start" />
              Toggle
            </Button>
            <Button variant="destructive" @click="deleteLayer()">
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </div>
          </div>
          <div v-else class="empty-inspector">Select a layer on the canvas or in the layer list.</div>
        </TabsContent>

        <TabsContent value="document" class="rail-tab-content">
          <div class="panel-stack inspector-panel">
            <label>
              Title
              <Input :model-value="editor.document.title" @update:model-value="(value) => editor.renameDocument(String(value))" />
            </label>
            <div class="two-col">
              <label>
                Width
                <Input
                  type="number"
                  :model-value="editor.document.canvas.width"
                  @update:model-value="(value) => editor.patchCanvas({ width: Number(value) || 1 })"
                />
              </label>
              <label>
                Height
                <Input
                  type="number"
                  :model-value="editor.document.canvas.height"
                  @update:model-value="(value) => editor.patchCanvas({ height: Number(value) || 1 })"
                />
              </label>
            </div>
            <div class="document-summary">
              <span>Background</span>
              <strong>{{ backgroundAsset?.name || 'Transparent canvas' }}</strong>
            </div>
            <div class="document-summary">
              <span>Layers</span>
              <strong>{{ editor.document.layers.length }}</strong>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="export" class="rail-tab-content">
          <div class="panel-stack inspector-panel">
          <Input v-model="exportPathInput" placeholder="/path/to/output.png" />
          <label>
            Export scale {{ exportScale }}x
            <Slider
              :model-value="[exportScale]"
              :min="0.25"
              :max="4"
              :step="0.25"
              @update:model-value="(value) => (exportScale = (value?.[0] ?? 1) as number)"
            />
          </label>
          <Button @click="exportCurrentImage">
            <Download data-icon="inline-start" />
            Export PNG/JPEG
          </Button>
          </div>
        </TabsContent>
      </Tabs>
    </aside>
  </div>
</template>
