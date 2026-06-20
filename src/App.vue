<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Konva from 'konva'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Brush,
  Eraser,
  Minus,
  Eye,
  EyeOff,
  Layers,
  MousePointer2,
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
import { useCanvasViewport } from '@/composables/useCanvasViewport'
import { useEditorDragPayloads } from '@/composables/useEditorDragPayloads'
import { useHandoutExport } from '@/composables/useHandoutExport'
import { useResourceImages } from '@/composables/useResourceImages'
import {
  appendDebugLog,
  fontRecordFamily,
  openManagedProject,
  saveProjectPreview,
  type LibraryRecord,
} from '@/lib/backend'
import { createDebugLogger, serializableLogData, writeDebugLog } from '@/lib/debug-log'
import { hasVisibleEffects } from '@/lib/effects'
import { isEditableTarget } from '@/lib/dom'
import type { CanvasPoint, CurvePoints, HandoutLayer, ImageLayer, PaintLayer, PaintStroke, ShapeKind, ShapeLayer, TextLayer } from '@/lib/handout'
import { isCurveShape } from '@/lib/handout'
import { appConfiguration } from '@/lib/configuration'
import { layerKonvaConfig, layerPositionFromNode, textKonvaConfig } from '@/lib/layer-rendering'
import { paintKonvaConfig, paintStrokeLineConfig } from '@/lib/paint-rendering'
import { dataUrlByteSize, renderHandoutPreviewToDataUrl } from '@/lib/render'
import { containsRect } from '@/lib/selection'
import {
  arrowDotConfig,
  arrowLineConfig,
  lineDoubleOffset,
  lineHandleConfig,
  lineHitConfig,
  lineVisualConfig,
  manualArrowVisible,
  shapeKonvaConfig,
  shapePreviewPoints,
  showLineHandle,
} from '@/lib/shape-rendering'
import { shapeItems } from '@/lib/shape-items'
import { calculateSnapGuides, SNAP_THRESHOLD_SCREEN_PX, type GuideLine, type SnapLayer } from '@/lib/snapping'
import { partitionUploadFiles, type UploadKind } from '@/lib/upload-validation'
import { isImageLayer, isPaintLayer, isTextLayer, useEditorStore } from '@/stores/editor'

type NodeRef = { getNode: () => Konva.Node }
type KonvaEvent = { target: Konva.Node; evt?: MouseEvent; cancelBubble?: boolean }
type SelectionBox = { visible: boolean; startX: number; startY: number; x: number; y: number; width: number; height: number }
type EditorTool = 'select' | 'brush' | 'eraser'
type CurvePointKey = 'start' | 'control' | 'control1' | 'control2' | 'end'

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
const guideLines = ref<GuideLine[]>([])
const selectionBox = reactive<SelectionBox>({ visible: false, startX: 0, startY: 0, x: 0, y: 0, width: 0, height: 0 })
const activeTool = ref<EditorTool>('select')
const draftStroke = ref<PaintStroke>()
const curveControlRevision = ref(0)
const multiDragState = reactive({
  active: false,
  layerId: '',
  originX: 0,
  originY: 0,
  positions: {} as Record<string, { x: number; y: number }>,
})
const assetSearch = ref('')
const fontSearch = ref('')
const selectedProjectFolder = ref('')
const selectedBackgroundFolder = ref('')
const selectedAssetFolder = ref('')
const selectedFontFolder = ref('')
const isBooting = ref(true)
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
const finderUploadConfig = { maxFileSize: appConfiguration.uploads.maxFileSize }
const handoutFinderStyle = { '--finder-grid-scale': String(appConfiguration.finder.handoutGridScale) }
const backgroundFinderStyle = { '--finder-grid-scale': String(appConfiguration.finder.backgroundGridScale) }
const EDITOR_EFFECT_CACHE_MAX_EDGE = 768
let previewMaintenanceRunning = false
let effectCacheRaf: number | undefined
let lastSnapLogSignature = ''
let lastEllipseDragLogSignature = ''
let lastFontDragOverLogAt = 0
let suppressNextStageClick = false
let lastLayerListSelectionId = ''
const pendingEffectCacheLayerIds = new Set<string>()
const logHandoutPreview = createDebugLogger('handout-preview')
const logText = createDebugLogger('text')
const logUpload = createDebugLogger('upload')
const logExport = createDebugLogger('export')
const logSnap = createDebugLogger('snap')
const logShape = createDebugLogger('shape')
const {
  draggedAssetId,
  draggedFontId,
  draggedShapeKind,
  startAssetDrag,
  clearAssetDrag,
  startFontDrag,
  prepareFontDrag,
  clearFontDrag,
  startShapeDrag,
  clearShapeDrag,
} = useEditorDragPayloads({
  fontFamily,
  logText,
})

const { imageElements, imageSize, loadImage, previewUrl, syncImages } = useResourceImages(blankWidth, blankHeight)
const {
  exportProgress,
  exportScale,
  exportFormat,
  exportQuality,
  exportLog,
  isExportingCurrent,
  exportCurrentImage,
  exportHandoutProject,
  isHandoutExporting,
  cleanupExportProgress,
} = useHandoutExport({
  editor,
  imageElements,
  loadImage,
  logExport,
})
const {
  fitScale,
  canvasZoom,
  canvasPan,
  panState,
  stageViewport,
  stageScale,
  stageConfig,
  contentGroupConfig,
  resizeStageViewport,
  fitCanvasView,
  zoomIn,
  zoomOut,
  canvasPointFromClient,
  startCanvasPan,
  moveCanvasPan,
  stopCanvasPan,
  handleCanvasWheel,
} = useCanvasViewport({
  document: editor.document,
  stageRef,
  stageFrameRef,
  logViewport,
})
const canvasLayers = computed(() => [...editor.document.layers].sort((a, b) => a.zIndex - b.zIndex))
const selectedCurveLayers = computed(() =>
  canvasLayers.value.filter((layer): layer is ShapeLayer =>
    isShapeLayer(layer) && isCurveShape(layer.shape) && editor.selectedLayerIds.includes(layer.id),
  ),
)

const canvasSizeSignature = computed(() =>
  `${editor.document.canvas.width}:${editor.document.canvas.height}`,
)

const layerEffectsSignature = computed(() =>
  editor.document.layers
    .map((layer) => `${layer.id}:${JSON.stringify(layer.effects || {})}`)
    .join('|'),
)

const textLayerRenderSignature = computed(() =>
  editor.document.layers
    .filter(isTextLayer)
    .map((layer) => [
      layer.id,
      layer.text,
      layer.fontId,
      layer.fontFamily,
      layer.fontSize,
      layer.fontWeight,
      layer.italic,
      layer.underline,
      layer.strikethrough,
      layer.width,
      layer.height,
      layer.lineHeight,
      layer.align,
    ].join(':'))
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
  if (!layer) return ''
  const { effects: _effects, ...cacheRelevantLayer } = layer
  return JSON.stringify(cacheRelevantLayer)
})

