import { reactive, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'

type EditorTool = 'select' | 'brush' | 'eraser'

export type BrushCursorState = {
  visible: boolean
  x: number
  y: number
  diameter: number
  mode: 'brush' | 'eraser'
}

export function useBrushCursor(options: {
  activeTool: Ref<EditorTool>
  stageFrameRef: Ref<HTMLElement | undefined>
  stageScale: ComputedRef<number>
  brushSize: () => number
  isPanning?: ComputedRef<boolean>
}) {
  const brushCursor = reactive<BrushCursorState>({
    visible: false,
    x: 0,
    y: 0,
    diameter: 1,
    mode: 'brush',
  })

  function hideBrushCursor() {
    brushCursor.visible = false
  }

  function updateBrushCursorFromPointer(event: Pick<PointerEvent, 'clientX' | 'clientY'>) {
    if (options.activeTool.value !== 'brush' && options.activeTool.value !== 'eraser') {
      hideBrushCursor()
      return
    }
    if (options.isPanning?.value) {
      hideBrushCursor()
      return
    }
    const rect = options.stageFrameRef.value?.getBoundingClientRect()
    if (!rect) {
      hideBrushCursor()
      return
    }
    if (
      event.clientX < rect.left
      || event.clientX > rect.right
      || event.clientY < rect.top
      || event.clientY > rect.bottom
    ) {
      hideBrushCursor()
      return
    }
    brushCursor.visible = true
    brushCursor.x = event.clientX - rect.left
    brushCursor.y = event.clientY - rect.top
    brushCursor.diameter = Math.max(1, options.brushSize() * options.stageScale.value)
    brushCursor.mode = options.activeTool.value
  }

  watch(() => options.activeTool.value, (tool) => {
    if (tool !== 'brush' && tool !== 'eraser') hideBrushCursor()
  })

  watch(() => options.isPanning?.value, (panning) => {
    if (panning) hideBrushCursor()
  })

  return {
    brushCursor,
    updateBrushCursorFromPointer,
    hideBrushCursor,
  }
}
