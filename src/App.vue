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
import type { HandoutDocument, HandoutLayer, ImageLayer, TextLayer } from '@/lib/handout'
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
const exportProgress = ref(0)
const fitScale = ref(1)
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
const finderRevision = reactive<Record<'background' | 'asset' | 'font', number>>({
  background: 0,
  asset: 0,
  font: 0,
})
let previewMaintenanceRunning = false
let exportProgressTimer: number | undefined

const { imageElements, imageSize, loadImage, previewUrl, syncImages } = useResourceImages(blankWidth, blankHeight)

function computeFitScale() {
  const maxWidth = Math.max(240, stageViewport.width - 64)
  const maxHeight = Math.max(180, stageViewport.height - 64)
  return Math.min(maxWidth / editor.document.canvas.width, maxHeight / editor.document.canvas.height, 1)
}

const stageScale = computed(() => fitScale.value * canvasZoom.value)

const canvasLayers = computed(() => [...editor.document.layers].sort((a, b) => a.zIndex - b.zIndex))

const canvasSizeSignature = computed(() =>
  `${editor.document.canvas.width}:${editor.document.canvas.height}`,
)

const layerEffectsSignature = computed(() =>
  editor.document.layers
    .map((layer) => `${layer.id}:${JSON.stringify(layer.effects || {})}`)
    .join('|'),
)

const selectedLayerTransformSignature = computed(() => {
  const layer = editor.selectedLayer
  return layer
    ? [layer.id, layer.x, layer.y, layer.width, layer.height, layer.rotation, layer.visible, layer.locked].join(':')
    : ''
})

const selectedLayerRenderSignature = computed(() => {
  const layer = editor.selectedLayer
  return layer ? JSON.stringify(layer) : ''
})

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

const backgroundRenderSignature = computed(() => [
  editor.view,
  backgroundAsset.value?.id || 'none',
  backgroundImage.value?.naturalWidth || backgroundImage.value?.width || 0,
  backgroundImage.value?.naturalHeight || backgroundImage.value?.height || 0,
  editor.document.canvas.width,
  editor.document.canvas.height,
  stageViewport.width,
  stageViewport.height,
  fitScale.value,
  canvasZoom.value,
  canvasPan.x,
  canvasPan.y,
].join(':'))

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
  assetRecordFromDragPath,
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
  const previous = { width: stageViewport.width, height: stageViewport.height }
  stageViewport.width = Math.max(320, Math.round(rect.width))
  stageViewport.height = Math.max(240, Math.round(rect.height))
  if (previous.width !== stageViewport.width || previous.height !== stageViewport.height) {
    logViewport('resize-stage-viewport', { previous })
  }
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

function logViewport(message: string, data?: Record<string, unknown>) {
  const payload = serializableLogData({
    ...data,
    view: editor.view,
    viewport: { ...stageViewport },
    fitScale: fitScale.value,
    canvasZoom: canvasZoom.value,
    stageScale: stageScale.value,
    canvasPan: { ...canvasPan },
    canvas: {
      width: editor.document.canvas.width,
      height: editor.document.canvas.height,
    },
    selectedLayerId: editor.selectedLayerId,
  })
  console.debug(`[viewport] ${message}`, payload)
  void appendDebugLog('viewport', message, payload)
}

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000
}

