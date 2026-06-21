<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowReactive, watch } from 'vue'
import Konva from 'konva'
import { confirm } from '@tauri-apps/plugin-dialog'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Brush,
  ChevronDown,
  ChevronRight,
  Eraser,
  Minus,
  Eye,
  EyeOff,
  Layers,
  MousePointer2,
  Plus,
  Redo2,
  Save,
  Settings,
  Trash2,
  Type,
  Undo2,
} from '@lucide/vue'
import { VueFinder, type DirEntry } from 'vuefinder'
import 'vuefinder/dist/vuefinder.css'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import RightInspector from '@/components/editor/RightInspector.vue'
import CreateHandoutDialog from '@/components/handout/CreateHandoutDialog.vue'
import ConfigurationDialog from '@/components/settings/ConfigurationDialog.vue'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useFinderManagement, finderFeaturesForKind } from '@/composables/useFinderManagement'
import { useCanvasViewport } from '@/composables/useCanvasViewport'
import { useEditorDragPayloads } from '@/composables/useEditorDragPayloads'
import { useHandoutExport } from '@/composables/useHandoutExport'
import { useResourceImages } from '@/composables/useResourceImages'
import { useMaskPreviewCache } from '@/composables/useMaskPreviewCache'
import { useLayerEffectCache } from '@/composables/useLayerEffectCache'
import { useProjectPreviews } from '@/composables/useProjectPreviews'
import { useTextLayerAutoResize } from '@/composables/useTextLayerAutoResize'
import { useLayerRenderConfigs } from '@/composables/useLayerRenderConfigs'
import { useRenderSignatures } from '@/composables/useRenderSignatures'
import { useMaskComposition } from '@/composables/useMaskComposition'
import { usePaintStrokes } from '@/composables/usePaintStrokes'
import { useCurveEditing } from '@/composables/useCurveEditing'
import { useSelectionBox } from '@/composables/useSelectionBox'
import { useLayerDragTransform } from '@/composables/useLayerDragTransform'
import {
  appendDebugLog,
  fontRecordFamily,
  saveProjectAsset,
  type LibraryRecord,
  type ProjectSummary,
} from '@/lib/backend'
import { createDebugLogger, serializableLogData, writeDebugLog } from '@/lib/debug-log'
import type { FlattenedLayerBounds, HandoutDocument, HandoutLayer, LayerGroup, ShapeKind } from '@/lib/handout'
import { isCurveShape, isLayerEffectivelyVisible } from '@/lib/handout'
import { createAppShortcutHandler } from '@/app/AppShortcuts'
import { saveProjectWithPreview } from '@/app/useAppPersistence'
import { appConfiguration } from '@/lib/configuration'
import { paintStrokeLineConfig } from '@/lib/paint-rendering'
import { dataUrlByteSize, renderHandoutToDataUrl } from '@/lib/render'
import {
  arrowDotConfig,
  arrowLineConfig,
  lineDoubleOffset,
  lineHandleConfig,
  lineHitConfig,
  lineVisualConfig,
  manualArrowVisible,
  shapePreviewPoints,
  showLineHandle,
} from '@/lib/shape-rendering'
import { shapeItems } from '@/lib/shape-items'
import { partitionUploadFiles, type UploadKind } from '@/lib/upload-validation'
import { isImageLayer, isPaintLayer, isTextLayer, useEditorStore } from '@/stores/editor'

type NodeRef = { getNode: () => Konva.Node }
type KonvaEvent = { target: Konva.Node; evt?: MouseEvent; cancelBubble?: boolean }
type EditorTool = 'select' | 'brush' | 'eraser'

Konva.dragButtons = [0]
const PREVIEW_TARGET_BYTES = 512 * 1024

const editor = useEditorStore()
const stageFrameRef = ref<HTMLElement>()
const stageRef = ref<{ getNode: () => Konva.Stage }>()
const transformerRef = ref<{ getNode: () => Konva.Transformer }>()
const maskEditNodeRef = ref<NodeRef>()
const layerNodeRefs = reactive<Record<string, NodeRef | undefined>>({})
const maskedLayerImages = shallowReactive<Record<string, HTMLCanvasElement | undefined>>({})
const maskEditImage = ref<HTMLImageElement>()
const maskPreviewUrls = shallowReactive<Record<string, string | undefined>>({})
const draggedMaskLayerId = ref('')
const isDraggingMask = ref(false)