const selectedLayerIdsSignature = computed(() => editor.selectedLayerIds.join('|'))

const selectedOnlyLineShape = computed(() =>
  editor.selectedLayers.length === 1
  && isShapeLayer(editor.selectedLayers[0])
  && editor.selectedLayers[0].shape === 'line',
)
const selectedOnlyCurveShape = computed(() =>
  editor.selectedLayers.length === 1
  && isShapeLayer(editor.selectedLayers[0])
  && isCurveShape(editor.selectedLayers[0].shape),
)
const selectedOnlyTextLayer = computed(() =>
  editor.selectedLayers.length === 1 && isTextLayer(editor.selectedLayers[0]),
)

const transformerConfig = computed(() => ({
  rotateEnabled: true,
  ignoreStroke: true,
  keepRatio: false,
  shiftBehavior: 'none',
  rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
  rotationSnapTolerance: 6,
  enabledAnchors: selectedOnlyCurveShape.value
    ? []
    : selectedOnlyLineShape.value
    ? ['middle-left', 'middle-right']
    : selectedOnlyTextLayer.value
      ? ['middle-left', 'middle-right']
      : ['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left'],
  boundBoxFunc: (oldBox: unknown, newBox: { width: number; height: number }) => {
    if (selectedOnlyLineShape.value) return Math.abs(newBox.width) < 12 ? oldBox : newBox
    if (selectedOnlyTextLayer.value) return Math.abs(newBox.width) < 24 ? oldBox : newBox
    return newBox.width < 12 || newBox.height < 12 ? oldBox : newBox
  },
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

function layerName(layer: HandoutLayer) {
  if (isTextLayer(layer)) return layer.text || layer.name
  return layer.name
}

function imageForLayer(layer: ImageLayer) {
  const asset = editor.resolveAsset(layer.assetId)
  return asset ? imageElements[asset.id] : undefined
}

function isShapeLayer(layer: HandoutLayer): layer is ShapeLayer {
  return layer.type === 'shape'
}

function fontFamily(font: LibraryRecord) {
  return fontRecordFamily(font)
}

function logViewport(message: string, data?: Record<string, unknown>) {
  writeDebugLog('viewport', message, {
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
  writeDebugLog('background-render', message, {
    ...data,
    ...backgroundRenderMetrics(),
    selectedLayerId: editor.selectedLayerId,
  })
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

function selectLayerFromList(layerId: string, event?: MouseEvent | KeyboardEvent) {
  if (event?.shiftKey && lastLayerListSelectionId) {
    const layerIds = editor.layers.map((layer) => layer.id)
    const from = layerIds.indexOf(lastLayerListSelectionId)
    const to = layerIds.indexOf(layerId)
    if (from >= 0 && to >= 0) {
      const [start, end] = from < to ? [from, to] : [to, from]
      editor.setLayerSelection(layerIds.slice(start, end + 1))
    } else {
      editor.setLayerSelection([layerId])
    }
  } else if (event?.metaKey) {
    editor.toggleLayerSelection(layerId)
  } else {
    editor.selectLayer(layerId)
  }
  lastLayerListSelectionId = layerId
  void updateTransformer()
}

function toggleLayerVisibility(layer: HandoutLayer) {
  editor.patchLayer(layer.id, { visible: !layer.visible })
  void updateTransformer()
}

async function addAssetToCanvas(asset: LibraryRecord) {
  const size = await imageSize(asset)
  editor.addLayerFromAsset(asset, size)
  void updateTransformer()
}

function addFontTextToCanvas(font: LibraryRecord, position?: { x?: number; y?: number }) {
  logText('font-create-text', {
    fontId: font.id,
    name: font.name,
    family: fontFamily(font),
    position,
  })
  editor.applyOrCreateTextWithFont(font, position)
  void updateTransformer()
}

function createFontTextOnCanvas(font: LibraryRecord, position?: { x?: number; y?: number }) {
  logText('font-drop-create-text', {
    fontId: font.id,
    name: font.name,
    family: fontFamily(font),
    position,
  })
  editor.addText(font, position)
  void updateTransformer()
}

function addShapeToCanvas(shape: ShapeKind, position?: { x?: number; y?: number }) {
  editor.addShape(shape, position)
  void updateTransformer()
}

function handleCanvasDrop(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  const point = canvasPointFromClient(event.clientX, event.clientY)

  const fontId = event.dataTransfer?.getData('application/x-handout-font') || draggedFontId.value
  const fontName = event.dataTransfer?.getData('application/x-handout-font-name') || event.dataTransfer?.getData('text/plain') || ''
  const fontFamilyName = event.dataTransfer?.getData('application/x-handout-font-family') || ''
  logText('canvas-drop', {
    fontId,
    fontName,
    fontFamilyName,
    draggedFontId: draggedFontId.value,
    types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
    position: point,
  })
  const font = editor.resolveFont(fontId)
    || editor.library.fonts.find((item) => item.name === fontName || fontFamily(item) === fontName || fontFamily(item) === fontFamilyName)
  if (font) {
    createFontTextOnCanvas(font, point)
    draggedFontId.value = ''
    return
  }

  const shape = (event.dataTransfer?.getData('application/x-handout-shape') || draggedShapeKind.value) as ShapeKind | ''
  if (shape && shapeItems.some((item) => item.kind === shape)) {
    addShapeToCanvas(shape, point)
    draggedShapeKind.value = undefined
    return
  }

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
  void imageSize(asset).then((size) => {
    editor.addLayerFromAssetAt(asset, point.x, point.y, size)
    void updateTransformer()
  })
  draggedAssetId.value = ''
}

function handleCanvasDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function pointInsideStageFrame(clientX: number, clientY: number) {
  const rect = stageFrameRef.value?.getBoundingClientRect()
  if (!rect) return false
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}

function handleDocumentFontDragOver(event: DragEvent) {
  if (!draggedFontId.value || !pointInsideStageFrame(event.clientX, event.clientY)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  const now = window.performance.now()
  if (now - lastFontDragOverLogAt > 300) {
    lastFontDragOverLogAt = now
    logText('font-document-dragover', {
      draggedFontId: draggedFontId.value,
      types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
      client: { x: event.clientX, y: event.clientY },
      canvas: canvasPointFromClient(event.clientX, event.clientY),
    })
  }
}

function handleDocumentFontDrop(event: DragEvent) {
  if (!draggedFontId.value || !pointInsideStageFrame(event.clientX, event.clientY)) return
  event.preventDefault()
  const font = editor.resolveFont(draggedFontId.value)
  logText('font-document-drop', {
    draggedFontId: draggedFontId.value,
    resolved: Boolean(font),
    client: { x: event.clientX, y: event.clientY },
    canvas: canvasPointFromClient(event.clientX, event.clientY),
  })
  if (!font) return
  createFontTextOnCanvas(font, canvasPointFromClient(event.clientX, event.clientY))
  draggedFontId.value = ''
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
    ...layerKonvaConfig(layer),
    draggable: activeTool.value === 'select' && !layer.locked,
  }
}

function textConfig(layer: TextLayer) {
  const resolvedFont = editor.resolveFont(layer.fontId)
  const family = resolvedFont ? fontFamily(resolvedFont) : layer.fontFamily
  return textKonvaConfig(layer, family)
}

function shapeConfig(layer: ShapeLayer) {
  return shapeKonvaConfig(layer, layerConfig(layer))
}

function paintConfig(layer: PaintLayer) {
  return paintKonvaConfig(layer, layerConfig(layer))
}

function setActiveTool(tool: EditorTool) {
  activeTool.value = tool
}

function activePaintDefaults() {
  const layer = isPaintLayer(editor.selectedLayer) ? editor.selectedLayer : undefined
  const mode = activeTool.value === 'eraser' ? 'eraser' : 'brush'
  return {
    color: layer?.brushColor ?? '#111827',
    width: mode === 'eraser' ? layer?.eraserWidth ?? 12 : layer?.brushWidth ?? 6,
    tension: layer?.brushTension ?? 0.35,
  }
}

function localizeStrokePoints(points: number[], layer?: PaintLayer) {
  if (!layer) return points
  const next: number[] = []
  for (let index = 0; index < points.length; index += 2) {
    next.push(points[index] - layer.x, points[index + 1] - layer.y)
  }
  return next
}

function startPaintStroke(event: KonvaEvent) {
  if (event.evt?.button !== 0) return false
  const point = canvasPointFromClient(event.evt.clientX, event.evt.clientY)
  const defaults = activePaintDefaults()
  draftStroke.value = {
    id: crypto.randomUUID(),
    points: [point.x, point.y],
    strokeWidth: defaults.width,
    color: defaults.color,
    tension: defaults.tension,
    mode: activeTool.value === 'eraser' ? 'eraser' : 'brush',
  }
  event.cancelBubble = true
  return true
}

function movePaintStroke(event: KonvaEvent) {
  if (!draftStroke.value || !event.evt) return false
  const point = canvasPointFromClient(event.evt.clientX, event.evt.clientY)
  const points = draftStroke.value.points
  const lastX = points.at(-2)
  const lastY = points.at(-1)
  if (lastX !== undefined && lastY !== undefined && Math.hypot(point.x - lastX, point.y - lastY) < 0.5) return true
  draftStroke.value = {
    ...draftStroke.value,
    points: [...points, point.x, point.y],
  }
  event.cancelBubble = true
  return true
}

function stopPaintStroke() {
  if (!draftStroke.value) return false
  const selectedPaint = isPaintLayer(editor.selectedLayer) ? editor.selectedLayer : undefined
  const stroke = {
    ...draftStroke.value,
    points: localizeStrokePoints(draftStroke.value.points, selectedPaint),
  }
  if (stroke.points.length === 2) stroke.points = [...stroke.points, stroke.points[0] + 0.1, stroke.points[1] + 0.1]
  editor.appendStrokeToPaintLayer(stroke)
  draftStroke.value = undefined
  void updateTransformer()
  return true
}

function curvePointKeys(layer: ShapeLayer): CurvePointKey[] {
  if (layer.shape === 'quadratic-curve') return ['start', 'control', 'end']
  if (layer.shape === 'cubic-bezier') return ['start', 'control1', 'control2', 'end']
  return []
}

function curvePoint(layer: ShapeLayer, key: CurvePointKey) {
  return layer.curvePoints?.[key]
}

function curveNode(layer: ShapeLayer) {
  return layerNodeRefs[layer.id]?.getNode()
}

function transformedCurvePoint(layer: ShapeLayer, point?: CanvasPoint) {
  void curveControlRevision.value
  if (!point) return { x: layer.x, y: layer.y }
  const node = curveNode(layer)
  if (!node) return { x: layer.x + point.x, y: layer.y + point.y }
  return node.getTransform().point(point)
}

function curveHandleConfig(layer: ShapeLayer, key: CurvePointKey) {
  const point = transformedCurvePoint(layer, curvePoint(layer, key))
  return {
    x: point.x,
    y: point.y,
    radius: 5 / stageScale.value,
    fill: key === 'start' || key === 'end' ? '#14b8a6' : '#f59e0b',
    stroke: '#ffffff',
    strokeWidth: 1.5 / stageScale.value,
    draggable: true,
  }
}

function curveGuideConfig(layer: ShapeLayer) {
  const points = layer.curvePoints
  if (!points) return []
  if (layer.shape === 'quadratic-curve' && points.control) {
    return [
      [points.start, points.control],
      [points.control, points.end],
    ]
  }
  if (layer.shape === 'cubic-bezier' && points.control1 && points.control2) {
    return [
      [points.start, points.control1],
      [points.control2, points.end],
    ]
  }
  return []
}

function curveGuideLineConfig(layer: ShapeLayer, guide: CanvasPoint[]) {
  return {
    points: guide.flatMap((point) => {
      const transformed = transformedCurvePoint(layer, point)
      return [transformed.x, transformed.y]
    }),
    stroke: '#94a3b8',
    strokeWidth: 1 / stageScale.value,
    dash: [4 / stageScale.value, 4 / stageScale.value],
    listening: false,
  }
}

function normalizeCurveLayerPatch(layer: ShapeLayer, curvePoints: CurvePoints) {
  const points = curvePointKeys(layer)
    .map((key) => curvePoints[key])
    .filter((point): point is CanvasPoint => Boolean(point))
  const minX = Math.min(...points.map((point) => point.x), 0)
  const minY = Math.min(...points.map((point) => point.y), 0)
  const maxX = Math.max(...points.map((point) => point.x), layer.width)
  const maxY = Math.max(...points.map((point) => point.y), layer.height)
  if (minX >= 0 && minY >= 0 && maxX <= layer.width && maxY <= layer.height) return { curvePoints }
  const normalized: CurvePoints = {
    start: { x: curvePoints.start.x - minX, y: curvePoints.start.y - minY },
    control: curvePoints.control ? { x: curvePoints.control.x - minX, y: curvePoints.control.y - minY } : undefined,
    control1: curvePoints.control1 ? { x: curvePoints.control1.x - minX, y: curvePoints.control1.y - minY } : undefined,
    control2: curvePoints.control2 ? { x: curvePoints.control2.x - minX, y: curvePoints.control2.y - minY } : undefined,
    end: { x: curvePoints.end.x - minX, y: curvePoints.end.y - minY },
  }
  return {
    x: Math.round(layer.x + minX),
    y: Math.round(layer.y + minY),
    width: Math.max(12, Math.ceil(maxX - minX)),
    height: Math.max(12, Math.ceil(maxY - minY)),
    curvePoints: normalized,
  }
}

function moveCurvePoint(layer: ShapeLayer, key: CurvePointKey, event: KonvaEvent) {
  const node = event.target
  const curveTransform = curveNode(layer)?.getTransform().copy().invert()
  const local = curveTransform?.point({ x: node.x(), y: node.y() }) ?? { x: node.x() - layer.x, y: node.y() - layer.y }
  const point = { x: Math.round(local.x), y: Math.round(local.y) }
  const curvePoints: CurvePoints = {
    ...(layer.curvePoints ?? {
      start: { x: 0, y: 0 },
      end: { x: layer.width, y: layer.height },
    }),
    [key]: point,
  }
  editor.patchLayerContinuous(layer.id, `curve-point-${layer.id}-${key}`, normalizeCurveLayerPatch(layer, curvePoints))
  curveControlRevision.value += 1
}

function endCurvePointMove(layer: ShapeLayer, key: CurvePointKey) {
  editor.endContinuousEdit(`curve-point-${layer.id}-${key}`)
}

async function logTextLayerMetrics(reason: string) {
  await nextTick()
  for (const layer of editor.document.layers.filter(isTextLayer)) {
    const node = layerNodeRefs[layer.id]?.getNode() as Konva.Text | undefined
    const font = editor.resolveFont(layer.fontId)
    logText('text-layer-render', {
      reason,
      layerId: layer.id,
      text: layer.text,
      fontId: layer.fontId,
      fontName: font?.name,
      fontPath: font?.path,
      recordFontFamily: font?.fontFamily,
      fontFamily: layer.fontFamily,
      renderFontFamily: font ? fontFamily(font) : layer.fontFamily,
      fontSize: layer.fontSize,
      fontStyle: `${layer.italic ? 'italic ' : ''}${layer.fontWeight || 400}`,
      lineHeight: layer.lineHeight,
      nodeExists: Boolean(node),
      fontCheck: globalThis.document.fonts?.check?.(`${layer.fontSize}px "${font ? fontFamily(font) : layer.fontFamily}"`),
      textWidth: node?.textWidth,
      textHeight: node?.textHeight,
      clientRect: node?.getClientRect({ skipTransform: true }),
      absoluteScale: node?.getAbsoluteScale(),
    })
  }
}

async function autoResizeTextLayerHeights() {
  await nextTick()
  const patches: Array<{ id: string; height: number }> = []
  for (const layer of editor.document.layers.filter(isTextLayer)) {
    const node = layerNodeRefs[layer.id]?.getNode() as Konva.Text | undefined
    if (!node) continue
    const height = Math.max(12, Math.ceil(node.getClientRect({ skipTransform: true }).height))
    if (Math.abs(height - layer.height) > 1) patches.push({ id: layer.id, height })
  }
  for (const patch of patches) editor.patchLayer(patch.id, { height: patch.height })
}

function selectCanvasLayer(layerId: string, event?: KonvaEvent) {
  if (activeTool.value !== 'select') {
    if (event) event.cancelBubble = true
    return
  }
  if (event) event.cancelBubble = true
  if (event?.evt?.metaKey || event?.evt?.shiftKey) editor.toggleLayerSelection(layerId)
  else editor.selectLayer(layerId)
  void updateTransformer()
}

function deleteLayer(layerId?: string) {
  if (layerId) editor.selectLayer(layerId)
  editor.deleteSelectedLayer()
  void updateTransformer()
}

function onLayerDragStart(layer: HandoutLayer, event: KonvaEvent) {
  if (event.evt?.metaKey || event.evt?.shiftKey || !editor.selectedLayerIds.includes(layer.id)) {
    selectCanvasLayer(layer.id, event)
  } else {
    event.cancelBubble = true
  }
  if (!editor.selectedLayerIds.includes(layer.id) || editor.selectedLayerIds.length < 2) {
    multiDragState.active = false
    return
  }
  const position = layerPositionFromNode(layer, event.target)
  multiDragState.active = true
  multiDragState.layerId = layer.id
  multiDragState.originX = position.x
  multiDragState.originY = position.y
  multiDragState.positions = Object.fromEntries(
    editor.selectedLayers.map((item) => [item.id, { x: item.x, y: item.y }]),
  )
}

function handleStagePointer(event: KonvaEvent) {
  if (activeTool.value !== 'select') return
  if (suppressNextStageClick) {
    suppressNextStageClick = false
    return
  }
  const stage = stageRef.value?.getNode()
  if (selectionBox.visible) return
  if (stage && (event.target === stage || event.target.name() === 'canvas-background')) {
    editor.selectLayer(undefined)
    void updateTransformer()
  }
}

function updateSelectionBox(from: { x: number; y: number }, to: { x: number; y: number }) {
  selectionBox.x = Math.min(from.x, to.x)
  selectionBox.y = Math.min(from.y, to.y)
  selectionBox.width = Math.abs(to.x - from.x)
  selectionBox.height = Math.abs(to.y - from.y)
}

function startSelectionBox(event: KonvaEvent) {
  if (activeTool.value === 'brush' || activeTool.value === 'eraser') {
    startPaintStroke(event)
    return
  }
  if (activeTool.value !== 'select') return
  if (event.evt?.button !== 0 || event.target.name() !== 'canvas-background') return
  const point = canvasPointFromClient(event.evt.clientX, event.evt.clientY)
  selectionBox.visible = true
  selectionBox.startX = point.x
  selectionBox.startY = point.y
  updateSelectionBox(point, point)
}

function moveSelectionBox(event: KonvaEvent) {
  if (activeTool.value === 'brush' || activeTool.value === 'eraser') {
    movePaintStroke(event)
    return
  }
  if (!selectionBox.visible || !event.evt) return
  const point = canvasPointFromClient(event.evt.clientX, event.evt.clientY)
  updateSelectionBox({ x: selectionBox.startX, y: selectionBox.startY }, point)
}

function containsSelection(layer: HandoutLayer) {
  return containsRect(selectionBox, layer)
}

function stopSelectionBox() {
  if (activeTool.value === 'brush' || activeTool.value === 'eraser') {
    stopPaintStroke()
    return
  }
  if (!selectionBox.visible) return
  const hasArea = selectionBox.width > 3 / stageScale.value || selectionBox.height > 3 / stageScale.value
  if (hasArea) {
    editor.setLayerSelection(
      editor.document.layers
        .filter((layer) => layer.visible && containsSelection(layer))
        .map((layer) => layer.id),
    )
    void updateTransformer()
    suppressNextStageClick = true
  }
  selectionBox.visible = false
  selectionBox.width = 0
  selectionBox.height = 0
}

function onTransformEnd(layer: HandoutLayer) {
  const node = layerNodeRefs[layer.id]?.getNode()
  if (!node) return
  const scaleX = Math.abs(node.scaleX())
  const scaleY = Math.abs(node.scaleY())
  const width = isShapeLayer(layer) && layer.shape === 'line'
    ? Math.max(12, Math.round(layer.width * scaleX))
    : Math.max(12, Math.round(node.width() * scaleX))
  let height = isShapeLayer(layer) && layer.shape === 'line'
    ? Math.max(12, Math.round(layer.height * scaleY))
    : Math.max(12, Math.round(node.height() * scaleY))
  if (isTextLayer(layer)) {
    node.width(width)
    node.scaleX(1)
    node.scaleY(1)
    height = Math.max(12, Math.ceil((node as Konva.Text).getClientRect({ skipTransform: true }).height))
  }
  const position = isShapeLayer(layer) && layer.shape === 'ellipse'
    ? {
        x: Math.round(node.x() - width / 2),
        y: Math.round(node.y() - height / 2),
      }
    : layerPositionFromNode(layer, node)
  node.clearCache()
  node.scaleX(layer.flipX ? -1 : 1)
  node.scaleY(1)
  node.width(width)
  node.height(height)
  editor.patchLayer(layer.id, {
    x: position.x,
    y: position.y,
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

function onTransform(layer: HandoutLayer, event: KonvaEvent) {
  if (isShapeLayer(layer) && isCurveShape(layer.shape)) curveControlRevision.value += 1
  if (!event.evt?.shiftKey) return
  const node = layerNodeRefs[layer.id]?.getNode()
  if (!node) return
  const snapped = Math.round(node.rotation() / 45) * 45
  if (Math.abs(snapped - node.rotation()) <= 22.5) node.rotation(snapped)
}

function onDragEnd(layer: HandoutLayer) {
  guideLines.value = []
  lastSnapLogSignature = ''
  const node = layerNodeRefs[layer.id]?.getNode()
  if (!node) return
  logEllipseDrag('ellipse-drag-end-before-patch', layer, node, {
    patch: layerPositionFromNode(layer, node),
  })
  node.clearCache()
  if (multiDragState.active) {
    const patches = editor.selectedLayers
      .map((item) => {
        const selectedNode = layerNodeRefs[item.id]?.getNode()
        if (!selectedNode) return undefined
        return { id: item.id, patch: layerPositionFromNode(item, selectedNode) }
      })
      .filter((item): item is { id: string; patch: { x: number; y: number } } => Boolean(item))
    for (const item of patches) editor.patchLayer(item.id, item.patch)
    multiDragState.active = false
    multiDragState.positions = {}
  } else {
    editor.patchLayer(layer.id, layerPositionFromNode(layer, node))
  }
  logBackgroundRender('after-layer-drag', {
    layerId: layer.id,
    layerType: layer.type,
    layerPosition: layerPositionFromNode(layer, node),
  })
  if (isShapeLayer(layer) && layer.shape === 'ellipse') {
    lastEllipseDragLogSignature = ''
  }
  void refreshLayerEffectCacheAfterUpdate(layer.id)
}

function snapLayerFromDocumentLayer(layer: HandoutLayer): SnapLayer {
  return {
    id: layer.id,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    visible: layer.visible,
    locked: layer.locked,
  }
}

function snapLayerFromNode(layer: HandoutLayer, node: Konva.Node): SnapLayer {
  const position = layerPositionFromNode(layer, node)
  return {
    ...snapLayerFromDocumentLayer(layer),
    x: position.x,
    y: position.y,
    width: layer.width,
    height: layer.height,
  }
}

function applySnappedNodePosition(layer: HandoutLayer, node: Konva.Node, axis: 'x' | 'y', value: number) {
  if (isShapeLayer(layer) && layer.shape === 'ellipse') {
    if (axis === 'x') node.x(value + layer.width / 2)
    else node.y(value + layer.height / 2)
    return
  }
  if (axis === 'x') node.x(layer.flipX ? value + layer.width / 2 : value)
  else node.y(value)
}

function ellipseDragSnapshot(layer: ShapeLayer, node: Konva.Node) {
  const position = layerPositionFromNode(layer, node)
  return {
    model: {
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      rotation: layer.rotation,
    },
    node: {
      x: Math.round(node.x() * 100) / 100,
      y: Math.round(node.y() * 100) / 100,
      width: Math.round(node.width() * 100) / 100,
      height: Math.round(node.height() * 100) / 100,
      scaleX: Math.round(node.scaleX() * 100) / 100,
      scaleY: Math.round(node.scaleY() * 100) / 100,
      rotation: Math.round(node.rotation() * 100) / 100,
    },
    derivedPosition: position,
    stageScale: Math.round(stageScale.value * 1000) / 1000,
  }
}

function logEllipseDrag(message: string, layer: HandoutLayer, node: Konva.Node, extra?: Record<string, unknown>) {
  if (!isShapeLayer(layer) || layer.shape !== 'ellipse') return
  const snapshot = ellipseDragSnapshot(layer, node)
  const signature = JSON.stringify({
    message,
    x: snapshot.derivedPosition.x,
    y: snapshot.derivedPosition.y,
    nodeX: snapshot.node.x,
    nodeY: snapshot.node.y,
    extra,
  })
  if (signature === lastEllipseDragLogSignature) return
  lastEllipseDragLogSignature = signature
  logShape(message, {
    layerId: layer.id,
    ...snapshot,
    ...extra,
  })
}

function onDragMove(layer: HandoutLayer, event: KonvaEvent) {
  const node = layerNodeRefs[layer.id]?.getNode()
  if (!node || event.evt?.ctrlKey) {
    guideLines.value = []
    lastSnapLogSignature = ''
    return
  }

  if (multiDragState.active && multiDragState.layerId === layer.id) {
    const position = layerPositionFromNode(layer, node)
    const dx = position.x - multiDragState.originX
    const dy = position.y - multiDragState.originY
    for (const id of editor.selectedLayerIds) {
      if (id === layer.id) continue
      const selectedLayer = editor.document.layers.find((item) => item.id === id)
      const selectedNode = layerNodeRefs[id]?.getNode()
      const origin = multiDragState.positions[id]
      if (!selectedLayer || !selectedNode || !origin) continue
      selectedNode.x(selectedLayer.flipX ? origin.x + dx + selectedLayer.width / 2 : origin.x + dx)
      selectedNode.y(origin.y + dy)
    }
    guideLines.value = []
    return
  }

  if (isShapeLayer(layer) && isCurveShape(layer.shape)) curveControlRevision.value += 1
  logEllipseDrag('ellipse-drag-move-before-snap', layer, node)
  const snap = calculateSnapGuides({
    movingLayer: snapLayerFromNode(layer, node),
    layers: editor.document.layers.map(snapLayerFromDocumentLayer),
    canvas: {
      width: editor.document.canvas.width,
      height: editor.document.canvas.height,
    },
    stageScale: stageScale.value,
  })
  if (snap.x) applySnappedNodePosition(layer, node, 'x', snap.nextPosition.x)
  if (snap.y) applySnappedNodePosition(layer, node, 'y', snap.nextPosition.y)
  if (snap.x || snap.y) {
    logEllipseDrag('ellipse-drag-move-after-snap', layer, node, {
      snap: {
        x: snap.x,
        y: snap.y,
        nextPosition: snap.nextPosition,
      },
    })
  }
  if (snap.lines.length > 0) {
    const signature = `${layer.id}:${snap.lines.map((line) => `${line.orientation}:${line.value}`).join('|')}`
    if (signature !== lastSnapLogSignature) {
      lastSnapLogSignature = signature
      logSnap('drag-snap', {
        layerId: layer.id,
        stageScale: stageScale.value,
        screenThresholdPx: SNAP_THRESHOLD_SCREEN_PX,
        canvasThresholdPx: snap.thresholdCanvas,
        x: snap.x,
        y: snap.y,
      })
    }
  } else {
    lastSnapLogSignature = ''
  }
  guideLines.value = snap.lines
}

async function updateTransformer() {
  await nextTick()
  const transformer = transformerRef.value?.getNode()
  if (!transformer) return
  const selectedNodes = editor.selectedLayerIds
    .map((layerId) => layerNodeRefs[layerId]?.getNode())
    .filter((node): node is Konva.Node => Boolean(node))
  transformer.nodes(selectedNodes)
  transformer.getLayer()?.batchDraw()
}

function refreshLayerEffectCache(layerId: string, options?: { recache?: boolean }) {
  const layer = editor.document.layers.find((item) => item.id === layerId)
  const node = layerNodeRefs[layerId]?.getNode()
  if (!layer || !node) return
  if (hasVisibleEffects(layer.effects)) {
    if (options?.recache || !node.isCached()) {
      const maxEdge = Math.max(1, layer.width, layer.height)
      const pixelRatio = Math.max(0.1, Math.min(1, EDITOR_EFFECT_CACHE_MAX_EDGE / maxEdge))
      node.clearCache()
      node.cache({ pixelRatio })
      logViewport('effect-cache-recache', {
        layerId,
        layerType: layer.type,
        size: { width: layer.width, height: layer.height },
        pixelRatio,
      })
    }
  } else if (node.isCached()) {
    node.clearCache()
  }
  node.getLayer()?.batchDraw()
}

async function refreshLayerEffectCacheAfterUpdate(layerId: string) {
  await nextTick()
  refreshLayerEffectCache(layerId, { recache: true })
}

function scheduleLayerEffectCacheRefresh(layerIds: string[], options?: { recache?: boolean }) {
  for (const layerId of layerIds) pendingEffectCacheLayerIds.add(layerId)
  if (effectCacheRaf) return
  effectCacheRaf = window.requestAnimationFrame(async () => {
    effectCacheRaf = undefined
    const ids = Array.from(pendingEffectCacheLayerIds)
    pendingEffectCacheLayerIds.clear()
    await nextTick()
    const startedAt = performance.now()
    for (const layerId of ids) refreshLayerEffectCache(layerId, options)
    stageRef.value?.getNode().batchDraw()
    if (ids.length) {
      logViewport('effect-cache-refresh', {
        layerIds: ids,
        recache: Boolean(options?.recache),
        durationMs: Math.round(performance.now() - startedAt),
      })
    }
  })
}

function changedEffectLayerIds(nextSignature: string, previousSignature?: string) {
  if (!previousSignature) return editor.document.layers.map((layer) => layer.id)
  const previous = new Map(previousSignature.split('|').map((item) => {
    const [id, ...rest] = item.split(':')
    return [id, rest.join(':')]
  }))
  return nextSignature
    .split('|')
    .map((item) => {
      const [id, ...rest] = item.split(':')
      return previous.get(id) === rest.join(':') ? undefined : id
    })
    .filter((id): id is string => Boolean(id))
}

async function uploadFiles(kind: UploadKind, files: FileList | File[], folder = '') {
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

function validUploadFiles(kind: UploadKind, files: File[]) {
  const { accepted, rejected } = partitionUploadFiles(kind, files)
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

async function handleDirectFinderDrop(kind: UploadKind, event: DragEvent) {
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

function handleDirectFinderDragover(kind: UploadKind, event: DragEvent) {
  if (!event.dataTransfer?.types.includes('Files')) return
  event.dataTransfer.dropEffect = 'copy'
  event.dataTransfer.effectAllowed = 'copy'
  event.preventDefault()
  event.stopPropagation()
  if (editor.status !== `Drop ${kind} files to upload`) editor.status = `Drop ${kind} files to upload`
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
  return isHandoutExporting(project?.id)
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
    document.addEventListener('dragover', handleDocumentFontDragOver)
    document.addEventListener('drop', handleDocumentFontDrop)
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
  document.removeEventListener('dragover', handleDocumentFontDragOver)
  document.removeEventListener('drop', handleDocumentFontDrop)
  window.removeEventListener('resize', resizeStageViewport)
  cleanupExportProgress()
  if (effectCacheRaf) window.cancelAnimationFrame(effectCacheRaf)
})

watch(() => editor.library.backgrounds, () => { void syncImages(editor.library) }, { deep: true })
watch(() => editor.library.assets, () => { void syncImages(editor.library) }, { deep: true })
watch(() => editor.selectedLayerId, updateTransformer)
watch(selectedLayerIdsSignature, updateTransformer)
watch(selectedLayerTransformSignature, updateTransformer)
watch(selectedLayerRenderSignature, () => {
  if (editor.selectedLayerId) void refreshLayerEffectCacheAfterUpdate(editor.selectedLayerId)
})
watch(textLayerRenderSignature, () => {
  if (editor.view === 'editor') void autoResizeTextLayerHeights()
  if (editor.view === 'editor') void logTextLayerMetrics('text-signature-change')
}, { flush: 'post' })
watch(layerEffectsSignature, (nextSignature, previousSignature) => {
  scheduleLayerEffectCacheRefresh(changedEffectLayerIds(nextSignature, previousSignature))
})
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
          class="manager-finder large-grid-finder"
          :style="handoutFinderStyle"
          :driver="finderDrivers.handout"
          :features="finderFeaturesForKind('handout')"
          :config="finderUploadConfig"
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
          class="manager-finder compact-finder large-grid-finder"
          :style="backgroundFinderStyle"
          :driver="finderDrivers.background"
          :features="finderFeaturesForKind('background')"
          :config="finderUploadConfig"
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
          :config="finderUploadConfig"
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
          :config="finderUploadConfig"
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
        <TabsList class="grid grid-cols-4">
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="fonts">Fonts</TabsTrigger>
          <TabsTrigger value="shapes">Shapes</TabsTrigger>
          <TabsTrigger value="layers">Layers</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" class="rail-tab-content">
          <VueFinder
            :key="`editor-asset-${finderRevision.asset}`"
            id="editor-asset-finder"
            class="rail-finder"
            :driver="finderDrivers.asset"
            :features="finderFeaturesForKind('asset')"
            :config="finderUploadConfig"
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
            :config="finderUploadConfig"
            selection-mode="single"
            selection-filter-type="both"
            @path-change="(path) => handleFinderPathChange('font', path)"
            @file-dclick="(event) => handleFinderFileDoubleClick('font', event)"
            @dragover.capture="handleDirectFinderDragover('font', $event as DragEvent)"
            @drop.capture="handleDirectFinderDrop('font', $event as DragEvent)"
          />
          <Input v-model="fontSearch" placeholder="Search fonts or tags" />
          <ScrollArea class="rail-scroll">
            <button
              v-for="font in filteredFonts"
              :key="font.id"
              class="font-row"
              type="button"
              draggable="true"
              @pointerdown="prepareFontDrag(font)"
              @click="addFontTextToCanvas(font)"
              @dragstart="startFontDrag(font, $event)"
              @dragend="clearFontDrag"
            >
              <span class="font-preview" :style="{ fontFamily: fontFamily(font) }">Ag 字</span>
              <span class="font-meta">
                <strong>{{ font.name }}</strong>
                <span>Click to apply/create · drag for New Text · {{ font.tags.join(', ') || 'No tags' }}</span>
              </span>
            </button>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="shapes" class="rail-tab-content">
          <ScrollArea class="rail-scroll">
            <button
              v-for="shape in shapeItems"
              :key="shape.kind"
              class="shape-row"
              type="button"
              draggable="true"
              @click="addShapeToCanvas(shape.kind)"
              @dragstart="startShapeDrag(shape.kind, $event)"
              @dragend="clearShapeDrag"
            >
              <svg class="shape-preview" viewBox="0 0 36 36" aria-hidden="true">
                <line
                  v-if="shape.kind === 'line'"
                  x1="5"
                  y1="18"
                  x2="31"
                  y2="18"
                />
                <path
                  v-else-if="shape.kind === 'quadratic-curve'"
                  d="M5 26 Q18 5 31 24"
                />
                <path
                  v-else-if="shape.kind === 'cubic-bezier'"
                  d="M4 25 C11 5 25 32 32 10"
                />
                <rect
                  v-else-if="shape.kind === 'rect'"
                  x="7"
                  y="8"
                  width="22"
                  height="20"
                />
                <rect
                  v-else-if="shape.kind === 'round-rect'"
                  x="7"
                  y="8"
                  width="22"
                  height="20"
                  rx="6"
                />
                <ellipse
                  v-else-if="shape.kind === 'ellipse'"
                  cx="18"
                  cy="18"
                  rx="12"
                  ry="10"
                />
                <polygon
                  v-else
                  :points="shapePreviewPoints(shape.kind)"
                />
              </svg>
              <span>
                <strong>{{ shape.label }}</strong>
                <em>{{ shape.detail }}</em>
              </span>
            </button>
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
              :class="{ selected: editor.selectedLayerIds.includes(layer.id), dragging: draggedLayerId === layer.id }"
              role="button"
              tabindex="0"
              draggable="true"
              @click="selectLayerFromList(layer.id, $event)"
              @dragstart="startLayerListDrag(layer, $event)"
              @dragover.prevent
              @drop="handleLayerListDrop(layer, $event)"
              @dragend="draggedLayerId = ''"
              @keydown.enter="selectLayerFromList(layer.id, $event)"
            >
              <Layers class="layer-icon" />
              <span>
                <strong>{{ layerName(layer) }}</strong>
                <em>{{ layer.type }} · z{{ layer.zIndex }}</em>
              </span>
              <Button
                class="layer-visibility"
                size="icon"
                variant="ghost"
                :data-visible="layer.visible"
                @click.stop="toggleLayerVisibility(layer)"
              >
                <Eye v-if="layer.visible" />
                <EyeOff v-else />
              </Button>
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
        <div class="topbar-actions tool-actions">
          <Button size="sm" variant="outline" :data-active="activeTool === 'select'" @click="setActiveTool('select')">
            <MousePointer2 data-icon="inline-start" />
            Select
          </Button>
          <Button size="sm" variant="outline" :data-active="activeTool === 'brush'" @click="setActiveTool('brush')">
            <Brush data-icon="inline-start" />
            Brush
          </Button>
          <Button size="sm" variant="outline" :data-active="activeTool === 'eraser'" @click="setActiveTool('eraser')">
            <Eraser data-icon="inline-start" />
            Eraser
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
          :class="{
            'stage-frame-dropping': draggedAssetId || draggedFontId || draggedShapeKind,
            'stage-frame-panning': panState.active,
            'stage-frame-drawing': activeTool === 'brush' || activeTool === 'eraser',
          }"
          @dragenter.capture="handleCanvasDragOver"
          @dragover.capture="handleCanvasDragOver"
          @drop.capture="handleCanvasDrop"
          @wheel.prevent="handleCanvasWheel"
          @pointerdown="startCanvasPan"
          @pointermove="moveCanvasPan"
          @pointerup="stopCanvasPan"
          @pointerleave="stopCanvasPan"
        >
          <div class="stage-surface" :style="{ filter: documentFilterStyle }">
            <v-stage
              ref="stageRef"
              :config="stageConfig"
              @click="handleStagePointer"
              @tap="handleStagePointer"
              @mousedown="startSelectionBox"
              @mousemove="moveSelectionBox"
              @mouseup="stopSelectionBox"
            >
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
                    @dragstart="onLayerDragStart(layer, $event)"
                    @dragmove="onDragMove(layer, $event)"
                    @dragend="onDragEnd(layer)"
                    @transform="onTransform(layer, $event)"
                    @transformend="onTransformEnd(layer)"
                  />
                  <v-text
                    v-else-if="isTextLayer(layer)"
                    :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                    :config="textConfig(layer)"
                    @click="selectCanvasLayer(layer.id, $event)"
                    @tap="selectCanvasLayer(layer.id, $event)"
                    @dragstart="onLayerDragStart(layer, $event)"
                    @dragmove="onDragMove(layer, $event)"
                    @dragend="onDragEnd(layer)"
                    @transform="onTransform(layer, $event)"
                    @transformend="onTransformEnd(layer)"
                  />
                  <v-rect
                    v-else-if="isShapeLayer(layer) && ['rect', 'round-rect'].includes(layer.shape)"
                    :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                    :config="shapeConfig(layer)"
                    @click="selectCanvasLayer(layer.id, $event)"
                    @tap="selectCanvasLayer(layer.id, $event)"
                    @dragstart="onLayerDragStart(layer, $event)"
                    @dragmove="onDragMove(layer, $event)"
                    @dragend="onDragEnd(layer)"
                    @transform="onTransform(layer, $event)"
                    @transformend="onTransformEnd(layer)"
                  />
                  <v-line
                    v-else-if="isShapeLayer(layer) && ['diamond', 'hexagon-h', 'hexagon-v'].includes(layer.shape)"
                    :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                    :config="shapeConfig(layer)"
                    @click="selectCanvasLayer(layer.id, $event)"
                    @tap="selectCanvasLayer(layer.id, $event)"
                    @dragstart="onLayerDragStart(layer, $event)"
                    @dragmove="onDragMove(layer, $event)"
                    @dragend="onDragEnd(layer)"
                    @transform="onTransform(layer, $event)"
                    @transformend="onTransformEnd(layer)"
                  />
                  <v-ellipse
                    v-else-if="isShapeLayer(layer) && layer.shape === 'ellipse'"
                    :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                    :config="shapeConfig(layer)"
                    @click="selectCanvasLayer(layer.id, $event)"
                    @tap="selectCanvasLayer(layer.id, $event)"
                    @dragstart="onLayerDragStart(layer, $event)"
                    @dragmove="onDragMove(layer, $event)"
                    @dragend="onDragEnd(layer)"
                    @transform="onTransform(layer, $event)"
                    @transformend="onTransformEnd(layer)"
                  />
                  <v-shape
                    v-else-if="isShapeLayer(layer) && isCurveShape(layer.shape)"
                    :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                    :config="shapeConfig(layer)"
                    @click="selectCanvasLayer(layer.id, $event)"
                    @tap="selectCanvasLayer(layer.id, $event)"
                    @dragstart="onLayerDragStart(layer, $event)"
                    @dragmove="onDragMove(layer, $event)"
                    @dragend="onDragEnd(layer)"
                    @transform="onTransform(layer, $event)"
                    @transformend="onTransformEnd(layer)"
                  />
                  <v-group
                    v-else-if="isShapeLayer(layer) && layer.shape === 'line'"
                    :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                    :config="shapeConfig(layer)"
                    @click="selectCanvasLayer(layer.id, $event)"
                    @tap="selectCanvasLayer(layer.id, $event)"
                    @dragstart="onLayerDragStart(layer, $event)"
                    @dragmove="onDragMove(layer, $event)"
                    @dragend="onDragEnd(layer)"
                    @transform="onTransform(layer, $event)"
                    @transformend="onTransformEnd(layer)"
                  >
                    <v-rect :config="lineHitConfig(layer)" />
                    <template v-if="layer.lineStyle === 'double'">
                      <v-line :config="lineVisualConfig(layer, -lineDoubleOffset(layer))" />
                      <v-line :config="lineVisualConfig(layer, lineDoubleOffset(layer))" />
                    </template>
                    <v-arrow v-else :config="lineVisualConfig(layer)" />
                    <v-line
                      v-if="manualArrowVisible(layer.lineStartArrow, layer)"
                      :config="arrowLineConfig(layer.lineStartArrow, 'start', layer)"
                    />
                    <v-circle
                      v-if="layer.lineStartArrow === 'dot'"
                      :config="arrowDotConfig('start', layer)"
                    />
                    <v-line
                      v-if="manualArrowVisible(layer.lineEndArrow, layer)"
                      :config="arrowLineConfig(layer.lineEndArrow, 'end', layer)"
                    />
                    <v-circle
                      v-if="layer.lineEndArrow === 'dot'"
                      :config="arrowDotConfig('end', layer)"
                    />
                    <v-circle v-if="showLineHandle(layer, editor.selectedLayerIds)" :config="lineHandleConfig(layer)" />
                  </v-group>
                  <v-shape
                    v-else-if="isPaintLayer(layer)"
                    :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                    :config="paintConfig(layer)"
                    @click="selectCanvasLayer(layer.id, $event)"
                    @tap="selectCanvasLayer(layer.id, $event)"
                    @dragstart="onLayerDragStart(layer, $event)"
                    @dragmove="onDragMove(layer, $event)"
                    @dragend="onDragEnd(layer)"
                    @transform="onTransform(layer, $event)"
                    @transformend="onTransformEnd(layer)"
                  />
                </template>
                <template
                  v-for="layer in selectedCurveLayers"
                  :key="`curve-controls-${layer.id}`"
                >
                  <v-line
                    v-for="(guide, index) in curveGuideConfig(layer)"
                    :key="`curve-guide-${layer.id}-${index}`"
                    :config="curveGuideLineConfig(layer, guide)"
                  />
                  <v-circle
                    v-for="key in curvePointKeys(layer)"
                    :key="`curve-handle-${layer.id}-${key}`"
                    :config="curveHandleConfig(layer, key)"
                    @dragmove="moveCurvePoint(layer, key, $event)"
                    @dragend="endCurvePointMove(layer, key)"
                  />
                </template>
                <v-line
                  v-if="draftStroke"
                  :config="paintStrokeLineConfig(draftStroke)"
                />
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
                <v-rect
                  v-if="selectionBox.visible"
                  :config="{
                    x: selectionBox.x,
                    y: selectionBox.y,
                    width: selectionBox.width,
                    height: selectionBox.height,
                    fill: 'rgba(14, 165, 233, 0.12)',
                    stroke: '#0ea5e9',
                    strokeWidth: 1 / stageScale,
                    dash: [4 / stageScale, 4 / stageScale],
                    listening: false,
                  }"
                />
                <v-transformer
                  ref="transformerRef"
                  :config="transformerConfig"
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
      v-model:export-format="exportFormat"
      v-model:export-quality="exportQuality"
      :is-exporting="isExportingCurrent"
      :export-log="exportLog"
      :export-progress="exportProgress"
      @export-image="exportCurrentImage"
    />
  </div>
</template>
