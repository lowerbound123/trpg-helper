<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, shallowReactive, watch } from 'vue'
import Konva from 'konva'
import { Minus } from '@lucide/vue'
import type { DirEntry } from 'vuefinder'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import RightInspector from '@/components/editor/RightInspector.vue'
import BootSplash from '@/components/BootSplash.vue'
import EditorTopBar from '@/components/EditorTopBar.vue'
import ManagerShell from '@/components/ManagerShell.vue'
import LeftRail from '@/components/LeftRail.vue'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
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
import { useFlattenLayers } from '@/composables/useFlattenLayers'
import { useCanvasDrop } from '@/composables/useCanvasDrop'
import { useProjectCreation } from '@/composables/useProjectCreation'
import { useFinderSelection } from '@/composables/useFinderSelection'
import { useTransformerSync } from '@/composables/useTransformerSync'
import { useMaskActions } from '@/composables/useMaskActions'
import { useLayerListDragDrop } from '@/composables/useLayerListDragDrop'
import {
  appendDebugLog,
  fontRecordFamily,
  type LibraryRecord,
} from '@/lib/backend'
import { createDebugLogger, serializableLogData, writeDebugLog } from '@/lib/debug-log'
import type { ShapeKind } from '@/lib/handout'
import { isCurveShape, isLayerEffectivelyVisible } from '@/lib/handout'
import { createAppShortcutHandler } from '@/app/AppShortcuts'
import { appConfiguration } from '@/lib/configuration'
import { paintStrokeLineConfig } from '@/lib/paint-rendering'
import {
  arrowDotConfig,
  arrowLineConfig,
  lineDoubleOffset,
  lineHandleConfig,
  lineHitConfig,
  lineVisualConfig,
  manualArrowVisible,
  showLineHandle,
} from '@/lib/shape-rendering'
import { partitionUploadFiles } from '@/lib/upload-validation'
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

