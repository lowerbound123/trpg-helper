<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Konva from 'konva'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Minus,
  Eye,
  EyeOff,
  Layers,
  Plus,
  Redo2,
  Save,
  Trash2,
  Type,
  Undo2,
} from '@lucide/vue'
import { VueFinder, type DirEntry } from 'vuefinder'
import 'vuefinder/dist/vuefinder.css'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import RightInspector from '@/components/editor/RightInspector.vue'
import CreateHandoutDialog from '@/components/handout/CreateHandoutDialog.vue'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useFinderManagement, filterRecords, finderFeaturesForKind } from '@/composables/useFinderManagement'
import { useResourceImages } from '@/composables/useResourceImages'
import {
  appendDebugLog,
  exportImageToDownloads,
  openManagedProject,
  saveProjectPreview,
  type LibraryRecord,
  type ProjectSummary,
} from '@/lib/backend'
import { hasVisibleEffects, konvaEffectConfig } from '@/lib/effects'
import type { HandoutLayer, ImageLayer, TextLayer } from '@/lib/handout'
import { dataUrlByteSize, downloadFileName, renderHandoutPreviewToDataUrl, renderHandoutToDataUrl } from '@/lib/render'
import { isImageLayer, isTextLayer, useEditorStore } from '@/stores/editor'

type NodeRef = { getNode: () => Konva.Node }
type KonvaEvent = { target: Konva.Node; evt?: MouseEvent; cancelBubble?: boolean }
type GuideLine = { orientation: 'vertical' | 'horizontal'; value: number }

Konva.dragButtons = [0]
const PREVIEW_TARGET_BYTES = 512 * 1024

const editor = useEditorStore()
const stageFrameRef = ref<HTMLElement>()
const stageRef = ref<{ getNode: () => Konva.Stage }>()
const transformerRef = ref<{ getNode: () => Konva.Transformer }>()
const layerNodeRefs = reactive<Record<string, NodeRef | undefined>>({})

const newProjectTitle = ref('Untitled handout')
const createMode = ref<'blank' | 'upload-background'>('blank')
const isCreateDialogOpen = ref(false)
const blankWidth = ref(1280)
const blankHeight = ref(720)
const exportScale = ref(1)
const exportLog = ref('')
const canvasZoom = ref(1)
const canvasPan = reactive({ x: 0, y: 0 })
const panState = reactive({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 })
const stageViewport = reactive({ width: 920, height: 620 })
const guideLines = ref<GuideLine[]>([])
const isExportingCurrent = ref(false)
const exportingHandoutIds = reactive(new Set<string>())
const lastCurrentExport = ref<{ signature: string; path: string }>()
const lastHandoutExports = reactive(new Map<string, { signature: string; path: string }>())
const assetSearch = ref('')
const fontSearch = ref('')
const selectedProjectFolder = ref('')
const selectedBackgroundFolder = ref('')
const selectedAssetFolder = ref('')
const selectedFontFolder = ref('')
const isBooting = ref(true)
const draggedAssetId = ref('')
const draggedLayerId = ref('')
const selectedFinderItems = reactive<Record<'handout' | 'background' | 'asset' | 'font', DirEntry[]>>({
  handout: [],
  background: [],
  asset: [],
  font: [],
})

const { imageElements, imageSize, previewUrl, syncImages } = useResourceImages(blankWidth, blankHeight)

const baseStageScale = computed(() => {
  const maxWidth = Math.max(240, stageViewport.width - 64)
  const maxHeight = Math.max(180, stageViewport.height - 64)
  return Math.min(maxWidth / editor.document.canvas.width, maxHeight / editor.document.canvas.height, 1)
})

const stageScale = computed(() => baseStageScale.value * canvasZoom.value)

const stageConfig = computed(() => ({
  width: stageViewport.width,
  height: stageViewport.height,
}))

const contentGroupConfig = computed(() => ({
  x: canvasPan.x,
  y: canvasPan.y,
  scaleX: stageScale.value,
  scaleY: stageScale.value,
}))

const documentFilterStyle = computed(() => {
  const effects = editor.document.canvas.effects
  if (!hasVisibleEffects(effects)) return ''
  return [
    effects.blur ? `blur(${effects.blur}px)` : '',
    effects.brightness ? `brightness(${100 + effects.brightness}%)` : '',
    effects.contrast ? `contrast(${100 + effects.contrast}%)` : '',
    effects.saturation ? `saturate(${100 + effects.saturation}%)` : '',
  ].filter(Boolean).join(' ')
})