function backgroundRenderMetrics() {
  const image = backgroundImage.value
  const sourceWidth = image?.naturalWidth || image?.width || 0
  const sourceHeight = image?.naturalHeight || image?.height || 0
  const canvasWidth = editor.document.canvas.width
  const canvasHeight = editor.document.canvas.height
  const screenWidth = canvasWidth * stageScale.value
  const screenHeight = canvasHeight * stageScale.value
  const left = canvasPan.x
  const top = canvasPan.y
  const right = left + screenWidth
  const bottom = top + screenHeight
  const imageScaleToCanvas = {
    x: sourceWidth ? canvasWidth / sourceWidth : 1,
    y: sourceHeight ? canvasHeight / sourceHeight : 1,
  }

  return {
    asset: backgroundAsset.value
      ? {
          id: backgroundAsset.value.id,
          name: backgroundAsset.value.name,
          path: backgroundAsset.value.path,
        }
      : null,
    sourceSize: {
      width: sourceWidth,
      height: sourceHeight,
    },
    canvasSize: {
      width: canvasWidth,
      height: canvasHeight,
    },
    imageScaleToCanvas: {
      x: roundMetric(imageScaleToCanvas.x),
      y: roundMetric(imageScaleToCanvas.y),
    },
    viewportScale: {
      fitScale: roundMetric(fitScale.value),
      canvasZoom: roundMetric(canvasZoom.value),
      stageScale: roundMetric(stageScale.value),
    },
    effectiveScreenScale: {
      x: roundMetric(imageScaleToCanvas.x * stageScale.value),
      y: roundMetric(imageScaleToCanvas.y * stageScale.value),
    },
    pan: {
      x: roundMetric(canvasPan.x),
      y: roundMetric(canvasPan.y),
    },
    corners: {
      topLeft: { x: roundMetric(left), y: roundMetric(top) },
      topRight: { x: roundMetric(right), y: roundMetric(top) },
      bottomRight: { x: roundMetric(right), y: roundMetric(bottom) },
      bottomLeft: { x: roundMetric(left), y: roundMetric(bottom) },
    },
    screenSize: {
      width: roundMetric(screenWidth),
      height: roundMetric(screenHeight),
    },
  }
}

function logBackgroundRender(message: string, data?: Record<string, unknown>) {
  const payload = serializableLogData({
    ...data,
    ...backgroundRenderMetrics(),
    selectedLayerId: editor.selectedLayerId,
  })
  console.debug(`[background-render] ${message}`, payload)
  void appendDebugLog('background-render', message, payload)
}

function logUpload(message: string, data?: Record<string, unknown>) {
  const payload = serializableLogData(data)
  console.debug(`[upload] ${message}`, payload)
  void appendDebugLog('upload', message, payload)
}

function logExport(message: string, data?: Record<string, unknown>) {
  const payload = serializableLogData(data)
  console.debug(`[export] ${message}`, payload)
  void appendDebugLog('export', message, payload)
}

function clampZoom(value: number) {
  return Math.min(8, Math.max(0.1, Number(value) || 1))
}

function fitCanvasView(reason = 'fit') {
  fitScale.value = computeFitScale()
  canvasZoom.value = 1
  canvasPan.x = Math.round((stageViewport.width - editor.document.canvas.width * stageScale.value) / 2)
  canvasPan.y = Math.round((stageViewport.height - editor.document.canvas.height * stageScale.value) / 2)
  logViewport('fit-canvas-view', { reason })
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
  logViewport('zoom-canvas', { nextZoom: canvasZoom.value, anchor })
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
  let asset = editor.resolveAsset(event.dataTransfer?.getData('application/x-handout-asset') || draggedAssetId.value)
  if (!asset) {
    const items = event.dataTransfer?.getData('items')
    if (items) {
      try {
        const paths = JSON.parse(items) as string[]
        asset = paths.map((path) => assetRecordFromDragPath(path)).find(Boolean)
      } catch (error) {
        logUpload('failed to parse vuefinder drag items', { error, items })
      }
    }
  }
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
  if (panState.active) logViewport('stop-canvas-pan')
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
  const width = Math.max(12, Math.round(node.width() * scaleX))
  const height = Math.max(12, Math.round(node.height() * scaleY))
  node.clearCache()
  node.scaleX(1)
  node.scaleY(1)
  node.width(width)
  node.height(height)
  editor.patchLayer(layer.id, {
    x: Math.round(position.x),
    y: Math.round(position.y),
    width,
    height,
    rotation: Math.round(node.rotation()),
  })
  logBackgroundRender('after-layer-transform', {
    layerId: layer.id,
    layerType: layer.type,
    layerBounds: { x: Math.round(position.x), y: Math.round(position.y), width, height },
  })
  void refreshLayerEffectCacheAfterUpdate(layer.id)
}

