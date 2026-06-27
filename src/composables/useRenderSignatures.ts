import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'

import { filterRecords } from '@/composables/useFinderManagement'
import { hasVisibleEffects } from '@/lib/effects'
import type { HandoutLayer, LayerGroup, ShapeLayer } from '@/lib/handout'
import { isCurveShape } from '@/lib/handout'
import { isTextLayer, useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type ImageCache = Record<string, HTMLImageElement>

type LayerListItem =
  | { kind: 'layer'; layer: HandoutLayer }
  | { kind: 'group'; group: LayerGroup; layers: HandoutLayer[] }

export function useRenderSignatures(options: {
  editor: EditorStore
  imageElements: ImageCache
  maskFeatureEnabled: boolean
  canvasLayers: ComputedRef<HandoutLayer[]>
  layerName: (layer: HandoutLayer) => string
  isShapeLayer: (layer: HandoutLayer) => layer is ShapeLayer
  groupForLayer: (layerId: string) => LayerGroup | undefined
  assetSearch: Ref<string>
  fontSearch: Ref<string>
  selectedAssetFolder: Ref<string>
  selectedFontFolder: Ref<string>
  stageScale: ComputedRef<number>
  stageViewport: { width: number; height: number }
  fitScale: Ref<number>
  canvasZoom: Ref<number>
  canvasPan: { x: number; y: number }
}) {
  const {
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
  } = options

  const maskEditLabel = computed(() => {
    if (!maskFeatureEnabled) return ''
    const target = editor.maskEditTarget
    if (!target) return ''
    if (target.kind === 'background') return 'Background mask'
    const layer = editor.document.layers.find((item) => item.id === target.layerId)
    return layer ? `${layerName(layer)} mask` : 'Layer mask'
  })

  const selectedCurveLayers = computed(() =>
    canvasLayers.value.filter((layer): layer is ShapeLayer =>
      isShapeLayer(layer) && isCurveShape(layer.shape) && editor.selectedLayerIds.includes(layer.id),
    ),
  )

  const layerListItems = computed<LayerListItem[]>(() => {
    const items: LayerListItem[] = []
    const renderedGroups = new Set<string>()
    const layerById = new Map(editor.layers.map((layer) => [layer.id, layer]))
    for (const layer of editor.layers) {
      const group = groupForLayer(layer.id)
      if (!group) {
        items.push({ kind: 'layer', layer })
        continue
      }
      if (renderedGroups.has(group.id)) continue
      renderedGroups.add(group.id)
      items.push({
        kind: 'group',
        group,
        layers: group.layerIds
          .map((id) => layerById.get(id))
          .filter((item): item is HandoutLayer => Boolean(item))
          .sort((a, b) => b.zIndex - a.zIndex),
      })
    }
    return items
  })

  const canvasSizeSignature = computed(() =>
    `${editor.document.canvas.width}:${editor.document.canvas.height}`,
  )

  const layerEffectsSignature = computed(() =>
    editor.document.layers
      .map((layer) => `${layer.id}:${JSON.stringify(layer.effects || {})}`)
      .join('|'),
  )

  const maskZoomBucket = computed(() => {
    if (stageScale.value >= 1) return 'full'
    if (stageScale.value >= 0.5) return 'half'
    if (stageScale.value >= 0.25) return 'quarter'
    return 'tiny'
  })

  const layerMaskRenderSignature = computed(() =>
    editor.document.layers
      .map((layer) => [
        layer.id,
        layer.mask?.enabled,
        layer.mask?.id,
        layer.mask?.path,
        layer.mask?.updatedAt,
        editor.maskDataUrls[layer.mask?.id || '']?.length || 0,
        maskZoomBucket.value,
        JSON.stringify(layer),
      ].join(':'))
      .join('|'),
  )

  const backgroundMaskRenderSignature = computed(() => [
    editor.document.canvas.width,
    editor.document.canvas.height,
    editor.document.canvas.backgroundColor,
    editor.document.canvas.backgroundVisible,
    editor.document.canvas.backgroundAssetId,
    editor.document.canvas.backgroundMask?.enabled,
    editor.document.canvas.backgroundMask?.id,
    editor.document.canvas.backgroundMask?.path,
    editor.document.canvas.backgroundMask?.updatedAt,
    editor.maskDataUrls[editor.document.canvas.backgroundMask?.id || '']?.length || 0,
    maskZoomBucket.value,
  ].join(':'))

  const activeMaskEditLayer = computed(() => {
    if (!maskFeatureEnabled) return undefined
    const target = editor.maskEditTarget
    if (!target || target.kind !== 'layer') return undefined
    return editor.document.layers.find((layer) => layer.id === target.layerId)
  })

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
        layer.lineHeight,
        layer.align,
      ].join(':'))
      .join('|'),
  )

  const selectedLayerTransformSignature = computed(() => {
    const layer = editor.selectedLayer
    return layer
      ? [layer.id, layer.x, layer.y, layer.width, layer.height, layer.rotation, layer.visible, layer.locked, layer.flipX].join(':')
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
  const selectedMaskControlLayers = computed(() => maskFeatureEnabled ? editor.selectedLayers : [])
  const selectedMaskControlDeletes = computed(() =>
    selectedMaskControlLayers.value.length > 0
    && selectedMaskControlLayers.value.every((layer) => Boolean(layer.mask)),
  )

  const transformerConfig = computed(() => ({
    rotateEnabled: true,
    useSingleNodeRotation: false,
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

  return {
    maskEditLabel,
    selectedCurveLayers,
    layerListItems,
    canvasSizeSignature,
    layerEffectsSignature,
    layerMaskRenderSignature,
    backgroundMaskRenderSignature,
    maskZoomBucket,
    activeMaskEditLayer,
    textLayerRenderSignature,
    selectedLayerTransformSignature,
    selectedLayerRenderSignature,
    selectedLayerIdsSignature,
    selectedOnlyLineShape,
    selectedOnlyCurveShape,
    selectedOnlyTextLayer,
    selectedMaskControlLayers,
    selectedMaskControlDeletes,
    transformerConfig,
    documentFilterStyle,
    backgroundAsset,
    backgroundImage,
    backgroundRenderSignature,
    filteredAssets,
    filteredFonts,
  }
}
