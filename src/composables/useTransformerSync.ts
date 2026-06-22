import { nextTick } from 'vue'
import type { Reactive, Ref } from 'vue'
import type Konva from 'konva'

import { useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type NodeRef = { getNode: () => Konva.Node }
type LayerNodeRefs = Reactive<Record<string, NodeRef | undefined>>
type TransformerRef = Ref<{ getNode: () => Konva.Transformer } | undefined>
type EditorTool = 'select' | 'brush' | 'eraser'

export function useTransformerSync(options: {
  editor: EditorStore
  transformerRef: TransformerRef
  layerNodeRefs: LayerNodeRefs
  maskEditNodeRef: Ref<NodeRef | undefined>
  activeTool: Ref<EditorTool>
}) {
  const { editor, transformerRef, layerNodeRefs, maskEditNodeRef, activeTool } = options

  async function updateTransformer() {
    await nextTick()
    const transformer = transformerRef.value?.getNode()
    if (!transformer) return
    console.log('[rotation] updateTransformer — selectedLayerIds:', editor.selectedLayerIds, 'maskEditTarget:', editor.maskEditTarget)
    if (editor.maskEditTarget && activeTool.value === 'select') {
      const maskNode = maskEditNodeRef.value?.getNode()
      transformer.nodes([])
      transformer.nodes(maskNode ? [maskNode] : [])
      transformer.getLayer()?.batchDraw()
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
    transformer.getLayer()?.batchDraw()

    // NOTE: Do NOT call transformer.rotation(val) — it is a setter that
    // ROTATES all attached nodes, which would corrupt their rotation values.
    // The transformer.rotation() getter returns the computed bounding-box
    // rotation, which differs from node.rotation for scaleX=-1 nodes.
    // This is a Konva limitation — the handle appears mirrored due to flip.

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