function onDragEnd(layer: HandoutLayer) {
  guideLines.value = []
  const node = layerNodeRefs[layer.id]?.getNode()
  if (!node) return
  node.clearCache()
  editor.patchLayer(layer.id, {
    x: Math.round(node.x()),
    y: Math.round(node.y()),
  })
  logBackgroundRender('after-layer-drag', {
    layerId: layer.id,
    layerType: layer.type,
    layerPosition: { x: Math.round(node.x()), y: Math.round(node.y()) },
  })
  void refreshLayerEffectCacheAfterUpdate(layer.id)
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
  const transformer = transformerRef.value?.getNode()
  if (!transformer) return
  const selected = editor.selectedLayerId ? layerNodeRefs[editor.selectedLayerId]?.getNode() : undefined
  transformer.nodes(selected ? [selected] : [])
  transformer.getLayer()?.batchDraw()
}

function refreshLayerEffectCache(layerId: string) {
  const layer = editor.document.layers.find((item) => item.id === layerId)
  const node = layerNodeRefs[layerId]?.getNode()
  if (!layer || !node) return
  node.clearCache()
  if (hasVisibleEffects(layer.effects)) node.cache()
  node.getLayer()?.batchDraw()
}

async function refreshLayerEffectCacheAfterUpdate(layerId: string) {
  await nextTick()
  refreshLayerEffectCache(layerId)
}

async function refreshLayerEffectCaches() {
  await nextTick()
  for (const layer of editor.document.layers) {
    refreshLayerEffectCache(layer.id)
  }
  stageRef.value?.getNode().batchDraw()
}

async function uploadFiles(kind: 'background' | 'asset' | 'font', files: FileList | File[], folder = '') {
  const fileArray = validUploadFiles(kind, Array.from(files))
  if (!fileArray.length) return []
  const imported: LibraryRecord[] = []
  for (const file of fileArray) {
    if (kind === 'background') imported.push(await editor.importBackgroundFile(file, '', folder))
    if (kind === 'asset') imported.push(await editor.importAssetFile(file, '', folder))
    if (kind === 'font') imported.push(await editor.importFontFile(file, '', folder))
  }
  await Promise.allSettled(
    imported
      .filter((record) => record.mediaType.startsWith('image/'))
      .map((record) => loadImage(record)),
  )
  finderRevision[kind] += 1
  logUpload('uploaded files', {
    kind,
    folder,
    files: fileArray.map((file) => ({ name: file.name, type: file.type, size: file.size })),
    imported: imported.map((record) => ({ id: record.id, name: record.name, path: record.path })),
  })
  return imported
}

function isSupportedUpload(kind: 'background' | 'asset' | 'font', file: File) {
  if (kind === 'background' || kind === 'asset') {
    return ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff', 'image/avif'].includes(file.type)
      || /\.(png|jpe?g|webp|gif|bmp|tiff?|tga|avif|qoi|ico)$/i.test(file.name)
  }
  return /\.(ttf|otf|woff2?)$/i.test(file.name)
}

function validUploadFiles(kind: 'background' | 'asset' | 'font', files: File[]) {
  const accepted = files.filter((file) => isSupportedUpload(kind, file))
  const rejected = files.filter((file) => !isSupportedUpload(kind, file))
  if (rejected.length) {
    const names = rejected.map((file) => file.name).join(', ')
    editor.status = `Unsupported ${kind} file${rejected.length > 1 ? 's' : ''}: ${names}`
    logUpload('rejected unsupported files', {
      kind,
      files: rejected.map((file) => ({ name: file.name, type: file.type, size: file.size })),
    })
  }
  return accepted
}

async function handleDirectFinderDrop(kind: 'background' | 'asset' | 'font', event: DragEvent) {
  const files = Array.from(event.dataTransfer?.files || [])
  if (!files.length) return
  event.preventDefault()
  event.stopPropagation()
  const folder = kind === 'background'
    ? selectedBackgroundFolder.value
    : kind === 'asset'
      ? selectedAssetFolder.value
      : selectedFontFolder.value
  await uploadFiles(kind, files, folder)
}

