import { computed, ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EditorTool } from '@/lib/editor-tools'
import { useEditorStore } from '@/stores/editor'

import { useSelectionBox } from './useSelectionBox'

describe('selection box tool routing', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('routes polygon pointer input while mask edit is active', () => {
    const editor = useEditorStore()
    const activeTool = ref<EditorTool>('polygon')
    const handlePolygonPointerDown = vi.fn(() => true)
    editor.addText()
    const layerId = editor.selectedLayerId!
    editor.addMaskToLayer(layerId)
    editor.editLayerMask(layerId)
    const selection = useSelectionBox({
      editor,
      activeTool,
      stageRef: ref(undefined),
      stageScale: computed(() => 1),
      canvasPointFromClient: (x, y) => ({ x, y }),
      updateTransformer: vi.fn(),
      startPaintStroke: vi.fn(),
      movePaintStroke: vi.fn(),
      stopPaintStroke: vi.fn(),
      handlePolygonPointerDown,
    })

    selection.startSelectionBox({
      target: { name: () => 'mask-edit-image' },
      evt: { button: 0, clientX: 12, clientY: 24, preventDefault: vi.fn() } as unknown as MouseEvent,
    } as any)

    expect(handlePolygonPointerDown).toHaveBeenCalledTimes(1)
  })
})
