import { reactive } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type Konva from 'konva'

import { containsRect } from '@/lib/selection'
import type { HandoutLayer } from '@/lib/handout'
import { isLayerEffectivelyVisible } from '@/lib/handout'
import { useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type EditorTool = 'select' | 'brush' | 'eraser'
type KonvaEvent = { target: Konva.Node; evt?: MouseEvent; cancelBubble?: boolean }
type SelectionBox = { visible: boolean; startX: number; startY: number; x: number; y: number; width: number; height: number }
type StageRef = Ref<{ getNode: () => Konva.Stage } | undefined>

export function useSelectionBox(options: {
  editor: EditorStore
  activeTool: Ref<EditorTool>
  stageRef: StageRef
  stageScale: ComputedRef<number>
  canvasPointFromClient: (clientX: number, clientY: number) => { x: number; y: number }
  updateTransformer: () => void
  startPaintStroke: (event: KonvaEvent) => boolean
  movePaintStroke: (event: KonvaEvent) => boolean
  stopPaintStroke: () => boolean
}) {
  const { editor, activeTool, stageRef, stageScale, canvasPointFromClient, updateTransformer, startPaintStroke, movePaintStroke, stopPaintStroke } = options

  const selectionBox = reactive<SelectionBox>({ visible: false, startX: 0, startY: 0, x: 0, y: 0, width: 0, height: 0 })
  let suppressNextStageClick = false

  function handleStagePointer(event: KonvaEvent) {
    if (editor.maskEditTarget) return
    if (activeTool.value !== 'select') return
    if (suppressNextStageClick) {
      suppressNextStageClick = false
      return
    }
    const stage = stageRef.value?.getNode()
    if (selectionBox.visible) return
    if (stage && (event.target === stage || event.target.name() === 'canvas-background')) {
      editor.selectLayer(undefined)
      void updateTransformer()
    }
  }

  function updateSelectionBox(from: { x: number; y: number }, to: { x: number; y: number }) {
    selectionBox.x = Math.min(from.x, to.x)
    selectionBox.y = Math.min(from.y, to.y)
    selectionBox.width = Math.abs(to.x - from.x)
    selectionBox.height = Math.abs(to.y - from.y)
  }

  function startSelectionBox(event: KonvaEvent) {
    if (activeTool.value === 'brush' || activeTool.value === 'eraser') {
      startPaintStroke(event)
      return
    }
    if (activeTool.value !== 'select') return
    if (event.evt?.button !== 0 || event.target.name() !== 'canvas-background') return
    const point = canvasPointFromClient(event.evt.clientX, event.evt.clientY)
    selectionBox.visible = true
    selectionBox.startX = point.x
    selectionBox.startY = point.y
    updateSelectionBox(point, point)
  }

  function moveSelectionBox(event: KonvaEvent) {
    if (activeTool.value === 'brush' || activeTool.value === 'eraser') {
      movePaintStroke(event)
      return
    }
    if (!selectionBox.visible || !event.evt) return
    const point = canvasPointFromClient(event.evt.clientX, event.evt.clientY)
    updateSelectionBox({ x: selectionBox.startX, y: selectionBox.startY }, point)
  }

  function containsSelection(layer: HandoutLayer) {
    return containsRect(selectionBox, layer)
  }

  function stopSelectionBox() {
    if (activeTool.value === 'brush' || activeTool.value === 'eraser') {
      stopPaintStroke()
      return
    }
    if (!selectionBox.visible) return
    const hasArea = selectionBox.width > 3 / stageScale.value || selectionBox.height > 3 / stageScale.value
    if (hasArea) {
      editor.setLayerSelection(
        editor.document.layers
          .filter((layer) => isLayerEffectivelyVisible(editor.document, layer) && containsSelection(layer))
          .map((layer) => layer.id),
      )
      void updateTransformer()
      suppressNextStageClick = true
    }
    selectionBox.visible = false
    selectionBox.width = 0
    selectionBox.height = 0
  }

  return {
    selectionBox,
    handleStagePointer,
    startSelectionBox,
    moveSelectionBox,
    containsSelection,
    stopSelectionBox,
  }
}