const isSettingsDialogOpen = ref(false)
const blankWidth = ref(1280)
const blankHeight = ref(720)
const activeTool = ref<EditorTool>('select')
const activeRailTab = ref<'assets' | 'fonts' | 'graph' | 'layers'>('assets')
const assetSearch = ref('')
const fontSearch = ref('')
const selectedProjectFolder = ref('')
const selectedBackgroundFolder = ref('')
const selectedAssetFolder = ref('')
const selectedFontFolder = ref('')
const isBooting = ref(true)
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
const logHandoutPreview = createDebugLogger('handout-preview')
const logText = createDebugLogger('text')
const logUpload = createDebugLogger('upload')
const logExport = createDebugLogger('export')
const logSnap = createDebugLogger('snap')
const logShape = createDebugLogger('shape')
const logFlat = createDebugLogger('flat')
const { updateTransformer } = useTransformerSync({
  editor,
  transformerRef,
  layerNodeRefs,
  maskEditNodeRef,
  activeTool,
})
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
const layerListHolder: { groupForLayer: (layerId: string) => import('@/lib/handout').LayerGroup | undefined } = {
  groupForLayer: () => undefined,
}
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
  groupForLayer: (layerId: string) => layerListHolder.groupForLayer(layerId),
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
  isFlatteningLayers,
  flattenSelectedLayers,
} = useFlattenLayers({
  editor,
  imageElements,
  imageSize,
  loadImage,
  syncImages,
  updateTransformer,
  isShapeLayer,
  maskFeatureEnabled,
  editorMaskPreviewMaxEdge: EDITOR_MASK_PREVIEW_MAX_EDGE,
  logFlat,
})
const projectCreationHolder: { createProjectFromBackground: (bg: LibraryRecord) => Promise<void> } = {
  createProjectFromBackground: async () => {},
}
const finderSelectionHolder: { selectedImageRecord: (kind: 'background' | 'asset') => LibraryRecord | undefined } = {
  selectedImageRecord: () => undefined,
}
const {
  newProjectTitle,
  createMode,
  isCreateDialogOpen,
  createProject,
  createProjectFromBackground,
  createHandoutFromImageRecord,
  createHandoutFromFinderImage,
  saveProject,
  cloneHandoutProject,
} = useProjectCreation({
  editor,
  imageElements,
  imageSize,
  selectedProjectFolder,
  selectedImageRecord: (kind: 'background' | 'asset') => finderSelectionHolder.selectedImageRecord(kind),
  editorMaskPreviewMaxEdge: EDITOR_MASK_PREVIEW_MAX_EDGE,
  logHandoutPreview,
  blankWidth,
  blankHeight,
})
projectCreationHolder.createProjectFromBackground = createProjectFromBackground
const {
  uploadFiles,
  handleDirectFinderDrop,
  handleDirectFinderDragover,
  selectedImageRecord,
  selectedImageStatus,
  fontPreviewSource,
  handleFinderSelect,
  handleCreateBackgroundInput,
  handleCreateBackgroundDrop,
  selectedHandoutProject,
  selectedHandoutStatus,
  isSelectedHandoutExporting,
  exportSelectedHandout,
} = useFinderSelection({
  editor,
  loadImage,
  partitionUploadFiles,
  imageRecordFromFinderEntry: (kind: 'background' | 'asset', entry: DirEntry) => imageRecordFromFinderEntry(kind, entry),
  projectFromFinderEntry: (entry: DirEntry) => projectFromFinderEntry(entry),
  previewUrl,
  isHandoutExporting,
  exportHandoutProject,
  selectedFinderItems,
  finderRevision,
  selectedBackgroundFolder,
  selectedAssetFolder,
  selectedFontFolder,
  createProjectFromBackground: (bg: LibraryRecord) => projectCreationHolder.createProjectFromBackground(bg),
  logUpload,
})
finderSelectionHolder.selectedImageRecord = selectedImageRecord
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
const {
  handleCanvasDrop,
  handleCanvasDragOver,
  handleDocumentFontDragOver,
  handleDocumentFontDrop,
} = useCanvasDrop({
  editor,
  fontFamily,
  canvasPointFromClient,
  stageFrameRef,
  imageSize,
  updateTransformer,
  draggedFontId,
  draggedAssetId,
  draggedShapeKind,
  assetRecordFromDragPath,
  createFontTextOnCanvas,
  addShapeToCanvas,
  logText,
  logUpload,
})
const {
  maskPreviewClass,
  toggleSelectedLayerMask,
  toggleMaskEditFromLayerRow,
  toggleMaskEnabledFromLayerRow,
  startMaskDrag,
  handleMaskDrop,
  setMaskEditNodeRef,
  maskEditConfig,
  onMaskEditDragStart,
  onMaskEditDragEnd,
  onMaskEditTransformEnd,
} = useMaskActions({
  editor,
  maskFeatureEnabled,
  selectedMaskControlLayers,
  selectedMaskControlDeletes,
  refreshMaskPreviewUrls,
  maskPreviewUrls,
  maskPreviewCacheDataUrls,
  layerName,
  maskEditNodeRef,
  activeTool,
  maskEditImage,
  maskProxyMaxEdge,
  scheduleMaskCompositeRefresh,
  updateTransformer,
  draggedMaskLayerId,
  isDraggingMask,
})
const {
  draggedLayerId,
  draggedGroupId,
  startLayerListDrag,
  startGroupListDrag,
  handleLayerListDrop,
  handleGroupDrop,
  groupForLayer,
  groupIsCollapsed,
  toggleGroupCollapsed,
  clearLayerDragState,
  selectLayerFromList,
  toggleLayerVisibility,
} = useLayerListDragDrop({
  editor,
  draggedMaskLayerId,
  handleMaskDrop,
  updateTransformer,
})
layerListHolder.groupForLayer = groupForLayer
provide('manager-context', {
  isSettingsDialogOpen,
  isCreateDialogOpen,
  newProjectTitle,
  createMode,
  blankWidth,
  blankHeight,
  fontSearch,
  finderRevision,
  handoutFinderStyle,
  finderUploadConfig,
  finderDrivers,
  handleFinderFileDoubleClick,
  handleFinderPathChange,
  handleFinderSelect,
  handoutContextMenuItems,
  imageHandoutContextMenuItems,
  handleDirectFinderDrop,
  handleDirectFinderDragover,
  selectedHandoutStatus,
  selectedHandoutProject,
  isSelectedHandoutExporting,
  exportSelectedHandout,
  cloneHandoutProject,
  createProject,
  handleCreateBackgroundDrop,
  handleCreateBackgroundInput,
  selectedImageStatus,
  selectedImageRecord,
  createHandoutFromFinderImage,
  fontPreviewSource,
  fontFamily,
  filteredFonts,
  finderFeaturesForKind,
})
provide('left-rail-context', {
  activeRailTab,
  assetSearch,
  fontSearch,
  maskFeatureEnabled,
  finderRevision,
  finderUploadConfig,
  finderDrivers,
  finderFeaturesForKind,
  handleFinderFileDoubleClick,
  handleFinderPathChange,
  handleDirectFinderDrop,
  handleDirectFinderDragover,
  filteredAssets,
  filteredFonts,
  previewUrl,
  fontPreviewSource,
  fontFamily,
  addAssetToCanvas,
  addFontTextToCanvas,
  addShapeToCanvas,
  startAssetDrag,
  clearAssetDrag,
  startFontDrag,
  prepareFontDrag,
  clearFontDrag,
  startShapeDrag,
  clearShapeDrag,
  layerListItems,
  draggedLayerId,
  draggedGroupId,
  startLayerListDrag,
  startGroupListDrag,
  handleLayerListDrop,
  handleGroupDrop,
  clearLayerDragState,
  selectLayerFromList,
  toggleLayerVisibility,
  groupIsCollapsed,
  toggleGroupCollapsed,
  layerName,
  layerPreviewStyle,
  layerPreviewText,
  maskPreviewClass,
  maskPreviewUrls,
  toggleSelectedLayerMask,
  toggleMaskEditFromLayerRow,
  toggleMaskEnabledFromLayerRow,
  startMaskDrag,
  selectedMaskControlLayers,
  selectedMaskControlDeletes,
  isFlatteningLayers,
  flattenSelectedLayers,
  deleteLayer,
  toggleBackgroundVisibility,
})
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

function resetKonvaDragButtons() {
  Konva.dragButtons = [0]
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

function toggleBackgroundVisibility() {
  editor.patchCanvas({ backgroundVisible: !(editor.document.canvas.backgroundVisible !== false) })
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
  <BootSplash v-if="isBooting" />

  <ManagerShell v-else-if="editor.view === 'manager'" />

  <ResizablePanelGroup v-else direction="horizontal" class="app-shell">
    <ResizablePanel :default-size="23" :min-size="16" :max-size="36" class="shell-panel">
      <LeftRail />
    </ResizablePanel>

    <ResizableHandle with-handle />

    <ResizablePanel :default-size="57" :min-size="38" class="shell-panel">
    <main class="workspace">
      <EditorTopBar
        :active-tool="activeTool"
        :can-undo="editor.canUndo"
        :can-redo="editor.canRedo"
        @save="saveProject"
        @set-tool="setActiveTool"
        @undo="editor.undo()"
        @redo="editor.redo()"
      />

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