const backgroundAsset = computed(() =>
  editor.resolveBackground(editor.document.canvas.backgroundAssetId)
    || editor.resolveAsset(editor.document.canvas.backgroundAssetId),
)
const backgroundImage = computed(() =>
  backgroundAsset.value ? imageElements[backgroundAsset.value.id] : undefined,
)

const filteredAssets = computed(() =>
  filterRecords(editor.library.assets, assetSearch.value, selectedAssetFolder.value),
)
const filteredFonts = computed(() =>
  filterRecords(editor.library.fonts, fontSearch.value, selectedFontFolder.value),
)
const {
  finderDrivers,
  handleFinderFileDoubleClick,
  handleFinderPathChange,
  handoutContextMenuItems,
  imageHandoutContextMenuItems,
  imageRecordFromFinderEntry,
  projectFromFinderEntry,
} = useFinderManagement(editor, {
  addAssetToCanvas,
  createHandoutFromImageRecord,
  exportHandoutProject,
  previewUrl,
  uploadFiles,
  selectedFolders: {
    handout: selectedProjectFolder,
    background: selectedBackgroundFolder,
    asset: selectedAssetFolder,
    font: selectedFontFolder,
  },
})

function resetKonvaDragButtons() {
  Konva.dragButtons = [0]
}

function resizeStageViewport() {
  const element = stageFrameRef.value
  if (!element) return
  const rect = element.getBoundingClientRect()
  stageViewport.width = Math.max(320, Math.round(rect.width))
  stageViewport.height = Math.max(240, Math.round(rect.height))
  resetCanvasView()
}

function layerName(layer: HandoutLayer) {
  if (isTextLayer(layer)) return layer.text || layer.name
  return layer.name
}

function imageForLayer(layer: ImageLayer) {
  const asset = editor.resolveAsset(layer.assetId)
  return asset ? imageElements[asset.id] : undefined
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

function serializableLogData(data?: Record<string, unknown>) {
  if (!data) return undefined
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value,
    ]),
  )
}

function logHandoutPreview(message: string, data?: Record<string, unknown>) {
  const payload = serializableLogData(data)
  console.debug(`[handout-preview] ${message}`, payload)
  void appendDebugLog('handout-preview', message, payload)
}

function clampZoom(value: number) {
  return Math.min(8, Math.max(0.1, Number(value) || 1))
}

function resetCanvasView() {
  canvasZoom.value = 1
  canvasPan.x = Math.round((stageViewport.width - editor.document.canvas.width * stageScale.value) / 2)
  canvasPan.y = Math.round((stageViewport.height - editor.document.canvas.height * stageScale.value) / 2)
}

function zoomCanvas(nextZoom: number, anchor = { x: stageViewport.width / 2, y: stageViewport.height / 2 }) {
  const previousScale = stageScale.value
  const canvasPoint = {
    x: (anchor.x - canvasPan.x) / previousScale,
    y: (anchor.y - canvasPan.y) / previousScale,
  }
  canvasZoom.value = clampZoom(nextZoom)
  const nextScale = stageScale.value
  canvasPan.x = Math.round(anchor.x - canvasPoint.x * nextScale)
  canvasPan.y = Math.round(anchor.y - canvasPoint.y * nextScale)
}

function zoomIn() {
  zoomCanvas(canvasZoom.value * 1.2)
}

function zoomOut() {
  zoomCanvas(canvasZoom.value / 1.2)
}

function stagePointFromClient(clientX: number, clientY: number) {
  const rect = stageRef.value?.getNode().container().getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  }
}

function canvasPointFromClient(clientX: number, clientY: number) {
  const point = stagePointFromClient(clientX, clientY)
  return {
    x: (point.x - canvasPan.x) / stageScale.value,
    y: (point.y - canvasPan.y) / stageScale.value,
  }
}

