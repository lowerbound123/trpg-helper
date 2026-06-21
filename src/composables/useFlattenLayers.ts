import { ref, nextTick } from 'vue'
import { confirm } from '@tauri-apps/plugin-dialog'

import { saveProjectAsset, type LibraryRecord, type LibraryIndex } from '@/lib/backend'
import { serializableLogData } from '@/lib/debug-log'
import type { FlattenedLayerBounds, HandoutDocument, HandoutLayer } from '@/lib/handout'
import { dataUrlByteSize, renderHandoutToDataUrl } from '@/lib/render'
import { isImageLayer, useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type ImageCache = Record<string, HTMLImageElement>
type DebugLog = (message: string, data?: Record<string, unknown>) => void
type ShapeLayerGuard = (layer: HandoutLayer) => layer is import('@/lib/handout').ShapeLayer

export function useFlattenLayers(options: {
  editor: EditorStore
  imageElements: ImageCache
  imageSize: (record: LibraryRecord) => Promise<{ width: number; height: number }>
  loadImage: (record: LibraryRecord) => Promise<HTMLImageElement>
  syncImages: (library: LibraryIndex) => unknown
  updateTransformer: () => void
  isShapeLayer: ShapeLayerGuard
  maskFeatureEnabled: boolean
  editorMaskPreviewMaxEdge: number
  logFlat: DebugLog
}) {
  const { editor, imageElements, imageSize: _imageSize, loadImage, syncImages, updateTransformer, isShapeLayer, maskFeatureEnabled, editorMaskPreviewMaxEdge: _max, logFlat } = options

  const isFlatteningLayers = ref(false)

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
        id: layer.id, type: layer.type, name: layer.name,
        x: layer.x, y: layer.y, width: layer.width, height: layer.height, zIndex: layer.zIndex,
      })),
    })
    if (isFlatteningLayers.value || !layerIds.length) return
    const bounds = selectedLayerBounds()
    logFlat('flat-bounds', { bounds })
    if (!bounds) return
    const confirmed = await confirm('Flatten selected layers into one image layer? This cannot be undone.', {
      title: 'Confirm flatten', kind: 'warning', okLabel: 'Flat', cancelLabel: 'Cancel',
    })
    logFlat('flat-confirmed', { confirmed })
    if (!confirmed) return
    isFlatteningLayers.value = true
    try {
      const flatDocument = flattenDocumentForSelectedLayers(bounds, layerIds)
      logFlat('flat-render-start', {
        canvas: flatDocument.canvas,
        layers: flatDocument.layers.map((layer) => ({
          id: layer.id, type: layer.type, name: layer.name,
          x: layer.x, y: layer.y, width: layer.width, height: layer.height, zIndex: layer.zIndex,
        })),
      })
      const dataUrl = await renderHandoutToDataUrl(flatDocument, editor.library, 1, imageElements, 'image/png', undefined, {
        projectTarget: { projectId: editor.currentProjectId, projectDir: editor.projectDir || undefined },
        masksEnabled: maskFeatureEnabled,
        maskDataUrls: editor.maskDataUrls,
      })
      logFlat('flat-render-complete', { dataUrlBytes: dataUrlByteSize(dataUrl), dataUrlPrefix: dataUrl.slice(0, 32) })
      const assetId = crypto.randomUUID()
      const fileName = `${editor.document.title.replace(/[^a-zA-Z0-9._-]+/g, '-') || 'handout'}-flat.png`
      const path = await saveProjectAsset({ projectId: editor.currentProjectId, projectDir: editor.projectDir || undefined }, assetId, fileName, dataUrl)
      const now = new Date().toISOString()
      const asset: LibraryRecord = {
        id: assetId, name: fileName, fileName, path, thumbnailPath: null, tags: ['flat'], folder: '', mediaType: 'image/png', createdAt: now, updatedAt: now,
      }
      editor.registerProjectAsset(asset)
      logFlat('flat-project-asset-saved', { assetId: asset.id, name: asset.name, path: asset.path, mediaType: asset.mediaType })
      await loadImage(asset)
      editor.setLayerSelection(layerIds)
      editor.flattenSelectedLayersToImage(asset, bounds)
      logFlat('flat-document-replaced', {
        assetId: asset.id, selectedLayerIds: [...editor.selectedLayerIds],
        layers: editor.document.layers.map((layer) => ({
          id: layer.id, type: layer.type, name: layer.name,
          assetId: isImageLayer(layer) ? layer.assetId : undefined,
          x: layer.x, y: layer.y, width: layer.width, height: layer.height, zIndex: layer.zIndex,
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

  return {
    isFlatteningLayers,
    layerOuterBounds,
    selectedLayerBounds,
    flattenSelectedLayers,
  }
}
