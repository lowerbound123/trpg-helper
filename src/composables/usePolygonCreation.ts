import { reactive, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'

import type { EditorTool } from '@/lib/editor-tools'
import type { CanvasPoint, NewShapeLayerInput } from '@/lib/handout'
import { appendDebugLog } from '@/lib/backend'
import {
  buildPolygonLayerInput,
  isClosingPolygonPoint,
  polygonPointArray,
} from '@/lib/polygon-creation'

type KonvaEvent = { target: { name?: () => string }; evt?: MouseEvent; cancelBubble?: boolean }
type ScaleRef = Ref<number> | ComputedRef<number>

export function usePolygonCreation(options: {
  activeTool: Ref<EditorTool>
  stageScale: ScaleRef
  canvasPointFromClient: (clientX: number, clientY: number) => CanvasPoint
  addPolygonToCanvas: (input: NewShapeLayerInput) => void
  updateTransformer: () => void
}) {
  const polygonDraft = reactive<{ points: CanvasPoint[] }>({ points: [] })

  function clearPolygonDraft() {
    if (polygonDraft.points.length) {
      void appendDebugLog('mask', 'polygon-draft-clear', {
        pointCount: polygonDraft.points.length,
      })
    }
    polygonDraft.points = []
  }

  function finishPolygonDraft(optionsOverride: { selectTool?: boolean } = {}) {
    const sourcePoints = polygonDraft.points.map((point) => ({ x: point.x, y: point.y }))
    const input = buildPolygonLayerInput(polygonDraft.points)
    clearPolygonDraft()
    if (!input) {
      void appendDebugLog('mask', 'polygon-draft-discard-invalid', {
        pointCount: sourcePoints.length,
        points: sourcePoints,
      })
      return false
    }
    void appendDebugLog('mask', 'polygon-draft-finish', {
      pointCount: sourcePoints.length,
      points: sourcePoints,
      output: {
        x: input.x,
        y: input.y,
        width: input.width,
        height: input.height,
        polygonPoints: input.polygonPoints,
      },
      selectTool: optionsOverride.selectTool !== false,
    })
    options.addPolygonToCanvas(input)
    if (optionsOverride.selectTool !== false) options.activeTool.value = 'select'
    options.updateTransformer()
    return true
  }

  function handlePolygonPointerDown(event: KonvaEvent) {
    if (options.activeTool.value !== 'polygon') return false
    const sourceEvent = event.evt
    if (!sourceEvent) return false
    if (sourceEvent.button === 2) {
      sourceEvent.preventDefault()
      event.cancelBubble = true
      const removed = polygonDraft.points.pop()
      void appendDebugLog('mask', 'polygon-draft-undo', {
        removed,
        pointCount: polygonDraft.points.length,
      })
      return true
    }
    if (sourceEvent.button !== 0) return false
    sourceEvent.preventDefault()
    event.cancelBubble = true
    const point = options.canvasPointFromClient(sourceEvent.clientX, sourceEvent.clientY)
    if (isClosingPolygonPoint(polygonDraft.points, point, options.stageScale.value)) {
      void appendDebugLog('mask', 'polygon-draft-close-request', {
        point,
        pointCount: polygonDraft.points.length,
        stageScale: options.stageScale.value,
      })
      finishPolygonDraft()
      return true
    }
    polygonDraft.points.push(point)
    void appendDebugLog('mask', 'polygon-draft-add-point', {
      point,
      pointCount: polygonDraft.points.length,
      targetName: event.target.name?.(),
      stageScale: options.stageScale.value,
    })
    return true
  }

  function polygonDraftLineConfig() {
    return {
      name: 'polygon-draft-line',
      points: polygonPointArray(polygonDraft.points),
      stroke: '#0ea5e9',
      strokeWidth: 2 / options.stageScale.value,
      dash: [8 / options.stageScale.value, 6 / options.stageScale.value],
      lineCap: 'round',
      lineJoin: 'round',
      listening: true,
    }
  }

  function polygonDraftPointConfig(index: number) {
    const point = polygonDraft.points[index]
    const firstPointCanClose = index === 0 && polygonDraft.points.length >= 3
    return {
      name: 'polygon-draft-point',
      x: point.x,
      y: point.y,
      radius: (firstPointCanClose ? 7 : 5) / options.stageScale.value,
      fill: firstPointCanClose ? '#0ea5e9' : '#ffffff',
      stroke: '#0ea5e9',
      strokeWidth: 2 / options.stageScale.value,
      listening: true,
    }
  }

  watch(() => options.activeTool.value, (tool, previousTool) => {
    if (previousTool === 'polygon' && tool !== 'polygon') finishPolygonDraft({ selectTool: false })
  })

  return {
    polygonDraft,
    clearPolygonDraft,
    finishPolygonDraft,
    handlePolygonPointerDown,
    polygonDraftLineConfig,
    polygonDraftPointConfig,
  }
}