function handleDirectFinderDragover(kind: 'background' | 'asset' | 'font', event: DragEvent) {
  if (!event.dataTransfer?.types.includes('Files')) return
  event.dataTransfer.dropEffect = 'copy'
  event.dataTransfer.effectAllowed = 'copy'
  event.preventDefault()
  event.stopPropagation()
  if (editor.status !== `Drop ${kind} files to upload`) editor.status = `Drop ${kind} files to upload`
}

function beginExportProgress() {
  if (exportProgressTimer) window.clearInterval(exportProgressTimer)
  exportProgress.value = 0
  exportProgressTimer = window.setInterval(() => {
    const current = exportProgress.value
    if (current < 70) exportProgress.value = Math.min(70, current + Math.max(1, Math.round((70 - current) * 0.16)))
    else if (current < 95) exportProgress.value = Math.min(95, current + 1)
  }, 90)
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => globalThis.setTimeout(resolve, 0))
    })
  })
}

async function prepareExportProgress() {
  beginExportProgress()
  await nextTick()
  exportProgress.value = 1
  await nextTick()
  await waitForNextPaint()
}

function finishExportProgress(success: boolean) {
  if (exportProgressTimer) window.clearInterval(exportProgressTimer)
  exportProgressTimer = undefined
  exportProgress.value = success ? 100 : 0
}

async function ensureDocumentImages(document: HandoutDocument) {
  const records = [
    editor.resolveBackground(document.canvas.backgroundAssetId) || editor.resolveAsset(document.canvas.backgroundAssetId),
    ...document.layers
      .filter(isImageLayer)
      .map((layer) => editor.resolveAsset(layer.assetId) || editor.resolveBackground(layer.assetId)),
  ].filter(Boolean) as LibraryRecord[]
  await Promise.allSettled(records.map((record) => loadImage(record)))
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
  if (!background) return
  await createProjectFromBackground(background)
  ;(event.target as HTMLInputElement).value = ''
}

async function handleCreateBackgroundDrop(event: DragEvent) {
  event.preventDefault()
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  const [background] = await uploadFiles('background', [file], selectedBackgroundFolder.value)
  if (!background) return
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
  const clickedAt = performance.now()
  isExportingCurrent.value = true
  await prepareExportProgress()
  exportLog.value = 'Preparing export...'
  const clickToProgressMs = Math.round(performance.now() - clickedAt)
  logExport('export current start', { title: editor.document.title, scale: exportScale.value, clickToProgressMs })
  try {
    const signatureStartedAt = performance.now()
    const signature = JSON.stringify({ document: editor.document, scale: exportScale.value })
    const signatureMs = Math.round(performance.now() - signatureStartedAt)
    if (lastCurrentExport.value?.signature === signature) {
      exportLog.value = `Unchanged image already exported to ${lastCurrentExport.value.path}`
      logExport('export current unchanged', { signatureMs, clickToProgressMs, path: lastCurrentExport.value.path })
      finishExportProgress(false)
      return
    }
    const imageLoadStartedAt = performance.now()
    await ensureDocumentImages(editor.document)
    const imageLoadMs = Math.round(performance.now() - imageLoadStartedAt)
    const renderStartedAt = performance.now()
    const dataUrl = await renderHandoutToDataUrl(editor.document, editor.library, exportScale.value, imageElements)
    const konvaRenderMs = Math.round(performance.now() - renderStartedAt)
    logExport('export current render complete', { signatureMs, imageLoadMs, konvaRenderMs, bytes: dataUrlByteSize(dataUrl) })
    const writeStartedAt = performance.now()
    const path = await exportImageToDownloads(downloadFileName(editor.document.title), dataUrl)
    const writeMs = Math.round(performance.now() - writeStartedAt)
    lastCurrentExport.value = { signature, path }
    exportLog.value = `Exported image to ${path}`
    logExport('export current complete', { path, bytes: dataUrlByteSize(dataUrl), clickToProgressMs, signatureMs, imageLoadMs, konvaRenderMs, writeMs })
    finishExportProgress(true)
  } catch (error) {
    exportLog.value = `Export failed: ${String(error)}`
    logExport('export current failed', { error })
    finishExportProgress(false)
  } finally {
    isExportingCurrent.value = false
  }
}

