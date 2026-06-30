import type { ComputedRef, Ref } from 'vue'

import { fontRecordFamily, type LibraryRecord } from '@/lib/backend'
import { appendDebugLog } from '@/lib/backend'
import type { HandoutLayer, ImageLayer, PaintLayer, ShapeLayer, TextLayer } from '@/lib/handout'
import { isLayerEffectivelyVisible } from '@/lib/handout'
import { layerKonvaConfig, textKonvaConfig } from '@/lib/layer-rendering'
import { paintKonvaConfig } from '@/lib/paint-rendering'
import { shapeKonvaConfig } from '@/lib/shape-rendering'
import { isImageLayer, isPaintLayer, isTextLayer, useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type ImageCache = Record<string, HTMLImageElement>
type MaskedImageMap = Record<string, HTMLCanvasElement | undefined>
type MaskPreviewUrlMap = Record<string, string | undefined>
type EditorTool = 'select' | 'brush' | 'eraser'

export function useLayerRenderConfigs(options: {
  editor: EditorStore
  imageElements: ImageCache
  previewUrl: (record: LibraryRecord) => string | undefined
  maskedLayerImages: MaskedImageMap
  maskedLayerRenderRevisions: Record<string, number | undefined>
  maskPreviewUrls: MaskPreviewUrlMap
  maskPreviewCacheDataUrls: MaskPreviewUrlMap
  maskFeatureEnabled: boolean
  activeTool: Ref<EditorTool>
  visibleCanvasLayers: ComputedRef<HandoutLayer[]>
}) {
  const {
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
  } = options

  function layerName(layer: HandoutLayer) {
    if (isTextLayer(layer)) return layer.text || layer.name
    return layer.name
  }

  function imageRecordForLayer(layer: ImageLayer) {
    return editor.resolveAsset(layer.assetId) || editor.resolveBackground(layer.assetId)
  }

  function imageForLayer(layer: ImageLayer) {
    const asset = imageRecordForLayer(layer)
    return asset ? imageElements[asset.id] : undefined
  }

  function maskedImageForLayer(layer: HandoutLayer) {
    if (!maskFeatureEnabled) return undefined
    return layer.mask?.enabled ? maskedLayerImages[layer.id] : undefined
  }

  function layerMaskActive(layer: HandoutLayer) {
    return Boolean(maskFeatureEnabled && layer.mask?.enabled)
  }

  function isShapeLayer(layer: HandoutLayer): layer is ShapeLayer {
    return layer.type === 'shape'
  }

  function fontFamily(font: LibraryRecord) {
    return fontRecordFamily(font)
  }

  function canvasLayerRenderInfo(layer: HandoutLayer) {
    const masked = maskedImageForLayer(layer)
    const imageRecord = isImageLayer(layer) ? imageRecordForLayer(layer) : undefined
    const rawImage = isImageLayer(layer) ? imageForLayer(layer) : undefined
    const activeMask = layerMaskActive(layer)
    const branch = masked
      ? 'masked-image'
      : isImageLayer(layer) && rawImage
          ? 'raw-image'
          : isTextLayer(layer)
            ? 'raw-text'
            : isShapeLayer(layer)
              ? `raw-shape:${layer.shape}`
              : isPaintLayer(layer)
                ? 'raw-paint'
                : activeMask
                  ? 'raw-unavailable'
                  : 'none'
    return {
      id: layer.id,
      name: layer.name,
      type: layer.type,
      visible: layer.visible,
      effectiveVisible: isLayerEffectivelyVisible(editor.document, layer),
      locked: layer.locked,
      zIndex: layer.zIndex,
      position: { x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotation: layer.rotation, flipX: layer.flipX },
      assetId: isImageLayer(layer) ? layer.assetId : undefined,
      assetResolved: isImageLayer(layer) ? Boolean(imageRecord) : undefined,
      rawImageLoaded: isImageLayer(layer) ? Boolean(rawImage) : undefined,
      branch,
      mask: layer.mask
        ? {
            id: layer.mask.id,
            enabled: layer.mask.enabled,
            path: layer.mask.path,
            highResPath: layer.mask.highResPath,
            previewPath: layer.mask.previewPath,
            sourceVersion: layer.mask.sourceVersion,
            version: layer.mask.version,
            updatedAt: layer.mask.updatedAt,
            cachePath: layer.mask.cache?.preview1200Path,
            cacheSourceVersion: layer.mask.cache?.sourceVersion,
            transform: {
              x: layer.mask.x,
              y: layer.mask.y,
              width: layer.mask.width,
              height: layer.mask.height,
              scaleX: layer.mask.scaleX,
              scaleY: layer.mask.scaleY,
              rotation: layer.mask.rotation,
              flipX: layer.mask.flipX,
            },
            inMemoryDataUrlLength: editor.maskDataUrls[layer.mask.id]?.length || 0,
            previewCacheDataUrlLength: maskPreviewCacheDataUrls[layer.mask.id]?.length || 0,
            previewUrlLength: maskPreviewUrls[layer.mask.id]?.length || 0,
          }
        : null,
      maskedImage: masked
        ? { width: masked.width, height: masked.height }
        : null,
    }
  }

  function logCanvasLayerRenderState(message: string, data?: Record<string, unknown>) {
    void appendDebugLog('mask', message, {
      view: editor.view,
      maskFeatureEnabled,
      canvas: {
        width: editor.document.canvas.width,
        height: editor.document.canvas.height,
        backgroundVisible: editor.document.canvas.backgroundVisible,
        backgroundMask: editor.document.canvas.backgroundMask
          ? {
              id: editor.document.canvas.backgroundMask.id,
              enabled: editor.document.canvas.backgroundMask.enabled,
              sourceVersion: editor.document.canvas.backgroundMask.sourceVersion,
              inMemoryDataUrlLength: editor.maskDataUrls[editor.document.canvas.backgroundMask.id]?.length || 0,
            }
          : null,
      },
      visibleLayers: visibleCanvasLayers.value.map(canvasLayerRenderInfo),
      ...data,
    })
  }

  function layerPreviewStyle(layer: HandoutLayer) {
    if (isImageLayer(layer)) {
      const asset = editor.resolveAsset(layer.assetId) || editor.resolveBackground(layer.assetId)
      if (!asset) return {}
      const url = previewUrl(asset)
      return url ? { backgroundImage: `url("${url}")` } : {}
    }
    if (isTextLayer(layer)) return { backgroundColor: layer.fill }
    if (isShapeLayer(layer)) return { backgroundColor: layer.fill, borderColor: layer.stroke }
    if (isPaintLayer(layer)) return { backgroundColor: layer.brushColor }
    return {}
  }

  function layerPreviewText(layer: HandoutLayer) {
    if (isTextLayer(layer)) return (layer.text || 'T').trim().slice(0, 1) || 'T'
    if (isShapeLayer(layer)) return layer.shape === 'line' ? '-' : ''
    if (isPaintLayer(layer)) return 'P'
    return ''
  }

  function layerConfig(layer: HandoutLayer) {
    return {
      ...layerKonvaConfig(layer),
      visible: isLayerEffectivelyVisible(editor.document, layer),
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
    const selected = editor.selectedLayerIds.includes(layer.id)
    return paintKonvaConfig(layer, {
      ...layerConfig(layer),
      listening: selected,
      draggable: selected && activeTool.value === 'select' && !layer.locked,
    })
  }

  function maskedLayerConfig(layer: HandoutLayer) {
    const selectedPaint = isPaintLayer(layer) && editor.selectedLayerIds.includes(layer.id)
    return {
      ...layerConfig(layer),
      image: maskedImageForLayer(layer),
      maskRenderRevision: maskedLayerRenderRevisions[layer.id] ?? 0,
      listening: !isPaintLayer(layer) || selectedPaint,
      draggable: (!isPaintLayer(layer) || selectedPaint) && activeTool.value === 'select' && !layer.locked,
    }
  }

  return {
    layerName,
    imageForLayer,
    imageRecordForLayer,
    maskedImageForLayer,
    layerMaskActive,
    isShapeLayer,
    fontFamily,
    canvasLayerRenderInfo,
    logCanvasLayerRenderState,
    layerPreviewStyle,
    layerPreviewText,
    layerConfig,
    textConfig,
    shapeConfig,
    paintConfig,
    maskedLayerConfig,
  }
}
