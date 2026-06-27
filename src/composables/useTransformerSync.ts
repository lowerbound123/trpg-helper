import { nextTick } from 'vue'
import type { Reactive, Ref } from 'vue'
import type Konva from 'konva'

import { useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type NodeRef = { getNode: () => Konva.Node }
type LayerNodeRefs = Reactive<Record<string, NodeRef | undefined>>
type TransformerRef = Ref<{ getNode: () => Konva.Transformer } | undefined>
type EditorTool = 'select' | 'brush' | 'eraser'

export function normalizeTransformerRotation(rotation?: number | null) {
  if (!Number.isFinite(rotation)) return 0
  const normalized = ((Number(rotation) % 360) + 360) % 360
  return normalized === 360 || Object.is(normalized, -0) ? 0 : normalized
}

export function transformerRotationForSelection(input: {
  selectedLayerRotations: number[]
  maskRotation?: number
}) {
  if (typeof input.maskRotation === 'number') return normalizeTransformerRotation(input.maskRotation)
  if (input.selectedLayerRotations.length === 1) {
    return normalizeTransformerRotation(input.selectedLayerRotations[0])
  }
  return 0
}

export function useTransformerSync(options: {
  editor: EditorStore
  transformerRef: TransformerRef
  layerNodeRefs: LayerNodeRefs
  maskEditNodeRef: Ref<NodeRef | undefined>
  activeTool: Ref<EditorTool>
}) {
  const { editor, transformerRef, layerNodeRefs, maskEditNodeRef, activeTool } = options

  function applyTransformerRotation(transformer: Konva.Transformer, rotation: number) {
    transformer.rotation(rotation)
    transformer.forceUpdate()
    transformer.getLayer()?.batchDraw()
  }

  function activeLayerMaskRotation() {
    const target = editor.maskEditTarget
    if (!target || target.kind !== 'layer') return undefined
    return editor.document.layers.find((layer) => layer.id === target.layerId)?.mask?.rotation
  }

  async function updateTransformer() {
    await nextTick()
    const transformer = transformerRef.value?.getNode()
    if (!transformer) return
    console.log('[rotation] updateTransformer — selectedLayerIds:', editor.selectedLayerIds, 'maskEditTarget:', editor.maskEditTarget)
    if (editor.maskEditTarget && activeTool.value === 'select') {
      const maskNode = maskEditNodeRef.value?.getNode()
      transformer.nodes([])
      transformer.nodes(maskNode ? [maskNode] : [])
      applyTransformerRotation(transformer, transformerRotationForSelection({
        selectedLayerRotations: [],
        maskRotation: activeLayerMaskRotation(),
      }))
      return
    }
    const selectedNodes = editor.selectedLayerIds
      .map((layerId) => layerNodeRefs[layerId]?.getNode())
      .filter((node): node is Konva.Node => Boolean(node))

    // Log node state BEFORE detach/attach
    for (const node of selectedNodes) {
      console.log('[rotation] updateTransformer BEFORE — id:', node.id(), 'node.x:', node.x(), 'node.y:', node.y(), 'node.scaleX:', node.scaleX(), 'node.scaleY:', node.scaleY(), 'node.rotation:', node.rotation(), 'node.offsetX:', (node as any).offsetX?.())
    }

    // Detach first to force full refresh of Transformer internal state,
    // then re-attach. This ensures handle positions are recomputed when
    // node properties like scaleX change (e.g. after flipX toggle).
    transformer.nodes([])
    transformer.nodes(selectedNodes)

    // Konva decomposes scaleX=-1 nodes into an equivalent transform whose
    // absolute rotation does not match the application's layer.rotation.
    // Keep the selection box driven by model rotation so flipped layers show
    // handles at the same angle as the inspector value.
    applyTransformerRotation(transformer, transformerRotationForSelection({
      selectedLayerRotations: selectedNodes
        .map((node) => editor.document.layers.find((layer) => layer.id === node.id())?.rotation)
        .filter((rotation): rotation is number => typeof rotation === 'number'),
      maskRotation: undefined,
    }))

    // Log each attached node's state and transformer bounding box
    for (const node of selectedNodes) {
      const layer = editor.document.layers.find((l) => l.id === node.id())
      console.log('[rotation] updateTransformer AFTER — id:', node.id(), 'node.x:', node.x(), 'node.y:', node.y(), 'node.scaleX:', node.scaleX(), 'node.scaleY:', node.scaleY(), 'node.rotation:', node.rotation(), 'node.width:', node.width(), 'node.height:', node.height(), 'node.offsetX:', (node as any).offsetX?.(), 'model.flipX:', layer?.flipX, 'model.rotation:', layer?.rotation)
    }
    // Log transformer selection box
    console.log('[rotation] updateTransformer — transformer.rotation:', transformer.rotation(), 'transformer.getClientRect:', JSON.stringify(transformer.getClientRect()))
  }

  return { updateTransformer }
}
