import type { ComputedRef, Ref } from 'vue'
import { confirm } from '@tauri-apps/plugin-dialog'
import type Konva from 'konva'

import { appendDebugLog } from '@/lib/backend'
import type { EditorTool } from '@/lib/editor-tools'
import type { HandoutLayer } from '@/lib/handout'
import { matrixDecompose, matrixFromComponents } from '@/lib/mask-geometry'
import { useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type NodeRef = { getNode: () => Konva.Node }
type KonvaEvent = { target: Konva.Node; evt?: MouseEvent; cancelBubble?: boolean }
type MaskPreviewUrlMap = Record<string, string | undefined>

function normalizeRotationDegrees(rotation: number) {
  const normalized = ((rotation % 360) + 360) % 360
  return Object.is(normalized, -0) ? 0 : normalized
}

export function useMaskActions(options: {
  editor: EditorStore
  maskFeatureEnabled: boolean
  selectedMaskControlLayers: ComputedRef<HandoutLayer[]>
  selectedMaskControlDeletes: ComputedRef<boolean>
  refreshMaskPreviewUrls: () => void
  maskPreviewUrls: MaskPreviewUrlMap
  maskPreviewCacheDataUrls: MaskPreviewUrlMap
  layerName: (layer: HandoutLayer) => string
  maskEditNodeRef: Ref<NodeRef | undefined>
  activeTool: Ref<EditorTool>
  maskEditImage: Ref<CanvasImageSource | undefined>
  maskEditImageRevision: Ref<number>
  maskProxyMaxEdge: () => number
  updateTransformer: () => void
  draggedMaskLayerId: Ref<string>
  isDraggingMask: Ref<boolean>
}) {
  const {
    editor, maskFeatureEnabled, selectedMaskControlLayers, selectedMaskControlDeletes,
    refreshMaskPreviewUrls, maskPreviewUrls, maskPreviewCacheDataUrls,
    layerName, maskEditNodeRef, activeTool, maskEditImage, maskEditImageRevision, maskProxyMaxEdge,
    updateTransformer,
    draggedMaskLayerId, isDraggingMask,
  } = options

  function maskPreviewClass(layer: HandoutLayer) {
    if (!maskFeatureEnabled) return { enabled: false, disabled: false, editing: false, empty: true }
    return {
      enabled: Boolean(layer.mask?.enabled),
      disabled: Boolean(layer.mask && !layer.mask.enabled),
      editing: editor.maskEditTarget?.kind === 'layer' && editor.maskEditTarget.layerId === layer.id,
      empty: !layer.mask,
    }
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
      title: 'Delete layer mask', kind: 'warning', okLabel: 'Delete', cancelLabel: 'Cancel',
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
    editor.patchLayerMask(layer.id, {
      enabled: !layer.mask.enabled,
      updatedAt: new Date().toISOString(),
    })
  }

  function startMaskDrag(layer: HandoutLayer, event: DragEvent) {
    if (!maskFeatureEnabled || !layer.mask || !event.dataTransfer) return
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
        title: 'Replace layer mask', kind: 'warning',
        okLabel: copy ? 'Copy and replace' : 'Move and replace', cancelLabel: 'Cancel',
      })
      if (!confirmed) return
    }
    await editor.moveOrCopyLayerMask(sourceLayerId, targetLayer.id, copy)
    draggedMaskLayerId.value = ''
    void refreshMaskPreviewUrls()
  }

  function setMaskEditNodeRef(node: unknown) {
    maskEditNodeRef.value = node as NodeRef | undefined
  }

  function maskEditConfig(layer: HandoutLayer) {
    if (!maskFeatureEnabled) return {}
    const mask = layer.mask
    const canDragMask = activeTool.value === 'select'
    const transform = mask ? matrixDecompose(mask.matrix) : undefined
    return {
      image: maskEditImage.value,
      maskRenderRevision: maskEditImageRevision.value,
      x: transform?.x,
      y: transform?.y,
      width: mask?.width,
      height: mask?.height,
      scaleX: transform?.scaleX,
      scaleY: transform?.scaleY,
      rotation: transform?.rotation,
      opacity: isDraggingMask.value ? 0.58 : 0.26,
      draggable: canDragMask,
      listening: canDragMask,
    }
  }

  function onMaskEditDragStart(layer: HandoutLayer) {
    if (!maskFeatureEnabled || !layer.mask) return
    isDraggingMask.value = true
    void appendDebugLog('mask', 'mask-edit-drag-start', {
      layerId: layer.id, maskId: layer.mask.id, previewMaxEdge: maskProxyMaxEdge(),
    })
  }

  function onMaskEditDragEnd(layer: HandoutLayer, event: KonvaEvent) {
    if (!maskFeatureEnabled || !layer.mask) return
    const node = event.target
    const x = node.x()
    const y = node.y()
    const transform = matrixDecompose(layer.mask.matrix)
    isDraggingMask.value = false
    editor.patchLayerMask(layer.id, {
      matrix: matrixFromComponents({
        x,
        y,
        rotation: transform.rotation,
        scaleX: transform.scaleX,
        scaleY: transform.scaleY,
      }),
      x,
      y,
    })
    void appendDebugLog('mask', 'mask-edit-drag-end', {
      layerId: layer.id, maskId: layer.mask.id, x, y,
    })
  }

  function onMaskEditTransformEnd(layer: HandoutLayer, event: KonvaEvent) {
    if (!maskFeatureEnabled || !layer.mask) return
    const node = event.target
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    const rotation = normalizeRotationDegrees(node.rotation())
    isDraggingMask.value = false
    editor.patchLayerMask(layer.id, {
      matrix: matrixFromComponents({
        x: node.x(),
        y: node.y(),
        rotation,
        scaleX,
        scaleY,
      }),
      x: node.x(),
      y: node.y(),
      scaleX: Math.abs(scaleX),
      scaleY: Math.abs(scaleY),
      rotation,
      flipX: scaleX < 0,
    })
    void updateTransformer()
  }

  return {
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
  }
}
