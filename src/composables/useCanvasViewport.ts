import type { Ref } from 'vue'
import { computed, reactive, ref } from 'vue'
import type Konva from 'konva'

import type { HandoutDocument } from '@/lib/handout'

type StageRef = Ref<{ getNode: () => Konva.Stage } | undefined>
type StageFrameRef = Ref<HTMLElement | undefined>
type ViewportLog = (message: string, data?: Record<string, unknown>) => void

export function useCanvasViewport(options: {
  document: HandoutDocument | (() => HandoutDocument)
  stageRef: StageRef
  stageFrameRef: StageFrameRef
  logViewport?: ViewportLog
}) {
  const fitScale = ref(1)
  const canvasZoom = ref(1)
  const canvasPan = reactive({ x: 0, y: 0 })
  const panState = reactive({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 })
  const stageViewport = reactive({ width: 920, height: 620 })

  const stageScale = computed(() => fitScale.value * canvasZoom.value)

  const stageConfig = computed(() => ({
    width: stageViewport.width,
    height: stageViewport.height,
  }))

  const contentGroupConfig = computed(() => ({
    x: canvasPan.x,
    y: canvasPan.y,
    scaleX: stageScale.value,
    scaleY: stageScale.value,
  }))

  function currentDocument() {
    return typeof options.document === 'function' ? options.document() : options.document
  }

  function computeFitScale() {
    const document = currentDocument()
    const maxWidth = Math.max(240, stageViewport.width - 64)
    const maxHeight = Math.max(180, stageViewport.height - 64)
    return Math.min(maxWidth / document.canvas.width, maxHeight / document.canvas.height, 1)
  }

  function resizeStageViewport() {
    const element = options.stageFrameRef.value
    if (!element) return
    const rect = element.getBoundingClientRect()
    const previous = { width: stageViewport.width, height: stageViewport.height }
    stageViewport.width = Math.max(320, Math.round(rect.width))
    stageViewport.height = Math.max(240, Math.round(rect.height))
    if (previous.width !== stageViewport.width || previous.height !== stageViewport.height) {
      options.logViewport?.('resize-stage-viewport', { previous })
    }
  }

  function clampZoom(value: number) {
    return Math.min(8, Math.max(0.1, Number(value) || 1))
  }

  function fitCanvasView(reason = 'fit') {
    const document = currentDocument()
    const nextFitScale = computeFitScale()
    fitScale.value = nextFitScale
    canvasZoom.value = 1
    canvasPan.x = Math.round((stageViewport.width - document.canvas.width * nextFitScale) / 2)
    canvasPan.y = Math.round((stageViewport.height - document.canvas.height * nextFitScale) / 2)
    options.logViewport?.('fit-canvas-view', {
      reason,
      canvas: { width: document.canvas.width, height: document.canvas.height },
      viewport: { width: stageViewport.width, height: stageViewport.height },
      fitScale: nextFitScale,
      pan: { x: canvasPan.x, y: canvasPan.y },
    })
  }

  function zoomCanvas(nextZoom: number, anchor = { x: stageViewport.width / 2, y: stageViewport.height / 2 }) {
    const previousScale = stageScale.value
    const canvasPoint = {
      x: (anchor.x - canvasPan.x) / previousScale,
      y: (anchor.y - canvasPan.y) / previousScale,
    }
    canvasZoom.value = clampZoom(nextZoom)
    const nextScale = stageScale.value
    canvasPan.x = Math.round(anchor.x - canvasPoint.x * nextScale)
    canvasPan.y = Math.round(anchor.y - canvasPoint.y * nextScale)
    options.logViewport?.('zoom-canvas', { nextZoom: canvasZoom.value, anchor })
  }

  function zoomIn() {
    zoomCanvas(canvasZoom.value * 1.2)
  }

  function zoomOut() {
    zoomCanvas(canvasZoom.value / 1.2)
  }

  function stagePointFromClient(clientX: number, clientY: number) {
    const rect = options.stageRef.value?.getNode().container().getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }

  function canvasPointFromClient(clientX: number, clientY: number) {
    const point = stagePointFromClient(clientX, clientY)
    return {
      x: (point.x - canvasPan.x) / stageScale.value,
      y: (point.y - canvasPan.y) / stageScale.value,
    }
  }

  function startCanvasPan(event: PointerEvent) {
    if (event.button !== 1) return
    event.preventDefault()
    panState.active = true
    panState.startX = event.clientX
    panState.startY = event.clientY
    panState.originX = canvasPan.x
    panState.originY = canvasPan.y
  }

  function moveCanvasPan(event: PointerEvent) {
    if (!panState.active) return
    event.preventDefault()
    canvasPan.x = panState.originX + event.clientX - panState.startX
    canvasPan.y = panState.originY + event.clientY - panState.startY
  }

  function stopCanvasPan() {
    if (panState.active) options.logViewport?.('stop-canvas-pan')
    panState.active = false
  }

  function handleCanvasWheel(event: WheelEvent) {
    event.preventDefault()
    const point = stagePointFromClient(event.clientX, event.clientY)
    const factor = event.deltaY > 0 ? 1 / 1.12 : 1.12
    zoomCanvas(canvasZoom.value * factor, point)
  }

  return {
    fitScale,
    canvasZoom,
    canvasPan,
    panState,
    stageViewport,
    stageScale,
    stageConfig,
    contentGroupConfig,
    resizeStageViewport,
    fitCanvasView,
    zoomCanvas,
    zoomIn,
    zoomOut,
    stagePointFromClient,
    canvasPointFromClient,
    startCanvasPan,
    moveCanvasPan,
    stopCanvasPan,
    handleCanvasWheel,
  }
}
