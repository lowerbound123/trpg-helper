import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { EditorTool } from '@/lib/editor-tools'
import type { NewShapeLayerInput } from '@/lib/handout'
import { usePolygonCreation } from './usePolygonCreation'

function stageEvent(button: number, x: number, y: number) {
  return {
    target: { name: () => 'canvas-background' },
    evt: {
      button,
      clientX: x,
      clientY: y,
      preventDefault: vi.fn(),
    },
  } as any
}

function layerEvent(button: number, x: number, y: number) {
  return {
    target: { name: () => 'shape-layer-1' },
    evt: {
      button,
      clientX: x,
      clientY: y,
      preventDefault: vi.fn(),
    },
  } as any
}

describe('usePolygonCreation', () => {
  it('adds points with left click and removes the last point with right click', () => {
    const activeTool = ref<EditorTool>('polygon')
    const added: NewShapeLayerInput[] = []
    const polygon = usePolygonCreation({
      activeTool,
      stageScale: ref(1),
      canvasPointFromClient: (x, y) => ({ x, y }),
      addPolygonToCanvas: (input) => added.push(input),
      updateTransformer: vi.fn(),
    })

    polygon.handlePolygonPointerDown(stageEvent(0, 10, 20))
    polygon.handlePolygonPointerDown(stageEvent(0, 40, 50))
    polygon.handlePolygonPointerDown(stageEvent(2, 0, 0))

    expect(polygon.polygonDraft.points).toEqual([{ x: 10, y: 20 }])
    expect(added).toEqual([])
  })

  it('closes and creates a polygon when clicking back on the first point', () => {
    const activeTool = ref<EditorTool>('polygon')
    const added: NewShapeLayerInput[] = []
    const updateTransformer = vi.fn()
    const polygon = usePolygonCreation({
      activeTool,
      stageScale: ref(1),
      canvasPointFromClient: (x, y) => ({ x, y }),
      addPolygonToCanvas: (input) => added.push(input),
      updateTransformer,
    })

    polygon.handlePolygonPointerDown(stageEvent(0, 10, 20))
    polygon.handlePolygonPointerDown(stageEvent(0, 60, 25))
    polygon.handlePolygonPointerDown(stageEvent(0, 35, 80))
    polygon.handlePolygonPointerDown(stageEvent(0, 12, 22))

    expect(added).toEqual([{
      shape: 'polygon',
      x: 10,
      y: 20,
      width: 50,
      height: 60,
      polygonPoints: [
        { x: 0, y: 0 },
        { x: 50, y: 5 },
        { x: 25, y: 60 },
      ],
    }])
    expect(polygon.polygonDraft.points).toEqual([])
    expect(activeTool.value).toBe('select')
    expect(updateTransformer).toHaveBeenCalledTimes(1)
  })

  it('adds polygon points over existing layer targets while the polygon tool is active', () => {
    const activeTool = ref<EditorTool>('polygon')
    const polygon = usePolygonCreation({
      activeTool,
      stageScale: ref(1),
      canvasPointFromClient: (x, y) => ({ x, y }),
      addPolygonToCanvas: vi.fn(),
      updateTransformer: vi.fn(),
    })

    polygon.handlePolygonPointerDown(layerEvent(0, 25, 35))

    expect(polygon.polygonDraft.points).toEqual([{ x: 25, y: 35 }])
  })

  it('auto-closes a valid draft when leaving polygon mode', async () => {
    const activeTool = ref<EditorTool>('polygon')
    const added: NewShapeLayerInput[] = []
    const polygon = usePolygonCreation({
      activeTool,
      stageScale: ref(1),
      canvasPointFromClient: (x, y) => ({ x, y }),
      addPolygonToCanvas: (input) => added.push(input),
      updateTransformer: vi.fn(),
    })

    polygon.handlePolygonPointerDown(stageEvent(0, 0, 0))
    polygon.handlePolygonPointerDown(stageEvent(0, 40, 0))
    polygon.handlePolygonPointerDown(stageEvent(0, 20, 30))
    activeTool.value = 'select'
    await nextTick()

    expect(added).toHaveLength(1)
    expect(added[0].shape).toBe('polygon')
    expect(polygon.polygonDraft.points).toEqual([])
  })

  it('discards an invalid draft when leaving polygon mode', async () => {
    const activeTool = ref<EditorTool>('polygon')
    const added: NewShapeLayerInput[] = []
    const polygon = usePolygonCreation({
      activeTool,
      stageScale: ref(1),
      canvasPointFromClient: (x, y) => ({ x, y }),
      addPolygonToCanvas: (input) => added.push(input),
      updateTransformer: vi.fn(),
    })

    polygon.handlePolygonPointerDown(stageEvent(0, 0, 0))
    polygon.handlePolygonPointerDown(stageEvent(0, 40, 0))
    activeTool.value = 'select'
    await nextTick()

    expect(added).toEqual([])
    expect(polygon.polygonDraft.points).toEqual([])
  })
})
