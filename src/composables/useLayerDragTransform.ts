import { reactive, ref } from 'vue'
import type { ComputedRef, Reactive, Ref } from 'vue'
import type Konva from 'konva'

import type { HandoutLayer, ShapeLayer } from '@/lib/handout'
import { isCurveShape } from '@/lib/handout'
import { layerPositionFromNode } from '@/lib/layer-rendering'
import { calculateSnapGuides, SNAP_THRESHOLD_SCREEN_PX, type GuideLine, type SnapLayer } from '@/lib/snapping'
import { isTextLayer, useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type NodeRef = { getNode: () => Konva.Node }
type LayerNodeRefs = Reactive<Record<string, NodeRef | undefined>>
type KonvaEvent = { target: Konva.Node; evt?: MouseEvent; cancelBubble?: boolean }
type DebugLog = (message: string, data?: Record<string, unknown>) => void

export function useLayerDragTransform(options: {
  editor: EditorStore
  layerNodeRefs: LayerNodeRefs
  stageScale: ComputedRef<number>
  isShapeLayer: (layer: HandoutLayer) => layer is ShapeLayer
  selectCanvasLayer: (layerId: string, event?: KonvaEvent) => void
  autoTextLayerHeight: (layer: import('@/lib/handout').TextLayer, node: Konva.Text) => number
  refreshLayerEffectCacheAfterUpdate: (layerId: string) => Promise<void>
  logBackgroundRender: DebugLog
  logShape: DebugLog
  logSnap: DebugLog
  curveControlRevision: Ref<number>
}) {
  const {
    editor,
    layerNodeRefs,
    stageScale,
  isShapeLayer,
  selectCanvasLayer,
  autoTextLayerHeight,
    refreshLayerEffectCacheAfterUpdate,
    logBackgroundRender,
    logShape,
    logSnap,
    curveControlRevision,
  } = options

  const guideLines = ref<GuideLine[]>([])
  const multiDragState = reactive({
    active: false,
    layerId: '',
    originX: 0,
    originY: 0,
    positions: {} as Record<string, { x: number; y: number }>,
  })
  let lastSnapLogSignature = ''
  let lastEllipseDragLogSignature = ''

  function onLayerDragStart(layer: HandoutLayer, event: KonvaEvent) {
    if (event.evt?.metaKey || event.evt?.shiftKey || !editor.selectedLayerIds.includes(layer.id)) {
      selectCanvasLayer(layer.id, event)
    } else {
      event.cancelBubble = true
    }
    if (!editor.selectedLayerIds.includes(layer.id) || editor.selectedLayerIds.length < 2) {
      multiDragState.active = false
      return
    }
    const position = layerPositionFromNode(layer, event.target)
    multiDragState.active = true
    multiDragState.layerId = layer.id
    multiDragState.originX = position.x
    multiDragState.originY = position.y
    multiDragState.positions = Object.fromEntries(
      editor.selectedLayers.map((item) => [item.id, { x: item.x, y: item.y }]),
    )
  }

  function onTransformEnd(layer: HandoutLayer) {
    const node = layerNodeRefs[layer.id]?.getNode()
    if (!node) return
    const scaleX = Math.abs(node.scaleX())
    const scaleY = Math.abs(node.scaleY())
    const width = isShapeLayer(layer) && layer.shape === 'line'
      ? Math.max(12, Math.round(layer.width * scaleX))
      : Math.max(12, Math.round(node.width() * scaleX))
    let height = isShapeLayer(layer) && layer.shape === 'line'
      ? Math.max(12, Math.round(layer.height * scaleY))
      : Math.max(12, Math.round(node.height() * scaleY))
    if (isTextLayer(layer)) {
      node.width(width)
      node.scaleX(1)
      node.scaleY(1)
      height = autoTextLayerHeight(layer, node as Konva.Text)
    }
    const position = isShapeLayer(layer) && layer.shape === 'ellipse'
      ? {
          x: Math.round(node.x() - width / 2),
          y: Math.round(node.y() - height / 2),
        }
      : layerPositionFromNode(layer, node)
    node.clearCache()
    node.scaleX(layer.flipX ? -1 : 1)
    node.scaleY(1)
    node.width(width)
    node.height(height)
    const nodeRotation = node.rotation()
    const rotation = layer.flipX
      ? (() => {
          // In mirrored coords (scaleX=-1), the Transformer negates the
          // rotation delta. Clamp delta to [-180,180] so Konva angle
          // normalization (atan2 wrapping) never corrupts the value.
          const raw = layer.rotation - nodeRotation
          const delta = ((raw + 180) % 360 + 360) % 360 - 180
          return Math.round(layer.rotation + delta)
        })()
      : Math.round(nodeRotation)
    editor.patchLayer(layer.id, {
      x: position.x,
      y: position.y,
      width,
      height,
      rotation,
    })
    logBackgroundRender('after-layer-transform', {
      layerId: layer.id,
      layerType: layer.type,
      layerBounds: { x: Math.round(position.x), y: Math.round(position.y), width, height },
    })
    void refreshLayerEffectCacheAfterUpdate(layer.id)
  }

  function onTransform(layer: HandoutLayer, event: KonvaEvent) {
    if (isShapeLayer(layer) && isCurveShape(layer.shape)) curveControlRevision.value += 1
    if (!event.evt?.shiftKey) return
    const node = layerNodeRefs[layer.id]?.getNode()
    if (!node) return
    const snapped = Math.round(node.rotation() / 45) * 45
    if (Math.abs(snapped - node.rotation()) <= 22.5) node.rotation(snapped)
  }

  function onDragEnd(layer: HandoutLayer) {
    guideLines.value = []
    lastSnapLogSignature = ''
    const node = layerNodeRefs[layer.id]?.getNode()
    if (!node) return
    logEllipseDrag('ellipse-drag-end-before-patch', layer, node, {
      patch: layerPositionFromNode(layer, node),
    })
    node.clearCache()
    if (multiDragState.active) {
      const patches = editor.selectedLayers
        .map((item) => {
          const selectedNode = layerNodeRefs[item.id]?.getNode()
          if (!selectedNode) return undefined
          return { id: item.id, patch: layerPositionFromNode(item, selectedNode) }
        })
        .filter((item): item is { id: string; patch: { x: number; y: number } } => Boolean(item))
      for (const item of patches) editor.patchLayer(item.id, item.patch)
      multiDragState.active = false
      multiDragState.positions = {}
    } else {
      editor.patchLayer(layer.id, layerPositionFromNode(layer, node))
    }
    logBackgroundRender('after-layer-drag', {
      layerId: layer.id,
      layerType: layer.type,
      layerPosition: layerPositionFromNode(layer, node),
    })
    if (isShapeLayer(layer) && layer.shape === 'ellipse') {
      lastEllipseDragLogSignature = ''
    }
    void refreshLayerEffectCacheAfterUpdate(layer.id)
  }

  function snapLayerFromDocumentLayer(layer: HandoutLayer): SnapLayer {
    return {
      id: layer.id,
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      visible: layer.visible,
      locked: layer.locked,
    }
  }

  function snapLayerFromNode(layer: HandoutLayer, node: Konva.Node): SnapLayer {
    const position = layerPositionFromNode(layer, node)
    return {
      ...snapLayerFromDocumentLayer(layer),
      x: position.x,
      y: position.y,
      width: layer.width,
      height: layer.height,
    }
  }

  function applySnappedNodePosition(layer: HandoutLayer, node: Konva.Node, axis: 'x' | 'y', value: number) {
    if (isShapeLayer(layer) && layer.shape === 'ellipse') {
      if (axis === 'x') node.x(value + layer.width / 2)
      else node.y(value + layer.height / 2)
      return
    }
    if (axis === 'x') node.x(layer.flipX ? value + layer.width / 2 : value)
    else node.y(value)
  }

  function ellipseDragSnapshot(layer: ShapeLayer, node: Konva.Node) {
    const position = layerPositionFromNode(layer, node)
    return {
      model: {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotation: layer.rotation,
      },
      node: {
        x: Math.round(node.x() * 100) / 100,
        y: Math.round(node.y() * 100) / 100,
        width: Math.round(node.width() * 100) / 100,
        height: Math.round(node.height() * 100) / 100,
        scaleX: Math.round(node.scaleX() * 100) / 100,
        scaleY: Math.round(node.scaleY() * 100) / 100,
        rotation: Math.round(node.rotation() * 100) / 100,
      },
      derivedPosition: position,
      stageScale: Math.round(stageScale.value * 1000) / 1000,
    }
  }

  function logEllipseDrag(message: string, layer: HandoutLayer, node: Konva.Node, extra?: Record<string, unknown>) {
    if (!isShapeLayer(layer) || layer.shape !== 'ellipse') return
    const snapshot = ellipseDragSnapshot(layer, node)
    const signature = JSON.stringify({
      message,
      x: snapshot.derivedPosition.x,
      y: snapshot.derivedPosition.y,
      nodeX: snapshot.node.x,
      nodeY: snapshot.node.y,
      extra,
    })
    if (signature === lastEllipseDragLogSignature) return
    lastEllipseDragLogSignature = signature
    logShape(message, {
      layerId: layer.id,
      ...snapshot,
      ...extra,
    })
  }

  function onDragMove(layer: HandoutLayer, event: KonvaEvent) {
    const node = layerNodeRefs[layer.id]?.getNode()
    if (!node || event.evt?.ctrlKey) {
      guideLines.value = []
      lastSnapLogSignature = ''
      return
    }

    if (multiDragState.active && multiDragState.layerId === layer.id) {
      const position = layerPositionFromNode(layer, node)
      const dx = position.x - multiDragState.originX
      const dy = position.y - multiDragState.originY
      for (const id of editor.selectedLayerIds) {
        if (id === layer.id) continue
        const selectedLayer = editor.document.layers.find((item) => item.id === id)
        const selectedNode = layerNodeRefs[id]?.getNode()
        const origin = multiDragState.positions[id]
        if (!selectedLayer || !selectedNode || !origin) continue
        selectedNode.x(selectedLayer.flipX ? origin.x + dx + selectedLayer.width / 2 : origin.x + dx)
        selectedNode.y(origin.y + dy)
      }
      guideLines.value = []
      return
    }

    if (isShapeLayer(layer) && isCurveShape(layer.shape)) curveControlRevision.value += 1
    logEllipseDrag('ellipse-drag-move-before-snap', layer, node)
    const snap = calculateSnapGuides({
      movingLayer: snapLayerFromNode(layer, node),
      layers: editor.document.layers.map(snapLayerFromDocumentLayer),
      canvas: {
        width: editor.document.canvas.width,
        height: editor.document.canvas.height,
      },
      stageScale: stageScale.value,
    })
    if (snap.x) applySnappedNodePosition(layer, node, 'x', snap.nextPosition.x)
    if (snap.y) applySnappedNodePosition(layer, node, 'y', snap.nextPosition.y)
    if (snap.x || snap.y) {
      logEllipseDrag('ellipse-drag-move-after-snap', layer, node, {
        snap: {
          x: snap.x,
          y: snap.y,
          nextPosition: snap.nextPosition,
        },
      })
    }
    if (snap.lines.length > 0) {
      const signature = `${layer.id}:${snap.lines.map((line) => `${line.orientation}:${line.value}`).join('|')}`
      if (signature !== lastSnapLogSignature) {
        lastSnapLogSignature = signature
        logSnap('drag-snap', {
          layerId: layer.id,
          stageScale: stageScale.value,
          screenThresholdPx: SNAP_THRESHOLD_SCREEN_PX,
          canvasThresholdPx: snap.thresholdCanvas,
          x: snap.x,
          y: snap.y,
        })
      }
    } else {
      lastSnapLogSignature = ''
    }
    guideLines.value = snap.lines
  }

  return {
    guideLines,
    multiDragState,
    onLayerDragStart,
    onTransformEnd,
    onTransform,
    onDragEnd,
    onDragMove,
    snapLayerFromDocumentLayer,
    snapLayerFromNode,
    applySnappedNodePosition,
    ellipseDragSnapshot,
    logEllipseDrag,
  }
}