const newProjectTitle = ref('Untitled handout')
const createMode = ref<'blank' | 'upload-background'>('blank')
const isCreateDialogOpen = ref(false)
const isSettingsDialogOpen = ref(false)
const blankWidth = ref(1280)
const blankHeight = ref(720)
const activeTool = ref<EditorTool>('select')
const activeRailTab = ref<'assets' | 'fonts' | 'graph' | 'layers'>('assets')
const handleGlobalKeydown = createAppShortcutHandler({
  isEditorView: () => editor.view === 'editor',
  hasSelectedLayer: () => Boolean(editor.selectedLayerId),
  saveProject: () => { void saveProject() },
  undo: () => editor.undo(),
  redo: () => editor.redo(),
  deleteLayer: () => deleteLayer(),
  setTool: (tool) => setActiveTool(tool),
  setRailTab: (tab) => { activeRailTab.value = tab },
  addText: () => {
    editor.addText()
    void updateTransformer()
  },
})
const isFlatteningLayers = ref(false)
const assetSearch = ref('')
const fontSearch = ref('')
const selectedProjectFolder = ref('')
const selectedBackgroundFolder = ref('')
const selectedAssetFolder = ref('')
const selectedFontFolder = ref('')
const isBooting = ref(true)
const draggedLayerId = ref('')
const draggedGroupId = ref('')
const collapsedGroupIds = ref<string[]>([])
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
const EDITOR_EFFECT_CACHE_MAX_EDGE = 768
const EDITOR_MASK_PREVIEW_MAX_EDGE = 1200
const maskFeatureEnabled = appConfiguration.mask.enabled
let lastFontDragOverLogAt = 0
let lastLayerListSelectionId = ''
const logHandoutPreview = createDebugLogger('handout-preview')
const logText = createDebugLogger('text')
const logUpload = createDebugLogger('upload')
const logExport = createDebugLogger('export')
const logSnap = createDebugLogger('snap')
const logShape = createDebugLogger('shape')
const logFlat = createDebugLogger('flat')
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
  document: () => editor.document,
  stageRef,
  stageFrameRef,
  logViewport,
})
const maskCompositionRefreshHolder = {
  refreshMaskPreviewUrls: () => {},
  scheduleMaskCompositeRefresh: (_reason: string) => {},
}
const {
  maskPreviewCacheDataUrls,
  maskProxyMaxEdge,
  waitForIdleTask,
  loadMaskPreviewCacheDataUrl,
} = useMaskPreviewCache({
  editor,
  stageScale,
  maskFeatureEnabled,
  editorMaskPreviewMaxEdge: EDITOR_MASK_PREVIEW_MAX_EDGE,
  refresh: maskCompositionRefreshHolder,
})
const {
  refreshLayerEffectCacheAfterUpdate,
  scheduleLayerEffectCacheRefresh,
  changedEffectLayerIds,
  cancelEffectCacheRefresh,
} = useLayerEffectCache({
  editor,
  layerNodeRefs,
  stageRef,
  logViewport,
  editorEffectCacheMaxEdge: EDITOR_EFFECT_CACHE_MAX_EDGE,
})
const { ensureProjectPreviews } = useProjectPreviews({
  editor,
  imageElements,
  logHandoutPreview,
  waitForIdleTask,
  maskFeatureEnabled,
  editorMaskPreviewMaxEdge: EDITOR_MASK_PREVIEW_MAX_EDGE,
  previewTargetBytes: PREVIEW_TARGET_BYTES,
})
const {
  autoResizeTextLayerHeights,
  autoTextLayerHeight,
  logTextLayerMetrics,
} = useTextLayerAutoResize({
  editor,
  layerNodeRefs,
  logText,
  fontFamily,
})
const canvasLayers = computed(() => [...editor.document.layers].sort((a, b) => a.zIndex - b.zIndex))
const visibleCanvasLayers = computed(() =>
  canvasLayers.value.filter((layer) => isLayerEffectivelyVisible(editor.document, layer)),
)
const activeMaskEditLayer = computed(() => {
  if (!maskFeatureEnabled) return undefined
  const target = editor.maskEditTarget
  if (!target || target.kind !== 'layer') return undefined
  return editor.document.layers.find((layer) => layer.id === target.layerId)
})
const {
  layerName,
  imageForLayer,
  maskedImageForLayer,
  layerMaskActive,
  isShapeLayer,
  logCanvasLayerRenderState,
  layerPreviewStyle,
  layerPreviewText,
  layerConfig,
  textConfig,
  shapeConfig,
  paintConfig,
  maskedLayerConfig,
} = useLayerRenderConfigs({
  editor,
  imageElements,
  previewUrl,
  maskedLayerImages,
  maskPreviewUrls,
  maskPreviewCacheDataUrls,
  maskFeatureEnabled,
  activeTool,
  visibleCanvasLayers,
})
const {
  maskEditLabel,
  selectedCurveLayers,
  layerListItems,
  canvasSizeSignature,
  layerEffectsSignature,
  layerMaskRenderSignature,
  backgroundMaskRenderSignature,
  textLayerRenderSignature,
  selectedLayerTransformSignature,
  selectedLayerRenderSignature,
  selectedLayerIdsSignature,
  selectedMaskControlLayers,
  selectedMaskControlDeletes,
  transformerConfig,
  documentFilterStyle,
  backgroundAsset,
  backgroundImage,
  backgroundRenderSignature,
  filteredAssets,
  filteredFonts,
} = useRenderSignatures({
  editor,
  imageElements,
  maskFeatureEnabled,
  canvasLayers,
  layerName,
  isShapeLayer,
  groupForLayer,
  assetSearch,
  fontSearch,
  selectedAssetFolder,
  selectedFontFolder,
  stageScale,
  stageViewport,
  fitScale,
  canvasZoom,
  canvasPan,
})
const {
  maskedBackgroundImage,
  refreshMaskPreviewUrls,
  refreshMaskEditImage,
  scheduleMaskCompositeRefresh,
  cancelMaskCompositeRefresh,
} = useMaskComposition({
  editor,
  imageElements,
  maskFeatureEnabled,
  isDraggingMask,
  stageScale,
  editorMaskPreviewMaxEdge: EDITOR_MASK_PREVIEW_MAX_EDGE,
  maskProxyMaxEdge,
  loadMaskPreviewCacheDataUrl,
  activeMaskEditLayer,
  logCanvasLayerRenderState,
  maskedLayerImages,
  maskPreviewUrls,
  maskEditImage,
})
maskCompositionRefreshHolder.refreshMaskPreviewUrls = refreshMaskPreviewUrls
maskCompositionRefreshHolder.scheduleMaskCompositeRefresh = scheduleMaskCompositeRefresh
const {
  draftStroke,
  startPaintStroke,
  movePaintStroke,
  stopPaintStroke,
} = usePaintStrokes({
  editor,
  activeTool,
  maskFeatureEnabled,
  canvasPointFromClient,
  updateTransformer,
})
const {
  selectionBox,
  handleStagePointer,
  startSelectionBox,
  moveSelectionBox,
  stopSelectionBox,
} = useSelectionBox({
  editor,
  activeTool,
  stageRef,
  stageScale,
  canvasPointFromClient,
  updateTransformer,
  startPaintStroke,
  movePaintStroke,
  stopPaintStroke,
})
const {
  curvePointKeys,
  curveHandleConfig,
  curveGuideConfig,
  curveGuideLineConfig,
  moveCurvePoint,
  endCurvePointMove,
} = useCurveEditing({
  editor,
  layerNodeRefs,
  stageScale,
})
const {
  guideLines,
  onLayerDragStart,
  onTransformEnd,
  onTransform,
  onDragEnd,
  onDragMove,
} = useLayerDragTransform({
  editor,
  layerNodeRefs,
  stageScale,
  isShapeLayer,
  selectCanvasLayer,
  updateTransformer,
  autoTextLayerHeight,
  refreshLayerEffectCacheAfterUpdate,
  logBackgroundRender,
  logShape,
  logSnap,
})
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
  cloneHandoutProject,
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

