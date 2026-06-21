import { nextTick } from 'vue'
import type { Reactive } from 'vue'
import type Konva from 'konva'

import type { LibraryRecord } from '@/lib/backend'
import { isTextLayer, useEditorStore } from '@/stores/editor'
import type { TextLayer } from '@/lib/handout'

type EditorStore = ReturnType<typeof useEditorStore>
type NodeRef = { getNode: () => Konva.Node }
type LayerNodeRefs = Reactive<Record<string, NodeRef | undefined>>
type TextLog = (message: string, data?: Record<string, unknown>) => void

export function useTextLayerAutoResize(options: {
  editor: EditorStore
  layerNodeRefs: LayerNodeRefs
  logText: TextLog
  fontFamily: (font: LibraryRecord) => string
}) {
  const { editor, layerNodeRefs, logText, fontFamily } = options

  async function logTextLayerMetrics(reason: string) {
    await nextTick()
    for (const layer of editor.document.layers.filter(isTextLayer)) {
      const node = layerNodeRefs[layer.id]?.getNode() as Konva.Text | undefined
      const font = editor.resolveFont(layer.fontId)
      logText('text-layer-render', {
        reason,
        layerId: layer.id,
        text: layer.text,
        fontId: layer.fontId,
        fontName: font?.name,
        fontPath: font?.path,
        recordFontFamily: font?.fontFamily,
        fontFamily: layer.fontFamily,
        renderFontFamily: font ? fontFamily(font) : layer.fontFamily,
        fontSize: layer.fontSize,
        fontStyle: `${layer.italic ? 'italic ' : ''}${layer.fontWeight || 400}`,
        lineHeight: layer.lineHeight,
        nodeExists: Boolean(node),
        fontCheck: globalThis.document.fonts?.check?.(`${layer.fontSize}px "${font ? fontFamily(font) : layer.fontFamily}"`),
        textWidth: node?.textWidth,
        textHeight: node?.textHeight,
        clientRect: node?.getClientRect({ skipTransform: true }),
        absoluteScale: node?.getAbsoluteScale(),
      })
    }
  }

  async function autoResizeTextLayerHeights() {
    await nextTick()
    const patches: Array<{ id: string; height: number }> = []
    for (const layer of editor.document.layers.filter(isTextLayer)) {
      const node = layerNodeRefs[layer.id]?.getNode() as Konva.Text | undefined
      if (!node) continue
      const height = autoTextLayerHeight(layer, node)
      if (Math.abs(height - layer.height) > 1) patches.push({ id: layer.id, height })
    }
    for (const patch of patches) editor.patchLayer(patch.id, { height: patch.height })
  }

  function textLineCount(node: Konva.Text) {
    const textNode = node as Konva.Text & { textArr?: unknown[] }
    if (Array.isArray(textNode.textArr) && textNode.textArr.length) return textNode.textArr.length
    const explicitLines = node.text().split('\n').length
    return Math.max(1, explicitLines)
  }

  function autoTextLayerHeight(layer: TextLayer, node: Konva.Text) {
    return Math.max(12, Math.ceil(textLineCount(node) * layer.fontSize * layer.lineHeight))
  }

  return {
    autoResizeTextLayerHeights,
    textLineCount,
    autoTextLayerHeight,
    logTextLayerMetrics,
  }
}
