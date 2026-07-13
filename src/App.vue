<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, shallowReactive, watch } from 'vue'
import Konva from 'konva'
import type { DirEntry } from 'vuefinder'

import RightInspector from '@/components/editor/RightInspector.vue'
import BootSplash from '@/components/BootSplash.vue'
import EditorTopBar from '@/components/EditorTopBar.vue'
import ManagerShell from '@/components/ManagerShell.vue'
import TokenWorkspace from '@/components/token/TokenWorkspace.vue'
import LeftRail from '@/components/LeftRail.vue'
import CanvasWorkspace from '@/components/CanvasWorkspace.vue'
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
import { useBrushCursor } from '@/composables/useBrushCursor'
import { usePolygonCreation } from '@/composables/usePolygonCreation'
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
import type { NewShapeLayerInput, ShapeKind } from '@/lib/handout'
import { isLayerEffectivelyVisible } from '@/lib/handout'
import type { EditorTool } from '@/lib/editor-tools'
import { createMaskShapeOperation, createMaskPolygonOperationFromDocumentInput, maskBrushValueFromOpacity } from '@/lib/mask-shapes'
import { documentPointToMaskLocal } from '@/lib/mask-geometry'
import { editorMaskGpuRuntime } from '@/lib/mask-runtime'
import { clearPaintCanvasCache } from '@/lib/paint-rendering'
import { disposeLayerSourceCanvasCache } from '@/lib/render/mask-composition'
import { createAppShortcutHandler } from '@/app/AppShortcuts'
import { appConfiguration } from '@/lib/configuration'
import { partitionUploadFiles } from '@/lib/upload-validation'
import { isPaintLayer, useEditorStore } from '@/stores/editor'
import { useWorkspaceStore } from '@/stores/workspace'
import { useTokenStore } from '@/stores/token'

type NodeRef = { getNode: () => Konva.Node }
type KonvaEvent = { target: Konva.Node; evt?: MouseEvent; cancelBubble?: boolean }

Konva.dragButtons = [0]
const PREVIEW_TARGET_BYTES = 512 * 1024

