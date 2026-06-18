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

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

const editor = useEditorStore()
const stageRef = ref<{ getNode: () => Konva.Stage }>()
const transformerRef = ref<{ getNode: () => Konva.Transformer }>()
const layerNodeRefs = reactive<Record<string, NodeRef | undefined>>({})
const imageElements = reactive<Record<string, HTMLImageElement>>({})

const newProjectTitle = ref('Untitled handout')
const createMode = ref<'blank' | 'existing-background' | 'upload-background'>('blank')
const blankWidth = ref(1280)
const blankHeight = ref(720)
const selectedCreateBackgroundId = ref('')
const projectPathInput = ref('')
const exportPathInput = ref('')
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
const newProjectFolder = ref('')
const newBackgroundFolder = ref('')
const newAssetFolder = ref('')
const newFontFolder = ref('')
const resourcePreviewUrls = reactive<Record<string, string>>({})
const isDraggingBackground = ref(false)
const isDraggingAsset = ref(false)
const isDraggingFont = ref(false)
const draggedAssetId = ref('')

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

async function createHandoutFolder() {
  const folder = newProjectFolder.value.trim()
  if (!folder) return
  await editor.addProjectFolder(folder)
  selectedProjectFolder.value = folder
  newProjectFolder.value = ''
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

function handleCanvasAssetDrop(event: DragEvent) {
  event.preventDefault()
  const assetId = event.dataTransfer?.getData('application/x-handout-asset') || draggedAssetId.value
  const asset = editor.resolveAsset(assetId)
  const stage = stageRef.value?.getNode()
  if (!asset || !stage) return
  const rect = stage.container().getBoundingClientRect()
  const x = (event.clientX - rect.left) / stageScale.value
  const y = (event.clientY - rect.top) / stageScale.value
  editor.addLayerFromAssetAt(asset, x, y)
  draggedAssetId.value = ''
  void updateTransformer()
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
    return
  }

  const background = editor.library.backgrounds.find((record) => record.id === selectedCreateBackgroundId.value)
  if (!background) {
    editor.status = 'Choose or upload a background before creating the handout.'
    return
  }
  const size = await imageSize(background)
  await editor.createManagedHandout(newProjectTitle.value, {
    width: size.width,
    height: size.height,
    backgroundId: background.id,
    folder: selectedProjectFolder.value,
  })
}

async function handleCreateBackgroundInput(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const [background] = await importFiles('background', [file])
  selectedCreateBackgroundId.value = background.id
  createMode.value = 'existing-background'
  await createProject()
  ;(event.target as HTMLInputElement).value = ''
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
    pixelRatio: 1 / stageScale.value,
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
        <section class="create-panel">
          <div class="create-header">
            <Input v-model="newProjectTitle" placeholder="New handout title" />
            <Input v-model="projectPathInput" placeholder="/path/to/existing/project-folder" />
            <Button variant="outline" @click="openProjectFromPath">
              <FolderOpen data-icon="inline-start" />
              Open folder
            </Button>
          </div>

          <div class="folder-toolbar">
            <label>
              Handout folder
              <select v-model="selectedProjectFolder" class="folder-select">
                <option value="">Root</option>
                <option v-for="folder in editor.projectFolders" :key="folder" :value="folder">{{ folder }}</option>
              </select>
            </label>
            <Input v-model="newProjectFolder" placeholder="New folder, e.g. Chapter 1" />
            <Button variant="outline" @click="createHandoutFolder">New folder</Button>
          </div>

          <div class="create-options">
            <button
              class="create-option"
              :class="{ selected: createMode === 'existing-background' }"
              type="button"
              @click="createMode = 'existing-background'"
            >
              <Image />
              <strong>Use uploaded background</strong>
              <span>Create a handout at the selected background image size.</span>
            </button>
            <label class="create-option" :class="{ selected: createMode === 'upload-background' }">
              <Upload />
              <strong>Upload new background</strong>
              <span>Import an image and immediately create from it.</span>
              <input class="sr-only" type="file" accept="image/*" @change="handleCreateBackgroundInput" />
            </label>
            <button
              class="create-option"
              :class="{ selected: createMode === 'blank' }"
              type="button"
              @click="createMode = 'blank'"
            >
              <Plus />
              <strong>Blank transparent canvas</strong>
              <span>Start with a transparent canvas at a custom size.</span>
            </button>
          </div>

          <div v-if="createMode === 'existing-background'" class="create-controls">
            <Select v-model="selectedCreateBackgroundId">
              <SelectTrigger>
                <SelectValue placeholder="Choose a background" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="background in editor.library.backgrounds" :key="background.id" :value="background.id">
                  {{ background.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button @click="createProject">Create from background</Button>
          </div>
          <div v-if="createMode === 'blank'" class="create-controls">
            <Input v-model="blankWidth" type="number" placeholder="Width" />
            <Input v-model="blankHeight" type="number" placeholder="Height" />
            <Button @click="createProject">Create blank handout</Button>
          </div>
        </section>

        <div class="project-grid">
          <Card v-for="project in filteredProjects" :key="project.id" class="project-card">
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
        <Input v-model="backgroundSearch" placeholder="Search backgrounds or tags" />
        <div class="resource-grid">
          <button v-for="record in recordsForKind('background')" :key="record.id" class="resource-card" type="button">
            <img :src="previewUrl(record)" alt="" />
            <strong>{{ record.name }}</strong>
            <span>{{ record.tags.join(', ') || 'No tags' }}</span>
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
        <Input v-model="fontSearch" placeholder="Search fonts or tags" />
        <div class="font-grid">
          <div v-for="font in recordsForKind('font')" :key="font.id" class="font-card">
            <strong>{{ font.name }}</strong>
            <span>{{ font.tags.join(', ') || 'No tags' }}</span>
          </div>
        </div>
      </TabsContent>
    </Tabs>
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
          <Input v-model="assetSearch" placeholder="Search assets or tags" />
          <ScrollArea class="rail-scroll">
            <button
              v-for="asset in filteredAssets"
              :key="asset.id"
              class="asset-row"
              type="button"
              draggable="true"
              @click="editor.addLayerFromAsset(asset)"
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
