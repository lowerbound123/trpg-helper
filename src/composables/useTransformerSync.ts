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

  return { updateTransformer }
}