const editor = useEditorStore()
const workspace = useWorkspaceStore()
const tokenStore = useTokenStore()
const stageFrameRef = ref<HTMLElement>()
const stageRef = ref<{ getNode: () => Konva.Stage }>()
const transformerRef = ref<{ getNode: () => Konva.Transformer }>()
const maskEditNodeRef = ref<NodeRef>()
const layerNodeRefs = reactive<Record<string, NodeRef | undefined>>({})
const maskedLayerImages = shallowReactive<Record<string, HTMLCanvasElement | undefined>>({})
const maskedLayerRenderRevisions = shallowReactive<Record<string, number>>({})
const maskEditImage = ref<CanvasImageSource>()
const maskEditImageRevision = ref(0)
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
const selectedTokenProjectFolder = ref('')
const selectedBackgroundFolder = ref('')
const selectedAssetFolder = ref('')
const selectedFontFolder = ref('')
const isBooting = ref(true)
const selectedFinderItems = reactive<Record<'handout' | 'token' | 'background' | 'asset' | 'font', DirEntry[]>>({
  handout: [],
  token: [],
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
const handoutFinderStyle = {
  '--finder-grid-scale': String(appConfiguration.finder.handoutGridScale),
  height: `${appConfiguration.finder.managerHeightPx}px`,
  minHeight: `${appConfiguration.finder.managerHeightPx}px`,
  maxHeight: `${appConfiguration.finder.managerHeightPx}px`,
}
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
  fontDragStarted,
  startAssetDrag,
  clearAssetDrag,
  startFontDrag,
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
  scheduleMaskCompositeRefresh: (_reason: string, _options?: any) => {},
}
const {
  maskPreviewCacheDataUrls,
  maskProxyMaxEdge,
  waitForIdleTask,
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
function requestMaskedLayerDraw(layerId: string) {
  void nextTick(() => {
    const node = layerNodeRefs[layerId]?.getNode()
    node?.getLayer()?.batchDraw()
  })
}
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
  maskedLayerRenderRevisions,
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
  refreshMaskedBackgroundImage,
  scheduleMaskCompositeRefresh,
  scheduleMaskPreviewRefresh,
  scheduleMaskEditImageRefresh,
  recordMaskPointerActivity,
  cancelMaskCompositeRefresh,
} = useMaskComposition({
  editor,
  imageElements,
  maskFeatureEnabled,
  isDraggingMask,
  stageScale,
  editorMaskPreviewMaxEdge: EDITOR_MASK_PREVIEW_MAX_EDGE,
  maskProxyMaxEdge,
  activeMaskEditLayer,
  logCanvasLayerRenderState,
  maskedLayerImages,
  maskedLayerRenderRevisions,
  requestMaskedLayerDraw,
  maskPreviewUrls,
  maskEditImage,
  maskEditImageRevision,
})
maskCompositionRefreshHolder.refreshMaskPreviewUrls = refreshMaskPreviewUrls
maskCompositionRefreshHolder.scheduleMaskCompositeRefresh = scheduleMaskCompositeRefresh
const {
  draftStroke,
  activePaintDefaults,
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
  brushCursor,
  updateBrushCursorFromPointer,
  hideBrushCursor,
} = useBrushCursor({
  activeTool,
  stageFrameRef,
  stageScale,
  brushSize: () => activePaintDefaults().width,
  isPanning: computed(() => panState.active),
})
const {
  polygonDraft,
  finishPolygonDraft,
  handlePolygonPointerDown,
  polygonDraftLineConfig,
  polygonDraftPointConfig,
} = usePolygonCreation({
  activeTool,
  stageScale,
  canvasPointFromClient,
  addPolygonToCanvas,
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
  handlePolygonPointerDown,
})
const {
  curveControlRevision,
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
  autoTextLayerHeight,
  refreshLayerEffectCacheAfterUpdate,
  logBackgroundRender,
  logShape,
  logSnap,
  curveControlRevision,
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
  tokenContextMenuItems,
  imageHandoutContextMenuItems,
  imageRecordFromFinderEntry,
  projectFromFinderEntry,
  assetRecordFromDragPath,
  fontRecordFromDragPath,
} = useFinderManagement(editor, {
  addAssetToCanvas,
  createHandoutFromImageRecord,
  cloneHandoutProject,
  exportHandoutProject,
  previewUrl,
  uploadFiles,
  selectedFolders: {
    handout: selectedProjectFolder,
    token: selectedTokenProjectFolder,
    background: selectedBackgroundFolder,
    asset: selectedAssetFolder,
    font: selectedFontFolder,
  },
})

function selectedTokenAssets() {
  return selectedFinderItems.asset
    .map((entry) => imageRecordFromFinderEntry('asset', entry))
    .filter((record): record is LibraryRecord => Boolean(record))
}

async function createTokenFromSelectedAssets() {
  await tokenStore.createFromAssets(selectedTokenAssets())
}
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
  fontRecordFromDragPath,
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
  maskEditImageRevision,
  maskProxyMaxEdge,
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
  tokenContextMenuItems,
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
  tokenStore,
  createTokenFromSelectedAssets,
  selectedTokenAssets,
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
  startPolygonCreation,
  startAssetDrag,
  clearAssetDrag,
  startFontDrag,
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
provide('canvas-context', {
  stageFrameRef,
  stageRef,
  transformerRef,
  layerNodeRefs,
  stageConfig,
  contentGroupConfig,
  stageScale,
  documentFilterStyle,
  transformerConfig,
  activeTool,
  maskFeatureEnabled,
  maskEditLabel,
  panState,
  draggedAssetId,
  draggedFontId,
  draggedShapeKind,
  visibleCanvasLayers,
  selectedCurveLayers,
  draftStroke,
  polygonDraft,
  polygonDraftLineConfig,
  polygonDraftPointConfig,
  brushCursor,
  selectionBox,
  guideLines,
  maskedBackgroundImage,
  backgroundImage,
  maskEditImage,
  maskEditImageRevision,
  activeMaskEditLayer,
  handleCanvasDragOver,
  handleCanvasDrop,
  handleCanvasWheel,
  startCanvasPan,
  moveCanvasPan,
  stopCanvasPan,
  updateBrushCursorFromPointer,
  recordMaskPointerActivity,
  hideBrushCursor,
  handleStagePointer,
  startSelectionBox,
  moveSelectionBox,
  stopSelectionBox,
  selectCanvasLayer,
  onLayerDragStart,
  onDragMove,
  onDragEnd,
  onTransform,
  onTransformEnd,
  setMaskEditNodeRef,
  onMaskEditDragStart,
  onMaskEditDragEnd,
  onMaskEditTransformEnd,
  maskedLayerConfig,
  layerConfig,
  textConfig,
  shapeConfig,
  paintConfig,
  maskEditConfig,
  curveHandleConfig,
  curveGuideConfig,
  curveGuideLineConfig,
  curvePointKeys,
  moveCurvePoint,
  endCurvePointMove,
  maskedImageForLayer,
  layerMaskActive,
  imageForLayer,
  isShapeLayer,
  zoomIn,
  zoomOut,
  fitEditorCanvas,
})
const handleGlobalKeydown = createAppShortcutHandler({
  isEditorView: () => workspace.activeView === 'handout-editor',
  hasSelectedLayer: () => Boolean(editor.selectedLayerId),
  saveProject: () => { void saveProject() },
  undo: () => editor.undo(),
  redo: () => editor.redo(),
  deleteLayer: () => deleteLayer(),
  finishActiveTool,
  setTool: (tool) => setActiveTool(tool),
  setRailTab: (tab) => { activeRailTab.value = tab },
  addText: () => {
    editor.addText()
    void updateTransformer()
  },
  moveLayerUp: () => editor.moveSelectedLayer(1),
  moveLayerDown: () => editor.moveSelectedLayer(-1),
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
    view: workspace.activeView,
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
  if (fontDragStarted.value) return
  logText('add-font-text-to-canvas-click', { fontId: font.id, fontName: font.name, fontFamily: fontFamily(font) })
  editor.applyOrCreateTextWithFont(font, position)
  void updateTransformer()
}

function createFontTextOnCanvas(font: LibraryRecord, position?: { x?: number; y?: number }) {
  logText('create-font-text-on-canvas', { fontId: font.id, fontName: font.name, fontFamily: fontFamily(font), position })
  editor.addText(font, position)
  logText('create-font-text-on-canvas-complete', { layerCount: editor.document.layers.length })
  void updateTransformer()
}

function addShapeToCanvas(shape: ShapeKind, position?: { x?: number; y?: number }) {
  if (addShapeToActiveMask(shape, position)) return
  if (shape === 'polygon') {
    startPolygonCreation()
    return
  }
  void appendDebugLog('mask', 'shape-add-normal-layer', {
    shape,
    position,
    layerCountBefore: editor.document.layers.length,
  })
  editor.addShape(shape, position)
  void updateTransformer()
}

function addPolygonToCanvas(input: NewShapeLayerInput) {
  if (addPolygonToActiveMask(input)) return
  void appendDebugLog('mask', 'polygon-add-normal-layer', {
    input: polygonInputLogData(input),
    layerCountBefore: editor.document.layers.length,
  })
  editor.addPolygon(input)
  void updateTransformer()
}

function activeMaskEditMask() {
  const target = editor.maskEditTarget
  if (!target) return undefined
  if (target.kind === 'background') return editor.document.canvas.backgroundMask ?? undefined
  return editor.document.layers.find((layer) => layer.id === target.layerId)?.mask ?? undefined
}

function activeMaskBrushOpacity() {
  const layer = editor.selectedLayer
  return layer && isPaintLayer(layer) ? layer.brushOpacity : editor.toolSettings.brushOpacity
}

function activeMaskEraserOpacity() {
  const layer = editor.selectedLayer
  return layer && isPaintLayer(layer) ? layer.eraserOpacity : editor.toolSettings.eraserOpacity
}

function maskLocalTopLeft(point: { x: number; y: number }) {
  const mask = activeMaskEditMask()
  if (!mask) return undefined
  if (editor.maskEditTarget?.kind === 'background') return point
  return documentPointToMaskLocal(mask, point)
}

function addShapeToActiveMask(shape: ShapeKind, position?: { x?: number; y?: number }) {
  const mask = activeMaskEditMask()
  if (!mask || shape === 'polygon') return false
  const local = maskLocalTopLeft({ x: position?.x ?? 180, y: position?.y ?? 160 })
  if (!local) return false
  const brushOpacity = activeMaskBrushOpacity()
  const eraserOpacity = activeMaskEraserOpacity()
  const strengthValue = maskBrushValueFromOpacity(brushOpacity)
  const operation = createMaskShapeOperation({
    shape,
    x: local.x,
    y: local.y,
    value: strengthValue,
  })
  void appendDebugLog('mask', 'shape-add-active-mask', {
    maskId: mask.id,
    target: editor.maskEditTarget,
    shape,
    source: 'opacity',
    brushOpacity,
    eraserOpacity,
    targetValue: 255,
    strength: strengthValue / 255,
    strengthValue,
    value: operation.value,
    documentPosition: position,
    localPosition: local,
    operation: maskShapeLogData(operation),
  })
  void editor.addMaskShape(mask, operation)
  return true
}

function addPolygonToActiveMask(input: NewShapeLayerInput) {
  const mask = activeMaskEditMask()
  if (!mask || input.shape !== 'polygon' || !input.polygonPoints?.length) return false
  const brushOpacity = activeMaskBrushOpacity()
  const eraserOpacity = activeMaskEraserOpacity()
  const strengthValue = maskBrushValueFromOpacity(brushOpacity)
  const operation = createMaskPolygonOperationFromDocumentInput(input, mask, strengthValue)
  void appendDebugLog('mask', 'polygon-add-active-mask', {
    maskId: mask.id,
    target: editor.maskEditTarget,
    source: 'opacity',
    brushOpacity,
    eraserOpacity,
    targetValue: 255,
    strength: strengthValue / 255,
    strengthValue,
    value: strengthValue,
    input: polygonInputLogData(input),
    operation: operation ? maskShapeLogData(operation) : null,
  })
  if (operation) void editor.addMaskShape(mask, operation)
  return true
}

function startPolygonCreation() {
  void appendDebugLog('mask', 'polygon-tool-start', {
    maskTarget: editor.maskEditTarget,
    selectedLayerId: editor.selectedLayerId,
    selectedLayerIds: editor.selectedLayerIds,
  })
  if (!editor.maskEditTarget) editor.selectLayer(undefined)
  activeTool.value = 'polygon'
  void updateTransformer()
}

function setActiveTool(tool: EditorTool) {
  if (tool === 'polygon') {
    startPolygonCreation()
    return
  }
  activeTool.value = tool
}

function finishActiveTool() {
  if (activeTool.value !== 'polygon') return false
  void appendDebugLog('mask', 'polygon-tool-finish-request', {
    maskTarget: editor.maskEditTarget,
  })
  finishPolygonDraft({ selectTool: false })
  activeTool.value = 'select'
  return true
}

function polygonInputLogData(input: NewShapeLayerInput) {
  return {
    shape: input.shape,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    pointCount: input.polygonPoints?.length ?? 0,
    polygonPoints: input.polygonPoints,
  }
}

function maskShapeLogData(operation: ReturnType<typeof createMaskShapeOperation>) {
  return {
    id: operation.id,
    shape: operation.shape,
    x: operation.x,
    y: operation.y,
    width: operation.width,
    height: operation.height,
    value: operation.value,
    strokeWidth: operation.strokeWidth,
    pointCount: operation.polygonPoints?.length ?? 0,
    polygonPoints: operation.polygonPoints,
  }
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

function cleanupRuntimeLayerCaches() {
  const layerIds = editor.document.layers.map((layer) => layer.id)
  const maskIds = [
    editor.document.canvas.backgroundMask?.id,
    ...editor.document.layers.map((layer) => layer.mask?.id),
  ].filter((id): id is string => Boolean(id))
  clearPaintCanvasCache(layerIds)
  disposeLayerSourceCanvasCache(layerIds)
  editorMaskGpuRuntime.disposeMissing(maskIds, layerIds)
}

onMounted(async () => {
  try {
    resetKonvaDragButtons()
    void appendDebugLog('app', 'boot start')
    await Promise.all([editor.refreshLibrary(), editor.refreshProjects(), tokenStore.refreshProjects()])
    void syncImages(editor.library)
    window.addEventListener('keydown', handleGlobalKeydown)
    // Use window-level capture so font drops are intercepted before any
    // other element (Konva canvas, etc.) can interfere with the event.
    window.addEventListener('dragover', handleDocumentFontDragOver, { capture: true })
    window.addEventListener('drop', handleDocumentFontDrop, { capture: true })
    logText('font-drag-window-listeners-registered')
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
  if (activeTool.value === 'polygon') finishPolygonDraft({ selectTool: false })
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('dragover', handleDocumentFontDragOver, { capture: true })
  window.removeEventListener('drop', handleDocumentFontDrop, { capture: true })
  window.removeEventListener('resize', resizeStageViewport)
  cleanupExportProgress()
  cancelEffectCacheRefresh()
  cancelMaskCompositeRefresh()
})

watch(() => editor.library.backgrounds, () => { void syncImages(editor.library) }, { deep: true })
watch(() => editor.library.assets, () => { void syncImages(editor.library) }, { deep: true })
watch(() => editor.document.layers.map((layer) => layer.id).join('|'), cleanupRuntimeLayerCaches)
watch(() => editor.selectedLayerId, updateTransformer)
watch(selectedLayerIdsSignature, updateTransformer)
watch(selectedLayerTransformSignature, updateTransformer)
watch(selectedLayerRenderSignature, () => {
  if (editor.selectedLayerId) void refreshLayerEffectCacheAfterUpdate(editor.selectedLayerId)
})
watch(textLayerRenderSignature, () => {
  if (workspace.activeView === 'handout-editor') void autoResizeTextLayerHeights()
  if (workspace.activeView === 'handout-editor') void logTextLayerMetrics('text-signature-change')
}, { flush: 'post' })
watch(layerEffectsSignature, (nextSignature, previousSignature) => {
  scheduleLayerEffectCacheRefresh(changedEffectLayerIds(nextSignature, previousSignature))
})
const maskSignaturesHandledByPulse = new Set<string>()
function rememberMaskSignatureHandledByPulse(signature: string) {
  if (!signature) return
  maskSignaturesHandledByPulse.add(signature)
  while (maskSignaturesHandledByPulse.size > 24) {
    const oldest = maskSignaturesHandledByPulse.values().next().value
    if (!oldest) break
    maskSignaturesHandledByPulse.delete(oldest)
  }
}
watch(() => editor.maskChangePulse, (pulse) => {
  if (!pulse?.id) return
  rememberMaskSignatureHandledByPulse(layerMaskRenderSignature.value)
  const maskIds = pulse.maskId ? [pulse.maskId] : undefined
  const layerIds = pulse.layerId ? [pulse.layerId] : undefined
  scheduleMaskCompositeRefresh(`mask-pulse:${pulse.reason}`, {
    layerIds,
    maskIds,
    interactive: true,
  })
  scheduleMaskPreviewRefresh(maskIds ? { maskIds } : undefined, `mask-pulse:${pulse.reason}`)
  scheduleMaskEditImageRefresh(`mask-pulse:${pulse.reason}`)
}, { flush: 'post' })
watch(layerMaskRenderSignature, () => {
  const signature = layerMaskRenderSignature.value
  queueMicrotask(() => {
    if (maskSignaturesHandledByPulse.has(signature)) {
      maskSignaturesHandledByPulse.delete(signature)
      return
    }
    scheduleMaskCompositeRefresh('layer-mask-signature')
    scheduleMaskPreviewRefresh(undefined, 'layer-mask-signature')
    scheduleMaskEditImageRefresh('layer-mask-signature')
  })
}, { flush: 'post' })
watch(() => editor.maskEditTarget, () => {
  void refreshMaskEditImage()
  void updateTransformer()
}, { deep: true })
watch(backgroundMaskRenderSignature, () => {
  void refreshMaskedBackgroundImage()
}, { flush: 'post' })
watch(
  backgroundRenderSignature,
  () => {
    if (workspace.activeView !== 'handout-editor') return
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
  () => workspace.activeView,
  () => {
    if (workspace.activeView === 'handout-editor') {
      void fitEditorCanvas('enter-editor')
      scheduleMaskCompositeRefresh('enter-editor')
    }
  },
)
</script>

<template>
  <BootSplash v-if="isBooting" />

  <ManagerShell v-else-if="workspace.activeView === 'manager'" />

  <ResizablePanelGroup v-else-if="workspace.activeView === 'handout-editor'" direction="horizontal" class="app-shell">
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

      <CanvasWorkspace />
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

  <TokenWorkspace v-else-if="workspace.activeView === 'token-editor'" />
</template>