async function exportHandoutProject(project: ProjectSummary) {
  if (exportingHandoutIds.has(project.id)) return
  const clickedAt = performance.now()
  exportingHandoutIds.add(project.id)
  await prepareExportProgress()
  exportLog.value = 'Preparing export...'
  const clickToProgressMs = Math.round(performance.now() - clickedAt)
  logExport('export handout start', { projectId: project.id, title: project.title, clickToProgressMs })
  try {
    const signatureStartedAt = performance.now()
    const signature = `${project.id}:${project.updatedAt}:1`
    const lastExport = lastHandoutExports.get(project.id)
    const signatureMs = Math.round(performance.now() - signatureStartedAt)
    if (lastExport?.signature === signature) {
      exportLog.value = `Unchanged image already exported to ${lastExport.path}`
      logExport('export handout unchanged', { projectId: project.id, signatureMs, clickToProgressMs, path: lastExport.path })
      finishExportProgress(false)
      return
    }
    const openStartedAt = performance.now()
    const payload = await openManagedProject(project.id)
    const openDurationMs = Math.round(performance.now() - openStartedAt)
    const imageLoadStartedAt = performance.now()
    await ensureDocumentImages(payload.document)
    const imageLoadMs = Math.round(performance.now() - imageLoadStartedAt)
    const renderStartedAt = performance.now()
    const dataUrl = await renderHandoutToDataUrl(payload.document, editor.library, 1, imageElements)
    const konvaRenderMs = Math.round(performance.now() - renderStartedAt)
    logExport('export handout render complete', { projectId: project.id, openDurationMs, signatureMs, imageLoadMs, konvaRenderMs, bytes: dataUrlByteSize(dataUrl) })
    const writeStartedAt = performance.now()
    const path = await exportImageToDownloads(downloadFileName(payload.document.title), dataUrl)
    const writeMs = Math.round(performance.now() - writeStartedAt)
    lastHandoutExports.set(project.id, { signature, path })
    exportLog.value = `Exported image to ${path}`
    logExport('export handout complete', { projectId: project.id, path, bytes: dataUrlByteSize(dataUrl), clickToProgressMs, openDurationMs, signatureMs, imageLoadMs, konvaRenderMs, writeMs })
    finishExportProgress(true)
  } catch (error) {
    exportLog.value = `Export failed: ${String(error)}`
    logExport('export handout failed', { projectId: project.id, error })
    finishExportProgress(false)
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
  if (previewMaintenanceRunning) return
  previewMaintenanceRunning = true
  let generated = 0
  try {
    for (const project of editor.projects) {
      const shouldRegeneratePreview = !project.previewPath
        || !project.previewPath.endsWith('preview.webp')
        || Number(project.previewSizeBytes || 0) > PREVIEW_TARGET_BYTES
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
        logHandoutPreview('saved preview', {
          projectId: project.id,
          previewPath,
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
    if (generated > 0) {
      logHandoutPreview('preview generation complete', { generated })
      await editor.refreshProjects()
    }
  } finally {
    previewMaintenanceRunning = false
  }
}

onMounted(async () => {
  try {
    resetKonvaDragButtons()
    void appendDebugLog('app', 'boot start')
    await Promise.all([editor.refreshLibrary(), editor.refreshProjects()])
    void syncImages(editor.library)
    window.addEventListener('keydown', handleGlobalKeydown)
    resizeStageViewport()
    window.addEventListener('resize', resizeStageViewport)
    isBooting.value = false
    await nextTick()
    void editor.repairLibraryThumbnails()
      .then(() => {
        finderRevision.background += 1
        finderRevision.asset += 1
      })
      .catch((error) => logUpload('thumbnail repair failed', { error }))
    void ensureProjectPreviews()
  } catch (error) {
    editor.status = String(error)
    void appendDebugLog('app', 'boot failed', serializableLogData({ error }))
    isBooting.value = false
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('resize', resizeStageViewport)
  if (exportProgressTimer) window.clearInterval(exportProgressTimer)
})

watch(() => editor.library.backgrounds, () => { void syncImages(editor.library) }, { deep: true })
watch(() => editor.library.assets, () => { void syncImages(editor.library) }, { deep: true })
watch(() => editor.selectedLayerId, updateTransformer)
watch(selectedLayerTransformSignature, updateTransformer)
watch(selectedLayerRenderSignature, () => {
  if (editor.selectedLayerId) void refreshLayerEffectCacheAfterUpdate(editor.selectedLayerId)
})
watch(layerEffectsSignature, () => { void refreshLayerEffectCaches() })
watch(
  backgroundRenderSignature,
  () => {
    if (editor.view !== 'editor') return
    void nextTick(() => logBackgroundRender('render-signature-change'))
  },
  { flush: 'post' },
)
watch(
  canvasSizeSignature,
  () => nextTick(() => {
    resizeStageViewport()
    fitCanvasView('canvas-size')
  }),
)
watch(
  () => editor.view,
  () => nextTick(() => {
    resizeStageViewport()
    if (editor.view === 'editor') fitCanvasView('enter-editor')
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
          :key="`background-${finderRevision.background}`"
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
          @dragover.capture="handleDirectFinderDragover('background', $event as DragEvent)"
          @drop.capture="handleDirectFinderDrop('background', $event as DragEvent)"
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
          :key="`asset-${finderRevision.asset}`"
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
          @dragover.capture="handleDirectFinderDragover('asset', $event as DragEvent)"
          @drop.capture="handleDirectFinderDrop('asset', $event as DragEvent)"
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
          :key="`font-${finderRevision.font}`"
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
          @dragover.capture="handleDirectFinderDragover('font', $event as DragEvent)"
          @drop.capture="handleDirectFinderDrop('font', $event as DragEvent)"
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
            :key="`editor-asset-${finderRevision.asset}`"
            id="editor-asset-finder"
            class="rail-finder"
            :driver="finderDrivers.asset"
            :features="finderFeaturesForKind('asset')"
            :config="{ maxFileSize: '100mb' }"
            selection-mode="single"
            selection-filter-type="both"
            @path-change="(path) => handleFinderPathChange('asset', path)"
            @file-dclick="(event) => handleFinderFileDoubleClick('asset', event)"
            @dragover.capture="handleDirectFinderDragover('asset', $event as DragEvent)"
            @drop.capture="handleDirectFinderDrop('asset', $event as DragEvent)"
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
            :key="`editor-font-${finderRevision.font}`"
            id="editor-font-finder"
            class="rail-finder"
            :driver="finderDrivers.font"
            :features="finderFeaturesForKind('font')"
            :config="{ maxFileSize: '100mb' }"
            selection-mode="single"
            selection-filter-type="both"
            @path-change="(path) => handleFinderPathChange('font', path)"
            @file-dclick="(event) => handleFinderFileDoubleClick('font', event)"
            @dragover.capture="handleDirectFinderDragover('font', $event as DragEvent)"
            @drop.capture="handleDirectFinderDrop('font', $event as DragEvent)"
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
            <Button size="sm" variant="outline" @click="fitCanvasView('button')">Fit</Button>
            <Button size="icon" variant="outline" @click="zoomIn">
              <Plus />
            </Button>
          </div>
        </div>

        <div
          ref="stageFrameRef"
          class="stage-frame"
          :class="{ 'stage-frame-dropping': draggedAssetId, 'stage-frame-panning': panState.active }"
          @dragover.capture.prevent
          @drop.capture="handleCanvasAssetDrop"
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
                <template v-for="layer in canvasLayers" :key="layer.id">
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
      :export-progress="exportProgress"
      @export-image="exportCurrentImage"
    />
  </div>
</template>
