import { ref } from 'vue'
import type { Ref } from 'vue'
import type Konva from 'konva'

import type { EditorTool } from '@/lib/editor-tools'
import type { HandoutLayer, PaintLayer, PaintStroke, StrokePoint } from '@/lib/handout'
import { ensureRenderablePaintStroke, strokePointsToFlat } from '@/lib/handout'
import { documentPointToMaskLocal } from '@/lib/mask-geometry'
import { isPaintLayer, useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type KonvaEvent = { target: Konva.Node; evt?: MouseEvent; cancelBubble?: boolean }

export function usePaintStrokes(options: {
  editor: EditorStore
  activeTool: Ref<EditorTool>
  maskFeatureEnabled: boolean
  canvasPointFromClient: (clientX: number, clientY: number) => { x: number; y: number }
  updateTransformer: () => void
}) {
  const { editor, activeTool, maskFeatureEnabled, canvasPointFromClient, updateTransformer } = options

  const draftStroke = ref<PaintStroke | undefined>(undefined)

  function activePaintDefaults() {
    const layer = isPaintLayer(editor.selectedLayer) ? editor.selectedLayer : undefined
    const mode = activeTool.value === 'eraser' ? 'eraser' : 'brush'
    return {
      color: layer?.brushColor ?? editor.toolSettings.brushColor,
      brushKind: layer?.brushKind ?? editor.toolSettings.brushKind,
      width: mode === 'eraser' ? layer?.eraserWidth ?? editor.toolSettings.eraserWidth : layer?.brushWidth ?? editor.toolSettings.brushWidth,
      opacity: layer?.brushOpacity ?? editor.toolSettings.brushOpacity,
      eraserOpacity: layer?.eraserOpacity ?? editor.toolSettings.eraserOpacity,
      tension: layer?.brushTension ?? editor.toolSettings.brushTension,
    }
  }

  function localizeStrokePoints(points: StrokePoint[], layer?: PaintLayer) {
    if (!layer) return points
    return points.map((point) => ({
      ...point,
      x: point.x - layer.x,
      y: point.y - layer.y,
    }))
  }

  function maskLocalPoint(mask: NonNullable<HandoutLayer['mask']>, point: StrokePoint): StrokePoint {
    const local = documentPointToMaskLocal(mask, point)
    return {
      ...point,
      x: local.x,
      y: local.y,
    }
  }

  function localizeMaskStroke(stroke: PaintStroke) {
    if (!maskFeatureEnabled) return undefined
    const target = editor.maskEditTarget
    if (!target) return undefined
    if (target.kind === 'background') {
      const mask = editor.document.canvas.backgroundMask
      return mask ? { mask, stroke } : undefined
    }
    const layer = editor.document.layers.find((item) => item.id === target.layerId)
    if (!layer?.mask) return undefined
    const rawPoints = (stroke.rawPoints ?? []).map((point) => maskLocalPoint(layer.mask!, point))
    const points = strokePointsToFlat(rawPoints)
    return {
      mask: layer.mask,
      stroke: {
        ...stroke,
        rawPoints,
        points,
      },
    }
  }

  function eventPressure(_event?: MouseEvent) {
    return 0.5
  }

  function startPaintStroke(event: KonvaEvent) {
    if (event.evt?.button !== 0) return false
    const point = canvasPointFromClient(event.evt.clientX, event.evt.clientY)
    const defaults = activePaintDefaults()
    draftStroke.value = {
      id: crypto.randomUUID(),
      points: [point.x, point.y],
      rawPoints: [{ x: point.x, y: point.y, pressure: eventPressure(event.evt) }],
      strokeWidth: defaults.width,
      color: defaults.color,
      tension: defaults.tension,
      mode: activeTool.value === 'eraser' ? 'eraser' : 'brush',
      brushKind: defaults.brushKind,
      opacity: defaults.brushKind === 'highlighter' ? Math.min(defaults.opacity, 0.38) : defaults.opacity,
      eraserOpacity: defaults.eraserOpacity,
    }
    event.cancelBubble = true
    return true
  }

  function movePaintStroke(event: KonvaEvent) {
    if (!draftStroke.value || !event.evt) return false
    const point = canvasPointFromClient(event.evt.clientX, event.evt.clientY)
    const points = draftStroke.value.points
    const lastX = points.at(-2)
    const lastY = points.at(-1)
    if (lastX !== undefined && lastY !== undefined && Math.hypot(point.x - lastX, point.y - lastY) < 0.5) return true
    const nextPoints: StrokePoint[] = []
    if (lastX !== undefined && lastY !== undefined) {
      const distance = Math.hypot(point.x - lastX, point.y - lastY)
      const spacing = Math.max(1.5, Math.min(6, draftStroke.value.strokeWidth / 3))
      const steps = Math.max(1, Math.ceil(distance / spacing))
      for (let step = 1; step <= steps; step += 1) {
        const ratio = step / steps
        nextPoints.push({
          x: lastX + (point.x - lastX) * ratio,
          y: lastY + (point.y - lastY) * ratio,
          pressure: eventPressure(event.evt),
        })
      }
    } else {
      nextPoints.push({ x: point.x, y: point.y, pressure: eventPressure(event.evt) })
    }
    draftStroke.value = {
      ...draftStroke.value,
      points: [...points, ...strokePointsToFlat(nextPoints)],
      rawPoints: [...(draftStroke.value.rawPoints ?? []), ...nextPoints],
    }
    event.cancelBubble = true
    return true
  }

  function stopPaintStroke() {
    if (!draftStroke.value) return false
    const renderableStroke = ensureRenderablePaintStroke(draftStroke.value)
    if (editor.maskEditTarget) {
      const maskStroke = localizeMaskStroke(renderableStroke)
      draftStroke.value = undefined
      if (maskStroke) void editor.paintMask(maskStroke.mask, maskStroke.stroke)
      return true
    }
    const selectedPaint = isPaintLayer(editor.selectedLayer) ? editor.selectedLayer : undefined
    const stroke = {
      ...renderableStroke,
      rawPoints: localizeStrokePoints(renderableStroke.rawPoints ?? [], selectedPaint),
    }
    stroke.points = strokePointsToFlat(stroke.rawPoints)
    editor.appendStrokeToPaintLayer(stroke)
    draftStroke.value = undefined
    void updateTransformer()
    return true
  }

  return {
    draftStroke,
    activePaintDefaults,
    startPaintStroke,
    movePaintStroke,
    stopPaintStroke,
  }
}