function startLayerListDrag(layer: HandoutLayer, event: DragEvent) {
  draggedLayerId.value = layer.id
  event.dataTransfer?.setData('application/x-handout-layer', layer.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function handleLayerListDrop(targetLayer: HandoutLayer, event: DragEvent) {
  event.preventDefault()
  const layerId = event.dataTransfer?.getData('application/x-handout-layer') || draggedLayerId.value
  if (!layerId || layerId === targetLayer.id) return
  editor.moveLayerToIndex(layerId, targetLayer.zIndex)
  draggedLayerId.value = ''
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
  if (!asset) return
  const { x, y } = canvasPointFromClient(event.clientX, event.clientY)
  void imageSize(asset).then((size) => {
    editor.addLayerFromAssetAt(asset, x, y, size)
    void updateTransformer()
  })
  draggedAssetId.value = ''
}

function startCanvasPan(event: PointerEvent) {
  if (event.button !== 1) return
  event.preventDefault()
  panState.active = true
  panState.startX = event.clientX
  panState.startY = event.clientY
  panState.originX = canvasPan.x
  panState.originY = canvasPan.y
}

function moveCanvasPan(event: PointerEvent) {
  if (!panState.active) return
  event.preventDefault()
  canvasPan.x = panState.originX + event.clientX - panState.startX
  canvasPan.y = panState.originY + event.clientY - panState.startY
}

function stopCanvasPan() {
  panState.active = false
}

function handleCanvasWheel(event: WheelEvent) {
  event.preventDefault()
  const point = stagePointFromClient(event.clientX, event.clientY)
  const factor = event.deltaY > 0 ? 1 / 1.12 : 1.12
  zoomCanvas(canvasZoom.value * factor, point)
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
    ...konvaEffectConfig(layer.effects),
  }
}

function textConfig(layer: TextLayer) {
  return {
    ...layerConfig(layer),
    text: layer.text,
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontStyle: `${layer.italic ? 'italic ' : ''}${layer.fontWeight || 400}`,
    textDecoration: [
      layer.underline ? 'underline' : '',
      layer.strikethrough ? 'line-through' : '',
    ].filter(Boolean).join(' '),
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
  if (stage && (event.target === stage || event.target.name() === 'canvas-background')) {
    editor.selectLayer(undefined)
    void updateTransformer()
  }
}

function onTransformEnd(layer: HandoutLayer) {
  const node = layerNodeRefs[layer.id]?.getNode()
  if (!node) return
  const scaleX = node.scaleX()
  const scaleY = node.scaleY()
  const position = node.position()
  node.scaleX(1)
  node.scaleY(1)
  editor.patchLayer(layer.id, {
    x: Math.round(position.x),
    y: Math.round(position.y),
    width: Math.max(12, Math.round(node.width() * scaleX)),
    height: Math.max(12, Math.round(node.height() * scaleY)),
    rotation: Math.round(node.rotation()),
  })
}

function onDragEnd(layer: HandoutLayer) {
  guideLines.value = []
  const node = layerNodeRefs[layer.id]?.getNode()
  if (!node) return
  editor.patchLayer(layer.id, {
    x: Math.round(node.x()),
    y: Math.round(node.y()),
  })
}

function guidesForLayer(layer: HandoutLayer, node: Konva.Node) {
  const threshold = 6
  const x = node.x()
  const y = node.y()
  const width = node.width()
  const height = node.height()
  const selfX = [x, x + width / 2, x + width]
  const selfY = [y, y + height / 2, y + height]
  const candidatesX = [0, editor.document.canvas.width / 2, editor.document.canvas.width]
  const candidatesY = [0, editor.document.canvas.height / 2, editor.document.canvas.height]

  for (const other of editor.document.layers) {
    if (other.id === layer.id || !other.visible) continue
    candidatesX.push(other.x, other.x + other.width / 2, other.x + other.width)
    candidatesY.push(other.y, other.y + other.height / 2, other.y + other.height)
  }

  const bestX = candidatesX
    .flatMap((target) => selfX.map((source, index) => ({ target, source, index, distance: Math.abs(target - source) })))
    .sort((a, b) => a.distance - b.distance)[0]
  const bestY = candidatesY
    .flatMap((target) => selfY.map((source, index) => ({ target, source, index, distance: Math.abs(target - source) })))
    .sort((a, b) => a.distance - b.distance)[0]

  return {
    x: bestX && bestX.distance <= threshold ? bestX : undefined,
    y: bestY && bestY.distance <= threshold ? bestY : undefined,
  }
}

function onDragMove(layer: HandoutLayer, event: KonvaEvent) {
  const node = layerNodeRefs[layer.id]?.getNode()
  if (!node || event.evt?.ctrlKey) {
    guideLines.value = []
    return
  }

  const guides = guidesForLayer(layer, node)
  const nextGuides: GuideLine[] = []
  if (guides.x) {
    const offset = guides.x.index === 0 ? 0 : guides.x.index === 1 ? node.width() / 2 : node.width()
    node.x(Math.round(guides.x.target - offset))
    nextGuides.push({ orientation: 'vertical', value: guides.x.target })
  }
  if (guides.y) {
    const offset = guides.y.index === 0 ? 0 : guides.y.index === 1 ? node.height() / 2 : node.height()
    node.y(Math.round(guides.y.target - offset))
    nextGuides.push({ orientation: 'horizontal', value: guides.y.target })
  }
  guideLines.value = nextGuides
}

async function updateTransformer() {
  await nextTick()
  refreshLayerEffectCaches()
  const transformer = transformerRef.value?.getNode()
  if (!transformer) return
  const selected = editor.selectedLayerId ? layerNodeRefs[editor.selectedLayerId]?.getNode() : undefined
  transformer.nodes(selected ? [selected] : [])
  transformer.getLayer()?.batchDraw()
}

function refreshLayerEffectCaches() {
  for (const layer of editor.document.layers) {
    const node = layerNodeRefs[layer.id]?.getNode()
    if (!node) continue
    if (hasVisibleEffects(layer.effects)) {
      node.cache()
    } else {
      node.clearCache()
    }
  }
  stageRef.value?.getNode().batchDraw()
}

async function uploadFiles(kind: 'background' | 'asset' | 'font', files: FileList | File[], folder = '') {
  const fileArray = Array.from(files)
  const imported: LibraryRecord[] = []
  for (const file of fileArray) {
    if (kind === 'background') imported.push(await editor.importBackgroundFile(file, '', folder))
    if (kind === 'asset') imported.push(await editor.importAssetFile(file, '', folder))
    if (kind === 'font') imported.push(await editor.importFontFile(file, '', folder))
  }
  syncImages(editor.library)
  return imported
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

function handoutTitleFromRecord(record: LibraryRecord) {
  const name = record.name || record.fileName || 'Untitled handout'
  return name.replace(/\.[^.]+$/, '') || name
}

async function createHandoutFromImageRecord(_kind: 'background' | 'asset', record: LibraryRecord) {
  const size = await imageSize(record)
  await editor.createManagedHandout(handoutTitleFromRecord(record), {
    width: size.width,
    height: size.height,
    backgroundId: record.id,
    folder: selectedProjectFolder.value,
  })
}

function selectedImageRecord(kind: 'background' | 'asset') {
  const selected = selectedFinderItems[kind]
  if (selected.length !== 1) return undefined
  return imageRecordFromFinderEntry(kind, selected[0])
}

function selectedImageStatus(kind: 'background' | 'asset') {
  const selected = selectedFinderItems[kind]
  if (selected.length === 0) return 'No image selected'
  if (selected.length > 1) return `${selected.length} items selected`
  const record = selectedImageRecord(kind)
  return record ? `Selected: ${record.name}` : 'Select an image file'
}

async function createHandoutFromFinderImage(kind: 'background' | 'asset') {
  const record = selectedImageRecord(kind)
  if (!record) return
  await createHandoutFromImageRecord(kind, record)
}

function handleFinderSelect(kind: 'handout' | 'background' | 'asset' | 'font', items: DirEntry[]) {
  selectedFinderItems[kind] = items
}

async function handleCreateBackgroundInput(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const [background] = await uploadFiles('background', [file], selectedBackgroundFolder.value)
  await createProjectFromBackground(background)
  ;(event.target as HTMLInputElement).value = ''
}

async function handleCreateBackgroundDrop(event: DragEvent) {
  event.preventDefault()
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  const [background] = await uploadFiles('background', [file], selectedBackgroundFolder.value)
  await createProjectFromBackground(background)
}

async function saveProject() {
  const saved = await editor.saveCurrentProject()
  if (saved && editor.currentProjectId) {
    logHandoutPreview('rendering preview after save', {
      projectId: editor.currentProjectId,
      title: editor.document.title,
      canvas: editor.document.canvas,
      layers: editor.document.layers.length,
    })
    const dataUrl = await renderHandoutPreviewToDataUrl(editor.document, editor.library, imageElements)
    const previewPath = await saveProjectPreview(editor.currentProjectId, dataUrl)
    logHandoutPreview('saved preview after save', {
      projectId: editor.currentProjectId,
      previewPath,
      dataUrlLength: dataUrl.length,
      previewBytes: dataUrlByteSize(dataUrl),
    })
    await editor.refreshProjects()
  }
}

async function exportCurrentImage() {
  if (isExportingCurrent.value) return
  const signature = JSON.stringify({ document: editor.document, scale: exportScale.value })
  if (lastCurrentExport.value?.signature === signature) {
    exportLog.value = `Unchanged image already exported to ${lastCurrentExport.value.path}`
    return
  }
  isExportingCurrent.value = true
  try {
    const dataUrl = await renderHandoutToDataUrl(editor.document, editor.library, exportScale.value, imageElements)
    const path = await exportImageToDownloads(downloadFileName(editor.document.title), dataUrl)
    lastCurrentExport.value = { signature, path }
    exportLog.value = `Exported image to ${path}`
  } finally {
    isExportingCurrent.value = false
  }
}

async function exportHandoutProject(project: ProjectSummary) {
  if (exportingHandoutIds.has(project.id)) return
  const signature = `${project.id}:${project.updatedAt}:1`
  const lastExport = lastHandoutExports.get(project.id)
  if (lastExport?.signature === signature) {
    exportLog.value = `Unchanged image already exported to ${lastExport.path}`
    return
  }
  exportingHandoutIds.add(project.id)
  try {
    const payload = await openManagedProject(project.id)
    const dataUrl = await renderHandoutToDataUrl(payload.document, editor.library, 1, imageElements)
    const path = await exportImageToDownloads(downloadFileName(payload.document.title), dataUrl)
    lastHandoutExports.set(project.id, { signature, path })
    exportLog.value = `Exported image to ${path}`
  } finally {
    exportingHandoutIds.delete(project.id)
  }
}

function selectedHandoutProject() {
  const selected = selectedFinderItems.handout
  if (selected.length !== 1) return undefined
  return projectFromFinderEntry(selected[0])
}

function selectedHandoutStatus() {
  const selected = selectedFinderItems.handout
  if (selected.length === 0) return 'No handout selected'
  if (selected.length > 1) return `${selected.length} items selected`
  const project = selectedHandoutProject()
  return project ? `Selected: ${project.title}` : 'Select a handout'
}

function isSelectedHandoutExporting() {
  const project = selectedHandoutProject()
  return Boolean(project && exportingHandoutIds.has(project.id))
}

async function exportSelectedHandout() {
  const project = selectedHandoutProject()
  if (!project) return
  await exportHandoutProject(project)
}

async function ensureProjectPreviews() {
  let generated = 0
  for (const project of editor.projects) {
    logHandoutPreview('project preview status', {
      projectId: project.id,
      title: project.title,
      previewPath: project.previewPath,
      previewSizeBytes: project.previewSizeBytes,
      backgroundAssetId: project.backgroundAssetId,
    })
    const shouldRegeneratePreview = !project.previewPath || Number(project.previewSizeBytes || 0) > PREVIEW_TARGET_BYTES
    if (!shouldRegeneratePreview) continue
    try {
      logHandoutPreview('generating preview', {
        projectId: project.id,
        title: project.title,
        currentPreviewPath: project.previewPath,
        currentPreviewSizeBytes: project.previewSizeBytes,
      })
      const payload = await openManagedProject(project.id)
      const dataUrl = await renderHandoutPreviewToDataUrl(payload.document, editor.library, imageElements)
      const previewPath = await saveProjectPreview(project.id, dataUrl)
      generated += 1
      logHandoutPreview('saved missing preview', {
        projectId: project.id,
        previewPath,
        dataUrlLength: dataUrl.length,
        previewBytes: dataUrlByteSize(dataUrl),
      })
    } catch (error) {
      logHandoutPreview('failed to generate preview', {
        projectId: project.id,
        title: project.title,
        error,
      })
    }
  }
  logHandoutPreview('preview generation complete', { generated })
  await editor.refreshProjects()
}

onMounted(async () => {
  try {
    resetKonvaDragButtons()
    await Promise.all([editor.refreshLibrary(), editor.refreshProjects()])
    syncImages(editor.library)
    await ensureProjectPreviews()
    window.addEventListener('keydown', handleGlobalKeydown)
    resizeStageViewport()
    window.addEventListener('resize', resizeStageViewport)
  } catch (error) {
    editor.status = String(error)
  } finally {
    isBooting.value = false
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('resize', resizeStageViewport)
})

watch(() => editor.library.backgrounds, () => syncImages(editor.library), { deep: true })
watch(() => editor.library.assets, () => syncImages(editor.library), { deep: true })
watch(() => editor.selectedLayerId, updateTransformer)
watch(() => editor.document.layers, updateTransformer, { deep: true })
watch(
  () => [editor.document.canvas.width, editor.document.canvas.height, editor.view],
  () => nextTick(() => {
    resizeStageViewport()
    resetCanvasView()
  }),
)
</script>

<template>
  <div v-if="isBooting" class="loading-shell">
    <div class="loading-mark">
      <span />
      <span />
      <span />
    </div>
    <strong>Handout Generator</strong>
    <p>Loading library and projects...</p>
  </div>

  <div v-else-if="editor.view === 'manager'" class="manager-shell">
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
          :features="finderFeaturesForKind('handout')"
          :config="{ maxFileSize: '100mb' }"
          :context-menu-items="handoutContextMenuItems"
          selection-mode="single"
          selection-filter-type="both"
          @select="(items) => handleFinderSelect('handout', items)"
          @path-change="(path) => handleFinderPathChange('handout', path)"
          @file-dclick="(event) => handleFinderFileDoubleClick('handout', event)"
        >
          <template #status-bar="{ count }">
            <div class="finder-status-bar">
              <span>{{ count }} items · {{ selectedHandoutStatus() }}</span>
              <Button
                size="sm"
                :disabled="!selectedHandoutProject() || isSelectedHandoutExporting()"
                @click="exportSelectedHandout"
              >
                <Save data-icon="inline-start" />
                Export PNG
              </Button>
            </div>
          </template>
        </VueFinder>
      </TabsContent>

      <TabsContent value="backgrounds" class="manager-tab-content">
        <VueFinder
          id="background-finder"
          class="manager-finder compact-finder"
          :driver="finderDrivers.background"
          :features="finderFeaturesForKind('background')"
          :config="{ maxFileSize: '100mb' }"
          :context-menu-items="imageHandoutContextMenuItems.background"
          selection-mode="single"
          selection-filter-type="both"
          @select="(items) => handleFinderSelect('background', items)"
          @path-change="(path) => handleFinderPathChange('background', path)"
          @file-dclick="(event) => handleFinderFileDoubleClick('background', event)"
        >
          <template #status-bar="{ count }">
            <div class="finder-status-bar">
              <span>{{ count }} items · {{ selectedImageStatus('background') }}</span>
              <Button
                size="sm"
                :disabled="!selectedImageRecord('background')"
                @click="createHandoutFromFinderImage('background')"
              >
                <Plus data-icon="inline-start" />
                Create handout
              </Button>
            </div>
          </template>
        </VueFinder>
      </TabsContent>

      <TabsContent value="assets" class="manager-tab-content">
        <VueFinder
          id="asset-finder"
          class="manager-finder compact-finder"
          :driver="finderDrivers.asset"
          :features="finderFeaturesForKind('asset')"
          :config="{ maxFileSize: '100mb' }"
          :context-menu-items="imageHandoutContextMenuItems.asset"
          selection-mode="single"
          selection-filter-type="both"
          @select="(items) => handleFinderSelect('asset', items)"
          @path-change="(path) => handleFinderPathChange('asset', path)"
          @file-dclick="(event) => handleFinderFileDoubleClick('asset', event)"
        >
          <template #status-bar="{ count }">
            <div class="finder-status-bar">
              <span>{{ count }} items · {{ selectedImageStatus('asset') }}</span>
              <Button
                size="sm"
                :disabled="!selectedImageRecord('asset')"
                @click="createHandoutFromFinderImage('asset')"
              >
                <Plus data-icon="inline-start" />
                Create handout
              </Button>
            </div>
          </template>
        </VueFinder>
      </TabsContent>

      <TabsContent value="fonts" class="manager-tab-content">
        <VueFinder
          id="font-finder"
          class="manager-finder compact-finder"
          :driver="finderDrivers.font"
          :features="finderFeaturesForKind('font')"
          :config="{ maxFileSize: '100mb' }"
          selection-mode="single"
          selection-filter-type="both"
          @select="(items) => handleFinderSelect('font', items)"
          @path-change="(path) => handleFinderPathChange('font', path)"
          @file-dclick="(event) => handleFinderFileDoubleClick('font', event)"
        />
        <Input v-model="fontSearch" placeholder="Search fonts or tags" />
        <div class="font-grid">
          <div v-for="font in filteredFonts" :key="font.id" class="font-card">
            <strong>{{ font.name }}</strong>
            <span>{{ font.tags.join(', ') || 'No tags' }}</span>
          </div>
        </div>
      </TabsContent>
    </Tabs>

    <CreateHandoutDialog
      v-model:open="isCreateDialogOpen"
      v-model:title="newProjectTitle"
      v-model:mode="createMode"
      v-model:width="blankWidth"
      v-model:height="blankHeight"
      @blank="createProject"
      @background-drop="handleCreateBackgroundDrop"
      @background-input="handleCreateBackgroundInput"
    />
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
          <VueFinder
            id="editor-asset-finder"
            class="rail-finder"
            :driver="finderDrivers.asset"
            :features="finderFeaturesForKind('asset')"
            :config="{ maxFileSize: '100mb' }"
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
              <span class="asset-thumb"><img :src="previewUrl(asset)" alt="" draggable="false" /></span>
              <span class="asset-meta">
                <strong>{{ asset.name }}</strong>
                <span>Click or drag to add · {{ asset.tags.join(', ') || 'No tags' }}</span>
              </span>
            </button>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="fonts" class="rail-tab-content">
          <VueFinder
            id="editor-font-finder"
            class="rail-finder"
            :driver="finderDrivers.font"
            :features="finderFeaturesForKind('font')"
            :config="{ maxFileSize: '100mb' }"
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
              :class="{ selected: editor.selectedLayerId === layer.id, dragging: draggedLayerId === layer.id }"
              role="button"
              tabindex="0"
              draggable="true"
              @click="selectCanvasLayer(layer.id)"
              @dragstart="startLayerListDrag(layer, $event)"
              @dragover.prevent
              @drop="handleLayerListDrop(layer, $event)"
              @dragend="draggedLayerId = ''"
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
        <div class="topbar-actions">
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
          <div class="zoom-controls">
            <Button size="icon" variant="outline" @click="zoomOut">
              <Minus />
            </Button>
            <Button size="sm" variant="outline" @click="resetCanvasView">Fit</Button>
            <Button size="icon" variant="outline" @click="zoomIn">
              <Plus />
            </Button>
          </div>
        </div>

        <div
          ref="stageFrameRef"
          class="stage-frame"
          :class="{ 'stage-frame-dropping': draggedAssetId, 'stage-frame-panning': panState.active }"
          @dragover.prevent
          @drop="handleCanvasAssetDrop"
          @wheel.prevent="handleCanvasWheel"
          @pointerdown="startCanvasPan"
          @pointermove="moveCanvasPan"
          @pointerup="stopCanvasPan"
          @pointerleave="stopCanvasPan"
        >
          <div class="stage-surface" :style="{ filter: documentFilterStyle }">
            <v-stage ref="stageRef" :config="stageConfig" @click="handleStagePointer" @tap="handleStagePointer">
              <v-layer>
              <v-group :config="contentGroupConfig">
                <v-rect
                  :config="{
                    name: 'canvas-background',
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
                    @dragmove="onDragMove(layer, $event)"
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
                    @dragmove="onDragMove(layer, $event)"
                    @dragend="onDragEnd(layer)"
                    @transformend="onTransformEnd(layer)"
                  />
                </template>
                <template v-for="guide in guideLines" :key="`${guide.orientation}-${guide.value}`">
                  <v-line
                    v-if="guide.orientation === 'vertical'"
                    :config="{
                      points: [guide.value, 0, guide.value, editor.document.canvas.height],
                      stroke: '#0ea5e9',
                      strokeWidth: 1 / stageScale,
                      dash: [6 / stageScale, 4 / stageScale],
                      listening: false,
                    }"
                  />
                  <v-line
                    v-else
                    :config="{
                      points: [0, guide.value, editor.document.canvas.width, guide.value],
                      stroke: '#0ea5e9',
                      strokeWidth: 1 / stageScale,
                      dash: [6 / stageScale, 4 / stageScale],
                      listening: false,
                    }"
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
              </v-group>
              </v-layer>
            </v-stage>
          </div>
        </div>
      </section>
    </main>

    <RightInspector
      v-model:export-scale="exportScale"
      :is-exporting="isExportingCurrent"
      :export-log="exportLog"
      @export-image="exportCurrentImage"
    />
  </div>
</template>
