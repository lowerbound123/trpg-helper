import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'

import type { EditorTool } from '@/lib/editor-tools'
import { useBrushCursor } from './useBrushCursor'

describe('useBrushCursor', () => {
  it('shows a dashed cursor ring in stage pixels using the current tool width and stage scale', () => {
    const activeTool = ref<EditorTool>('brush')
    const stageFrameRef = ref({
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        right: 310,
        bottom: 220,
        width: 300,
        height: 200,
      }),
    } as HTMLElement)
    const cursor = useBrushCursor({
      activeTool,
      stageFrameRef,
      stageScale: computed(() => 2),
      brushSize: () => 12,
    })

    cursor.updateBrushCursorFromPointer({ clientX: 40, clientY: 70 } as PointerEvent)

    expect(cursor.brushCursor).toMatchObject({
      visible: true,
      x: 30,
      y: 50,
      diameter: 24,
      mode: 'brush',
    })
  })

  it('hides the ring outside drawing tools or outside the stage frame', () => {
    const activeTool = ref<EditorTool>('select')
    const stageFrameRef = ref({
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        right: 310,
        bottom: 220,
        width: 300,
        height: 200,
      }),
    } as HTMLElement)
    const cursor = useBrushCursor({
      activeTool,
      stageFrameRef,
      stageScale: computed(() => 1),
      brushSize: () => 12,
    })

    cursor.updateBrushCursorFromPointer({ clientX: 40, clientY: 70 } as PointerEvent)
    expect(cursor.brushCursor.visible).toBe(false)

    activeTool.value = 'eraser'
    cursor.updateBrushCursorFromPointer({ clientX: 400, clientY: 70 } as PointerEvent)
    expect(cursor.brushCursor.visible).toBe(false)
  })
})