function fontFamily(font: LibraryRecord) {
  return fontRecordFamily(font)
}

function maskPreviewClass(layer: HandoutLayer) {
  if (!maskFeatureEnabled) return { enabled: false, disabled: false, editing: false, empty: true }
  return {
    enabled: Boolean(layer.mask?.enabled),
    disabled: Boolean(layer.mask && !layer.mask.enabled),
    editing: editor.maskEditTarget?.kind === 'layer' && editor.maskEditTarget.layerId === layer.id,
    empty: !layer.mask,
  }
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
  draggedGroupId.value = ''
  event.dataTransfer?.setData('application/x-handout-layer', layer.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function startGroupListDrag(group: LayerGroup, event: DragEvent) {
  draggedGroupId.value = group.id
  draggedLayerId.value = ''
  event.dataTransfer?.setData('application/x-handout-group', group.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

async function handleLayerListDrop(targetLayer: HandoutLayer, event: DragEvent) {
  event.preventDefault()
  const maskLayerId = event.dataTransfer?.getData('application/x-handout-mask-layer') || draggedMaskLayerId.value
  if (maskLayerId) {
    await handleMaskDrop(targetLayer, event)
    return
  }
  const groupId = event.dataTransfer?.getData('application/x-handout-group') || draggedGroupId.value
  if (groupId) {
    editor.moveGroupToIndex(groupId, targetLayer.zIndex)
    draggedGroupId.value = ''
    return
  }
  const layerId = event.dataTransfer?.getData('application/x-handout-layer') || draggedLayerId.value
  if (!layerId || layerId === targetLayer.id) return
  const targetGroup = groupForLayer(targetLayer.id)
  const sourceGroup = groupForLayer(layerId)
  if (targetGroup) {
    editor.addLayerToGroupAt(layerId, targetGroup.id, targetLayer.id)
    draggedLayerId.value = ''
    return
  }
  if (sourceGroup) {
    editor.moveLayerOutOfGroupToIndex(layerId, targetLayer.zIndex)
    draggedLayerId.value = ''
    return
  }
  editor.moveLayerToIndex(layerId, targetLayer.zIndex)
  draggedLayerId.value = ''
}

function handleGroupDrop(group: LayerGroup, event: DragEvent) {
  event.preventDefault()
  const groupId = event.dataTransfer?.getData('application/x-handout-group') || draggedGroupId.value
  if (groupId) {
    if (groupId !== group.id) {
      const topLayer = layersForGroup(group).at(-1)
      editor.moveGroupToIndex(groupId, topLayer?.zIndex ?? editor.document.layers.length)
    }
    draggedGroupId.value = ''
    return
  }
  const layerId = event.dataTransfer?.getData('application/x-handout-layer') || draggedLayerId.value
  if (!layerId || group.layerIds.includes(layerId)) return
  editor.addLayerToGroupAt(layerId, group.id)
  draggedLayerId.value = ''
}

function groupForLayer(layerId: string) {
  return editor.groups.find((group) => group.layerIds.includes(layerId))
}

function layersForGroup(group: LayerGroup) {
  const byId = new Map(editor.document.layers.map((layer) => [layer.id, layer]))
  return group.layerIds
    .map((id) => byId.get(id))
    .filter((layer): layer is HandoutLayer => Boolean(layer))
}

function groupIsCollapsed(groupId: string) {
  return collapsedGroupIds.value.includes(groupId)
}

function toggleGroupCollapsed(groupId: string) {
  collapsedGroupIds.value = groupIsCollapsed(groupId)
    ? collapsedGroupIds.value.filter((id) => id !== groupId)
    : [...collapsedGroupIds.value, groupId]
}

function clearLayerDragState() {
  draggedLayerId.value = ''
  draggedGroupId.value = ''
  draggedMaskLayerId.value = ''
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

async function toggleSelectedLayerMask() {
  if (!maskFeatureEnabled) return
  const layers = selectedMaskControlLayers.value
  if (!layers.length) return
  if (!selectedMaskControlDeletes.value) {
    for (const layer of layers) {
      if (!layer.mask) editor.addMaskToLayer(layer.id)
    }
    void refreshMaskPreviewUrls()
    return
  }
  const confirmed = await confirm(`Delete masks from ${layers.length} selected layer${layers.length === 1 ? '' : 's'}?`, {
    title: 'Delete layer mask',
    kind: 'warning',
    okLabel: 'Delete',
    cancelLabel: 'Cancel',
  })
  if (!confirmed) return
  for (const layer of layers) {
    if (!layer.mask) continue
    editor.deleteLayerMaskById(layer.id)
    delete maskPreviewUrls[layer.mask.id]
    delete maskPreviewCacheDataUrls[layer.mask.id]
  }
}

function toggleMaskEditFromLayerRow(layer: HandoutLayer, event: MouseEvent) {
  if (!maskFeatureEnabled) return
  event.stopPropagation()
  if (!layer.mask) return
  const isEditing = editor.maskEditTarget?.kind === 'layer' && editor.maskEditTarget.layerId === layer.id
  if (isEditing) {
    editor.exitMaskEdit()
    return
  }
  editor.selectLayer(layer.id)
  editor.editLayerMask(layer.id)
}

function toggleMaskEnabledFromLayerRow(layer: HandoutLayer, event: MouseEvent) {
  if (!maskFeatureEnabled) return
  event.stopPropagation()
  if (!layer.mask) return
  editor.patchLayer(layer.id, {
    mask: {
      ...layer.mask,
      enabled: !layer.mask.enabled,
      updatedAt: new Date().toISOString(),
    },
  } as Partial<HandoutLayer>)
}

function startMaskDrag(layer: HandoutLayer, event: DragEvent) {
  if (!maskFeatureEnabled) return
  if (!layer.mask || !event.dataTransfer) return
  draggedMaskLayerId.value = layer.id
  event.dataTransfer.effectAllowed = 'copyMove'
  event.dataTransfer.setData('application/x-handout-mask-layer', layer.id)
}

async function handleMaskDrop(targetLayer: HandoutLayer, event: DragEvent) {
  if (!maskFeatureEnabled) return
  const sourceLayerId = event.dataTransfer?.getData('application/x-handout-mask-layer') || draggedMaskLayerId.value
  if (!sourceLayerId || sourceLayerId === targetLayer.id) return
  const copy = event.metaKey || event.ctrlKey
  if (targetLayer.mask) {
    const confirmed = await confirm(`Replace mask on ${layerName(targetLayer)}?`, {
      title: 'Replace layer mask',
      kind: 'warning',
      okLabel: copy ? 'Copy and replace' : 'Move and replace',
      cancelLabel: 'Cancel',
    })
    if (!confirmed) return
  }
  await editor.moveOrCopyLayerMask(sourceLayerId, targetLayer.id, copy)
  draggedMaskLayerId.value = ''
  void refreshMaskPreviewUrls()
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

function setMaskEditNodeRef(node: unknown) {
  maskEditNodeRef.value = node as NodeRef | undefined
}

function maskEditConfig(layer: HandoutLayer) {
  if (!maskFeatureEnabled) return {}
  const mask = layer.mask
  const canDragMask = activeTool.value === 'select'
  return {
    image: maskEditImage.value,
    x: mask?.flipX ? (mask.x + mask.width * mask.scaleX) : mask?.x,
    y: mask?.y,
    width: mask?.width,
    height: mask?.height,
    scaleX: mask?.flipX ? -mask.scaleX : mask?.scaleX,
    scaleY: mask?.scaleY,
    rotation: mask?.rotation,
    opacity: isDraggingMask.value ? 0.42 : 0,
    draggable: canDragMask,
    listening: canDragMask,
  }
}

function onMaskEditDragStart(layer: HandoutLayer) {
  if (!maskFeatureEnabled) return
  if (!layer.mask) return
  isDraggingMask.value = true
  void appendDebugLog('mask', 'mask-edit-drag-start', {
    layerId: layer.id,
    maskId: layer.mask.id,
    previewMaxEdge: maskProxyMaxEdge(),
  })
}

function onMaskEditDragEnd(layer: HandoutLayer, event: KonvaEvent) {
  if (!maskFeatureEnabled) return
  if (!layer.mask) return
  const node = event.target
  editor.patchLayerMask(layer.id, {
    x: layer.mask.flipX ? node.x() - layer.mask.width * layer.mask.scaleX : node.x(),
    y: node.y(),
  })
  isDraggingMask.value = false
  void appendDebugLog('mask', 'mask-edit-drag-end', {
    layerId: layer.id,
    maskId: layer.mask.id,
    x: node.x(),
    y: node.y(),
  })
  scheduleMaskCompositeRefresh('mask-edit-drag-end')
}

function onMaskEditTransformEnd(layer: HandoutLayer, event: KonvaEvent) {
  if (!maskFeatureEnabled) return
  if (!layer.mask) return
  const node = event.target
  const scaleX = node.scaleX()
  const scaleY = node.scaleY()
  editor.patchLayerMask(layer.id, {
    x: scaleX < 0 ? node.x() - layer.mask.width * Math.abs(scaleX) : node.x(),
    y: node.y(),
    scaleX: Math.abs(scaleX),
    scaleY: Math.abs(scaleY),
    rotation: node.rotation(),
    flipX: scaleX < 0,
  })
  scheduleMaskCompositeRefresh('mask-edit-transform-end')
  void updateTransformer()
}

function setActiveTool(tool: EditorTool) {
  activeTool.value = tool
}

async function fitEditorCanvas(reason = 'fit') {
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  resizeStageViewport()
  fitCanvasView(reason)
}

function selectCanvasLayer(layerId: string, event?: KonvaEvent) {
  if (editor.maskEditTarget) {
    if (event) event.cancelBubble = true
    event?.evt?.preventDefault()
    return
  }
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

function layerOuterBounds(layer: HandoutLayer): FlattenedLayerBounds {
  const blur = Math.max(0, layer.effects?.blur ?? 0)
  const strokePad = isShapeLayer(layer) ? Math.max(0, layer.strokeWidth ?? 0) : 0
  const pad = Math.ceil(Math.max(4, blur * 2, strokePad * 2))
  const width = Math.max(1, layer.width)
  const height = Math.max(1, layer.height)
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
  const rotation = (layer.rotation * Math.PI) / 180
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const points = corners.map((point) => ({
    x: layer.x + point.x * cos - point.y * sin,
    y: layer.y + point.x * sin + point.y * cos,
  }))
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    x: Math.floor(Math.min(...xs) - pad),
    y: Math.floor(Math.min(...ys) - pad),
    width: Math.ceil(Math.max(...xs) - Math.min(...xs) + pad * 2),
    height: Math.ceil(Math.max(...ys) - Math.min(...ys) + pad * 2),
  }
}

function selectedLayerBounds(): FlattenedLayerBounds | undefined {
  const layers = editor.selectedLayers
  if (!layers.length) return undefined
  const bounds = layers.map(layerOuterBounds)
  const minX = Math.min(...bounds.map((item) => item.x))
  const minY = Math.min(...bounds.map((item) => item.y))
  const maxX = Math.max(...bounds.map((item) => item.x + item.width))
  const maxY = Math.max(...bounds.map((item) => item.y + item.height))
  return {
    x: minX,
    y: minY,
    width: Math.max(1, Math.ceil(maxX - minX)),
    height: Math.max(1, Math.ceil(maxY - minY)),
  }
}

function cloneLayerForFlatten(layer: HandoutLayer): HandoutLayer {
  return JSON.parse(JSON.stringify(layer)) as HandoutLayer
}

function shiftedLayerForFlatten(layer: HandoutLayer, bounds: FlattenedLayerBounds, zIndex: number): HandoutLayer {
  const cloned = cloneLayerForFlatten(layer)
  return {
    ...cloned,
    x: layer.x - bounds.x,
    y: layer.y - bounds.y,
    zIndex,
    mask: cloned.mask
      ? {
          ...cloned.mask,
          x: cloned.mask.x - bounds.x,
          y: cloned.mask.y - bounds.y,
        }
      : cloned.mask,
  }
}

function flattenDocumentForSelectedLayers(bounds: FlattenedLayerBounds, layerIds: string[]): HandoutDocument {
  const idSet = new Set(layerIds)
  const layers = editor.document.layers
    .filter((layer) => idSet.has(layer.id))
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((layer, index) => shiftedLayerForFlatten(layer, bounds, index))
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title: `${editor.document.title} flat`,
    canvas: {
      width: bounds.width,
      height: bounds.height,
      backgroundColor: 'rgba(0,0,0,0)',
      backgroundVisible: true,
      backgroundMask: null,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
    },
    layers,
    groups: [],
    projectAssets: [],
    updatedAt: new Date().toISOString(),
  }
}

async function flattenSelectedLayers() {
  const layerIds = [...editor.selectedLayerIds]
  logFlat('flat-click', {
    isFlattening: isFlatteningLayers.value,
    selectedLayerIds: layerIds,
    selectedLayers: editor.selectedLayers.map((layer) => ({
      id: layer.id,
      type: layer.type,
      name: layer.name,
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      zIndex: layer.zIndex,
    })),
  })
  if (isFlatteningLayers.value || !layerIds.length) return
  const bounds = selectedLayerBounds()
  logFlat('flat-bounds', { bounds })
  if (!bounds) return
  const confirmed = await confirm('Flatten selected layers into one image layer? This cannot be undone.', {
    title: 'Confirm flatten',
    kind: 'warning',
    okLabel: 'Flat',
    cancelLabel: 'Cancel',
  })
  logFlat('flat-confirmed', { confirmed })
  if (!confirmed) return
  isFlatteningLayers.value = true
  try {
    const flatDocument = flattenDocumentForSelectedLayers(bounds, layerIds)
    logFlat('flat-render-start', {
      canvas: flatDocument.canvas,
      layers: flatDocument.layers.map((layer) => ({
        id: layer.id,
        type: layer.type,
        name: layer.name,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        zIndex: layer.zIndex,
      })),
    })
    const dataUrl = await renderHandoutToDataUrl(flatDocument, editor.library, 1, imageElements, 'image/png', undefined, {
      projectTarget: {
        projectId: editor.currentProjectId,
        projectDir: editor.projectDir || undefined,
      },
      masksEnabled: maskFeatureEnabled,
      maskDataUrls: editor.maskDataUrls,
    })
    logFlat('flat-render-complete', {
      dataUrlBytes: dataUrlByteSize(dataUrl),
      dataUrlPrefix: dataUrl.slice(0, 32),
    })
    const assetId = crypto.randomUUID()
    const fileName = `${editor.document.title.replace(/[^a-zA-Z0-9._-]+/g, '-') || 'handout'}-flat.png`
    const path = await saveProjectAsset({
      projectId: editor.currentProjectId,
      projectDir: editor.projectDir || undefined,
    }, assetId, fileName, dataUrl)
    const now = new Date().toISOString()
    const asset: LibraryRecord = {
      id: assetId,
      name: fileName,
      fileName,
      path,
      thumbnailPath: null,
      tags: ['flat'],
      folder: '',
      mediaType: 'image/png',
      createdAt: now,
      updatedAt: now,
    }
    editor.registerProjectAsset(asset)
    logFlat('flat-project-asset-saved', {
      assetId: asset.id,
      name: asset.name,
      path: asset.path,
      mediaType: asset.mediaType,
    })
    await loadImage(asset)
    editor.setLayerSelection(layerIds)
    editor.flattenSelectedLayersToImage(asset, bounds)
    logFlat('flat-document-replaced', {
      assetId: asset.id,
      selectedLayerIds: [...editor.selectedLayerIds],
      layers: editor.document.layers.map((layer) => ({
        id: layer.id,
        type: layer.type,
        name: layer.name,
        assetId: isImageLayer(layer) ? layer.assetId : undefined,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        zIndex: layer.zIndex,
      })),
    })
    await nextTick()
    void syncImages(editor.library)
    void updateTransformer()
  } catch (error) {
    logFlat('flat-failed', { error: serializableLogData({ error }) })
    throw error
  } finally {
    isFlatteningLayers.value = false
  }
}

async function updateTransformer() {
  await nextTick()
  const transformer = transformerRef.value?.getNode()
  if (!transformer) return
  if (editor.maskEditTarget && activeTool.value === 'select') {
    const maskNode = maskEditNodeRef.value?.getNode()
    transformer.nodes(maskNode ? [maskNode] : [])
    transformer.getLayer()?.batchDraw()
    return
  }
  const selectedNodes = editor.selectedLayerIds
    .map((layerId) => layerNodeRefs[layerId]?.getNode())
    .filter((node): node is Konva.Node => Boolean(node))
  transformer.nodes(selectedNodes)
  transformer.getLayer()?.batchDraw()
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

function fontPreviewSource(font: LibraryRecord) {
  return previewUrl(font)
}

function toggleBackgroundVisibility() {
  editor.patchCanvas({ backgroundVisible: !(editor.document.canvas.backgroundVisible !== false) })
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
  await saveProjectWithPreview({
    editor,
    imageElements,
    maxMaskEdge: EDITOR_MASK_PREVIEW_MAX_EDGE,
    maxCompositeEdge: EDITOR_MASK_PREVIEW_MAX_EDGE,
    logPreview: logHandoutPreview,
  })
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

async function cloneHandoutProject(project: ProjectSummary) {
  await editor.cloneManagedHandout(project.id)
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
        finderRevision.font += 1
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
  cancelEffectCacheRefresh()
  cancelMaskCompositeRefresh()
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
watch(layerMaskRenderSignature, () => {
  scheduleMaskCompositeRefresh('layer-mask-signature')
  void refreshMaskPreviewUrls()
  void refreshMaskEditImage()
}, { flush: 'post' })
watch(() => editor.maskEditTarget, () => {
  void refreshMaskEditImage()
  void updateTransformer()
}, { deep: true })
watch(backgroundMaskRenderSignature, () => {
  scheduleMaskCompositeRefresh('background-mask-signature')
}, { flush: 'post' })
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
  () => {
    void fitEditorCanvas('canvas-size')
  },
)
watch(
  () => editor.view,
  () => {
    if (editor.view === 'editor') {
      void fitEditorCanvas('enter-editor')
      scheduleMaskCompositeRefresh('enter-editor')
    }
  },
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
        <p>Manage handouts, assets, and fonts before opening the canvas editor.</p>
      </div>
      <ButtonGroup class="manager-header-actions">
        <Button variant="outline" size="sm" @click="isSettingsDialogOpen = true">
          <Settings data-icon="inline-start" />
          Settings
        </Button>
        <Badge variant="secondary">{{ editor.status }}</Badge>
      </ButtonGroup>
    </header>

    <Tabs default-value="handouts" class="manager-tabs">
      <TabsList class="manager-tab-list">
        <TabsTrigger value="handouts">Handouts</TabsTrigger>
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
              <ButtonGroup class="finder-status-actions">
                <Button
                  size="sm"
                  variant="outline"
                  :disabled="!selectedHandoutProject()"
                  @click="selectedHandoutProject() && cloneHandoutProject(selectedHandoutProject()!)"
                >
                  <Plus data-icon="inline-start" />
                  Clone
                </Button>
                <Button
                  size="sm"
                  :disabled="!selectedHandoutProject() || isSelectedHandoutExporting()"
                  @click="exportSelectedHandout"
                >
                  <Save data-icon="inline-start" />
                  Export PNG
                </Button>
              </ButtonGroup>
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
            <span class="font-card-preview">
              <img v-if="font.thumbnailPath" :src="fontPreviewSource(font)" alt="" draggable="false" />
              <span v-else :style="{ fontFamily: fontFamily(font) }">Ag 字</span>
            </span>
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
    <ConfigurationDialog v-model:open="isSettingsDialogOpen" />
  </div>

  <ResizablePanelGroup v-else direction="horizontal" class="app-shell">
    <ResizablePanel :default-size="23" :min-size="16" :max-size="36" class="shell-panel">
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

      <Tabs v-model="activeRailTab" default-value="assets" class="rail-tabs">
        <TabsList class="grid grid-cols-4">
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="fonts">Fonts</TabsTrigger>
          <TabsTrigger value="graph">Graph</TabsTrigger>
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
              <span class="font-preview">
                <img v-if="font.thumbnailPath" :src="fontPreviewSource(font)" alt="" draggable="false" />
                <span v-else :style="{ fontFamily: fontFamily(font) }">Ag 字</span>
              </span>
              <span class="font-meta">
                <strong>{{ font.name }}</strong>
                <span>Click to apply/create · drag for New Text · {{ font.tags.join(', ') || 'No tags' }}</span>
              </span>
            </button>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="graph" class="rail-tab-content">
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
          <ButtonGroup class="layer-actions">
            <Button size="sm" variant="outline" @click="editor.addText()">
              <Type data-icon="inline-start" />
              Text
            </Button>
            <Button size="sm" variant="outline" @click="editor.addPaint()">
              <Brush data-icon="inline-start" />
              Paint
            </Button>
            <Button
              v-if="maskFeatureEnabled"
              class="mask-toggle"
              size="sm"
              variant="outline"
              :disabled="!selectedMaskControlLayers.length"
              :title="selectedMaskControlDeletes ? 'Delete masks from selected layers' : 'Add masks to selected layers without one'"
              @click="toggleSelectedLayerMask"
            >
              Mask {{ selectedMaskControlDeletes ? '-' : '+' }}
            </Button>
          </ButtonGroup>
          <ScrollArea class="rail-scroll">
            <template v-for="item in layerListItems" :key="item.kind === 'group' ? item.group.id : item.layer.id">
              <div
                v-if="item.kind === 'group'"
                class="layer-row layer-group-row"
                :class="{ dragging: draggedGroupId === item.group.id }"
                role="button"
                tabindex="0"
                draggable="true"
                @click="toggleGroupCollapsed(item.group.id)"
                @dragstart="startGroupListDrag(item.group, $event)"
                @dragover.prevent
                @drop="handleGroupDrop(item.group, $event)"
                @dragend="clearLayerDragState"
                @keydown.enter="toggleGroupCollapsed(item.group.id)"
              >
                <ChevronRight v-if="groupIsCollapsed(item.group.id)" class="layer-icon" />
                <ChevronDown v-else class="layer-icon" />
                <span>
                  <strong>{{ item.group.name }}</strong>
                  <em>{{ item.layers.length }} layers · drag group to reorder</em>
                </span>
                <Button
                  class="layer-visibility"
                  size="icon"
                  variant="ghost"
                  :data-visible="item.group.visible"
                  @click.stop="editor.toggleGroupVisibility(item.group.id)"
                >
                  <Eye v-if="item.group.visible" />
                  <EyeOff v-else />
                </Button>
                <Button
                  class="row-delete"
                  size="icon"
                  variant="ghost"
                  title="Ungroup"
                  @click.stop="editor.ungroupGroup(item.group.id)"
                >
                  <Trash2 />
                </Button>
              </div>
              <div
                v-for="layer in item.kind === 'group' && !groupIsCollapsed(item.group.id) ? item.layers : item.kind === 'layer' ? [item.layer] : []"
                :key="layer.id"
                class="layer-row"
                :class="{ selected: editor.selectedLayerIds.includes(layer.id), dragging: draggedLayerId === layer.id, child: item.kind === 'group' }"
                role="button"
                tabindex="0"
                draggable="true"
                @click="selectLayerFromList(layer.id, $event)"
                @dragstart="startLayerListDrag(layer, $event)"
                @dragover.prevent
                @drop="handleLayerListDrop(layer, $event)"
                @dragend="clearLayerDragState"
                @keydown.enter="selectLayerFromList(layer.id, $event)"
              >
                <div class="layer-preview" :style="layerPreviewStyle(layer)">
                  <span>{{ layerPreviewText(layer) }}</span>
                </div>
                <span>
                  <strong>{{ layerName(layer) }}</strong>
                  <em>{{ layer.type }} · z{{ layer.zIndex }}</em>
                </span>
                <div class="layer-row-actions">
                  <div
                    v-if="maskFeatureEnabled && layer.mask"
                    class="mask-preview"
                    :class="maskPreviewClass(layer)"
                    draggable="true"
                    title="Click to enter or exit mask edit, double click to enable or disable"
                    @click="toggleMaskEditFromLayerRow(layer, $event)"
                    @dblclick="toggleMaskEnabledFromLayerRow(layer, $event)"
                    @dragstart.stop="startMaskDrag(layer, $event)"
                    @dragend="clearLayerDragState"
                  >
                    <img v-if="maskPreviewUrls[layer.mask.id]" :src="maskPreviewUrls[layer.mask.id]" alt="" />
                  </div>
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
              </div>
            </template>
            <div class="layer-row background-layer-row" role="button" tabindex="-1">
              <Layers class="layer-icon" />
              <span>
                <strong>Background</strong>
                <em>locked · bottom layer</em>
              </span>
              <Button
                class="layer-visibility"
                size="icon"
                variant="ghost"
                :data-visible="editor.document.canvas.backgroundVisible !== false"
                @click.stop="toggleBackgroundVisibility"
              >
                <Eye v-if="editor.document.canvas.backgroundVisible !== false" />
                <EyeOff v-else />
              </Button>
            </div>
          </ScrollArea>
          <ButtonGroup class="layer-actions layer-actions-bottom">
            <Button size="sm" variant="outline" :disabled="!editor.selectedLayerIds.length" @click="editor.mergeSelectedLayersIntoGroup()">
              Merge
            </Button>
            <Button size="sm" variant="outline" :disabled="!editor.selectedLayerIds.length || isFlatteningLayers" @click="flattenSelectedLayers">
              Flat
            </Button>
            <Button size="icon" variant="outline" title="Move up" @click="editor.moveSelectedLayer(1)">
              <ArrowUp />
            </Button>
            <Button size="icon" variant="outline" title="Move down" @click="editor.moveSelectedLayer(-1)">
              <ArrowDown />
            </Button>
            <Button size="sm" variant="destructive" :disabled="!editor.selectedLayer" @click="deleteLayer()">
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </ButtonGroup>
        </TabsContent>
      </Tabs>
    </aside>
    </ResizablePanel>

    <ResizableHandle with-handle />

    <ResizablePanel :default-size="57" :min-size="38" class="shell-panel">
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
          <Badge v-if="maskFeatureEnabled && maskEditLabel" variant="secondary">Editing {{ maskEditLabel }}</Badge>
          <div class="zoom-controls">
            <Button size="icon" variant="outline" @click="zoomOut">
              <Minus />
            </Button>
            <Button size="sm" variant="outline" @click="fitEditorCanvas('button')">Fit</Button>
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
                  v-if="!maskedBackgroundImage"
                  :config="{
                    name: 'canvas-background',
                    x: 0,
                    y: 0,
                    width: editor.document.canvas.width,
                    height: editor.document.canvas.height,
                    fill: editor.document.canvas.backgroundVisible !== false ? editor.document.canvas.backgroundColor : 'rgba(0,0,0,0)',
                  }"
                />
                <v-image
                  v-if="maskedBackgroundImage && editor.document.canvas.backgroundVisible !== false"
                  :config="{
                    name: 'canvas-background',
                    image: maskedBackgroundImage,
                    x: 0,
                    y: 0,
                    width: editor.document.canvas.width,
                    height: editor.document.canvas.height,
                    listening: true,
                  }"
                />
                <v-image
                  v-if="!maskedBackgroundImage && backgroundImage && editor.document.canvas.backgroundVisible !== false"
                  :config="{
                    image: backgroundImage,
                    x: 0,
                    y: 0,
                    width: editor.document.canvas.width,
                    height: editor.document.canvas.height,
                    listening: false,
                  }"
                />
                <template v-for="layer in visibleCanvasLayers" :key="layer.id">
                  <v-image
                    v-if="maskedImageForLayer(layer)"
                    :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                    :config="maskedLayerConfig(layer)"
                    @click="selectCanvasLayer(layer.id, $event)"
                    @tap="selectCanvasLayer(layer.id, $event)"
                    @dragstart="onLayerDragStart(layer, $event)"
                    @dragmove="onDragMove(layer, $event)"
                    @dragend="onDragEnd(layer)"
                    @transform="onTransform(layer, $event)"
                    @transformend="onTransformEnd(layer)"
                  />
                  <v-image
                    v-else-if="!layerMaskActive(layer) && isImageLayer(layer) && imageForLayer(layer)"
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
                    v-else-if="!layerMaskActive(layer) && isTextLayer(layer)"
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
                    v-else-if="!layerMaskActive(layer) && isShapeLayer(layer) && ['rect', 'round-rect'].includes(layer.shape)"
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
                    v-else-if="!layerMaskActive(layer) && isShapeLayer(layer) && ['diamond', 'hexagon-h', 'hexagon-v'].includes(layer.shape)"
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
                    v-else-if="!layerMaskActive(layer) && isShapeLayer(layer) && layer.shape === 'ellipse'"
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
                    v-else-if="!layerMaskActive(layer) && isShapeLayer(layer) && isCurveShape(layer.shape)"
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
                    v-else-if="!layerMaskActive(layer) && isShapeLayer(layer) && layer.shape === 'line'"
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
                    v-else-if="!layerMaskActive(layer) && isPaintLayer(layer)"
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
                <v-image
                  v-if="maskFeatureEnabled && activeMaskEditLayer?.mask && maskEditImage"
                  :ref="setMaskEditNodeRef"
                  :config="maskEditConfig(activeMaskEditLayer)"
                  @dragstart="onMaskEditDragStart(activeMaskEditLayer)"
                  @dragend="onMaskEditDragEnd(activeMaskEditLayer, $event)"
                  @transformend="onMaskEditTransformEnd(activeMaskEditLayer, $event)"
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
    </ResizablePanel>

    <ResizableHandle with-handle />

    <ResizablePanel :default-size="20" :min-size="16" :max-size="34" class="shell-panel">
    <RightInspector
      v-model:export-scale="exportScale"
      v-model:export-format="exportFormat"
      v-model:export-quality="exportQuality"
      :is-exporting="isExportingCurrent"
      :export-log="exportLog"
      :export-progress="exportProgress"
      :active-tool="activeTool"
      @export-image="exportCurrentImage"
    />
    </ResizablePanel>
  </ResizablePanelGroup>
</template>
