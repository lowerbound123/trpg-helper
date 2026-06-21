import { ref } from 'vue'
import type { ComputedRef, Reactive } from 'vue'
import type Konva from 'konva'

import type { CanvasPoint, CurvePoints, ShapeLayer } from '@/lib/handout'
import { useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type NodeRef = { getNode: () => Konva.Node }
type LayerNodeRefs = Reactive<Record<string, NodeRef | undefined>>
type CurvePointKey = 'start' | 'control' | 'control1' | 'control2' | 'end'
type KonvaEvent = { target: Konva.Node; evt?: MouseEvent; cancelBubble?: boolean }

export function useCurveEditing(options: {
  editor: EditorStore
  layerNodeRefs: LayerNodeRefs
  stageScale: ComputedRef<number>
}) {
  const { editor, layerNodeRefs, stageScale } = options

  const curveControlRevision = ref(0)

  function curvePointKeys(layer: ShapeLayer): CurvePointKey[] {
    if (layer.shape === 'quadratic-curve') return ['start', 'control', 'end']
    if (layer.shape === 'cubic-bezier') return ['start', 'control1', 'control2', 'end']
    return []
  }

  function curvePoint(layer: ShapeLayer, key: CurvePointKey) {
    return layer.curvePoints?.[key]
  }

  function curveNode(layer: ShapeLayer) {
    return layerNodeRefs[layer.id]?.getNode()
  }

  function transformedCurvePoint(layer: ShapeLayer, point?: CanvasPoint) {
    void curveControlRevision.value
    if (!point) return { x: layer.x, y: layer.y }
    const node = curveNode(layer)
    if (!node) return { x: layer.x + point.x, y: layer.y + point.y }
    return node.getTransform().point(point)
  }

  function curveHandleConfig(layer: ShapeLayer, key: CurvePointKey) {
    const point = transformedCurvePoint(layer, curvePoint(layer, key))
    return {
      x: point.x,
      y: point.y,
      radius: 5 / stageScale.value,
      fill: key === 'start' || key === 'end' ? '#14b8a6' : '#f59e0b',
      stroke: '#ffffff',
      strokeWidth: 1.5 / stageScale.value,
      draggable: true,
    }
  }

  function curveGuideConfig(layer: ShapeLayer) {
    const points = layer.curvePoints
    if (!points) return []
    if (layer.shape === 'quadratic-curve' && points.control) {
      return [
        [points.start, points.control],
        [points.control, points.end],
      ]
    }
    if (layer.shape === 'cubic-bezier' && points.control1 && points.control2) {
      return [
        [points.start, points.control1],
        [points.control2, points.end],
      ]
    }
    return []
  }

  function curveGuideLineConfig(layer: ShapeLayer, guide: CanvasPoint[]) {
    return {
      points: guide.flatMap((point) => {
        const transformed = transformedCurvePoint(layer, point)
        return [transformed.x, transformed.y]
      }),
      stroke: '#94a3b8',
      strokeWidth: 1 / stageScale.value,
      dash: [4 / stageScale.value, 4 / stageScale.value],
      listening: false,
    }
  }

  function normalizeCurveLayerPatch(layer: ShapeLayer, curvePoints: CurvePoints, node?: Konva.Node) {
    const points = curvePointKeys(layer)
      .map((key) => curvePoints[key])
      .filter((point): point is CanvasPoint => Boolean(point))
    const padding = Math.max(0, layer.strokeWidth / 2)
    const minX = Math.floor(Math.min(...points.map((point) => point.x)) - padding)
    const minY = Math.floor(Math.min(...points.map((point) => point.y)) - padding)
    const maxX = Math.ceil(Math.max(...points.map((point) => point.x)) + padding)
    const maxY = Math.ceil(Math.max(...points.map((point) => point.y)) + padding)
    if (minX === 0 && minY === 0 && maxX === layer.width && maxY === layer.height) return { curvePoints }
    if (layer.rotation && layer.flipX) return { curvePoints }
    const normalized: CurvePoints = {
      start: { x: curvePoints.start.x - minX, y: curvePoints.start.y - minY },
      control: curvePoints.control ? { x: curvePoints.control.x - minX, y: curvePoints.control.y - minY } : undefined,
      control1: curvePoints.control1 ? { x: curvePoints.control1.x - minX, y: curvePoints.control1.y - minY } : undefined,
      control2: curvePoints.control2 ? { x: curvePoints.control2.x - minX, y: curvePoints.control2.y - minY } : undefined,
      end: { x: curvePoints.end.x - minX, y: curvePoints.end.y - minY },
    }
    const origin = layer.rotation && node
      ? node.getTransform().point({ x: minX, y: minY })
      : {
          x: layer.flipX ? layer.x + layer.width - maxX : layer.x + minX,
          y: layer.y + minY,
        }
    return {
      x: Math.round(origin.x),
      y: Math.round(origin.y),
      width: Math.max(12, Math.ceil(maxX - minX)),
      height: Math.max(12, Math.ceil(maxY - minY)),
      curvePoints: normalized,
    }
  }

  function moveCurvePoint(layer: ShapeLayer, key: CurvePointKey, event: KonvaEvent) {
    const node = event.target
    const curveTransform = curveNode(layer)?.getTransform().copy().invert()
    const local = curveTransform?.point({ x: node.x(), y: node.y() }) ?? { x: node.x() - layer.x, y: node.y() - layer.y }
    const point = { x: Math.round(local.x), y: Math.round(local.y) }
    const curvePoints: CurvePoints = {
      ...(layer.curvePoints ?? {
        start: { x: 0, y: 0 },
        end: { x: layer.width, y: layer.height },
      }),
      [key]: point,
    }
    editor.patchLayerContinuous(layer.id, `curve-point-${layer.id}-${key}`, normalizeCurveLayerPatch(layer, curvePoints, curveNode(layer)))
    curveControlRevision.value += 1
  }

  function endCurvePointMove(layer: ShapeLayer, key: CurvePointKey) {
    editor.endContinuousEdit(`curve-point-${layer.id}-${key}`)
  }

  return {
    curveControlRevision,
    curvePointKeys,
    curvePoint,
    curveNode,
    transformedCurvePoint,
    curveHandleConfig,
    curveGuideConfig,
    curveGuideLineConfig,
    normalizeCurveLayerPatch,
    moveCurvePoint,
    endCurvePointMove,
  }
}
