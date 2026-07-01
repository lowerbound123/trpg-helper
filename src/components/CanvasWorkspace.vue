<script setup lang="ts">
import type { Ref, Reactive } from 'vue'
import { inject } from 'vue'
import { Minus, Plus } from '@lucide/vue'
import Konva from 'konva'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useEditorStore } from '@/stores/editor'
import { isImageLayer, isPaintLayer, isTextLayer } from '@/stores/editor'
import { appConfiguration } from '@/lib/configuration'
import { isCurveShape } from '@/lib/handout'
import { paintStrokeLineConfig } from '@/lib/paint-rendering'
import {
  arrowDotConfig,
  arrowLineConfig,
  lineDoubleOffset,
  lineHandleConfig,
  lineHitConfig,
  lineVisualConfig,
  manualArrowVisible,
  showLineHandle,
} from '@/lib/shape-rendering'

type NodeRef = { getNode: () => Konva.Node }
type KonvaEvent = { target: Konva.Node; evt?: MouseEvent; cancelBubble?: boolean }

const editor = useEditorStore()

const ctx = inject<Record<string, any>>('canvas-context')!

const stageFrameRef = ctx.stageFrameRef as Ref<HTMLElement | undefined>
const stageRef = ctx.stageRef as Ref<any>
const transformerRef = ctx.transformerRef as Ref<any>
const layerNodeRefs = ctx.layerNodeRefs as Reactive<Record<string, NodeRef | undefined>>
const stageConfig = ctx.stageConfig as Record<string, number>
const contentGroupConfig = ctx.contentGroupConfig as Record<string, number>
const stageScale = ctx.stageScale as number
const documentFilterStyle = ctx.documentFilterStyle as string
const transformerConfig = ctx.transformerConfig as Record<string, any>
const activeTool = ctx.activeTool as Ref<string>
const maskFeatureEnabled = ctx.maskFeatureEnabled as boolean
const maskEditLabel = ctx.maskEditLabel as string
const panState = ctx.panState as { active: boolean }
const draggedAssetId = ctx.draggedAssetId as Ref<string>
const draggedFontId = ctx.draggedFontId as Ref<string>
const draggedShapeKind = ctx.draggedShapeKind as Ref<any>
const visibleCanvasLayers = ctx.visibleCanvasLayers as any[]
const selectedCurveLayers = ctx.selectedCurveLayers as any[]
const draftStroke = ctx.draftStroke as Ref<any>
const polygonDraft = ctx.polygonDraft as { points: Array<{ x: number; y: number }> }
const polygonDraftLineConfig = ctx.polygonDraftLineConfig as () => Record<string, any>
const polygonDraftPointConfig = ctx.polygonDraftPointConfig as (index: number) => Record<string, any>
const brushCursor = ctx.brushCursor as { visible: boolean; x: number; y: number; diameter: number; mode: 'brush' | 'eraser' }
const selectionBox = ctx.selectionBox as { visible: boolean; x: number; y: number; width: number; height: number }
const guideLines = ctx.guideLines as Ref<any[]>
const maskedBackgroundImage = ctx.maskedBackgroundImage as Ref<any>
const backgroundImage = ctx.backgroundImage as Ref<any>
const maskEditImage = ctx.maskEditImage as Ref<any>
const activeMaskEditLayer = ctx.activeMaskEditLayer as Ref<any>
const handleCanvasDragOver = ctx.handleCanvasDragOver as (event: DragEvent) => void
const handleCanvasDrop = ctx.handleCanvasDrop as (event: DragEvent) => void
const handleCanvasWheel = ctx.handleCanvasWheel as (event: WheelEvent) => void
const startCanvasPan = ctx.startCanvasPan as (event: PointerEvent) => void
const moveCanvasPan = ctx.moveCanvasPan as (event: PointerEvent) => void
const stopCanvasPan = ctx.stopCanvasPan as () => void
const updateBrushCursorFromPointer = ctx.updateBrushCursorFromPointer as (event: PointerEvent) => void
const hideBrushCursor = ctx.hideBrushCursor as () => void
const handleStagePointer = ctx.handleStagePointer as (event: KonvaEvent) => void
const startSelectionBox = ctx.startSelectionBox as (event: KonvaEvent) => void
const moveSelectionBox = ctx.moveSelectionBox as (event: KonvaEvent) => void
const stopSelectionBox = ctx.stopSelectionBox as () => void
const selectCanvasLayer = ctx.selectCanvasLayer as (layerId: string, event?: KonvaEvent) => void
const onLayerDragStart = ctx.onLayerDragStart as (layer: any, event: KonvaEvent) => void
const onDragMove = ctx.onDragMove as (layer: any, event: KonvaEvent) => void
const onDragEnd = ctx.onDragEnd as (layer: any) => void
const onTransform = ctx.onTransform as (layer: any, event: KonvaEvent) => void
const onTransformEnd = ctx.onTransformEnd as (layer: any) => void
const setMaskEditNodeRef = ctx.setMaskEditNodeRef as (node: unknown) => void
const onMaskEditDragStart = ctx.onMaskEditDragStart as (layer: any) => void
const onMaskEditDragEnd = ctx.onMaskEditDragEnd as (layer: any, event: KonvaEvent) => void
const onMaskEditTransformEnd = ctx.onMaskEditTransformEnd as (layer: any, event: KonvaEvent) => void
const maskedLayerConfig = ctx.maskedLayerConfig as (layer: any) => Record<string, any>
const layerConfig = ctx.layerConfig as (layer: any) => Record<string, any>
const textConfig = ctx.textConfig as (layer: any) => Record<string, any>
const shapeConfig = ctx.shapeConfig as (layer: any) => Record<string, any>
const paintConfig = ctx.paintConfig as (layer: any) => Record<string, any>
const maskEditConfig = ctx.maskEditConfig as (layer: any) => Record<string, any>
const curveHandleConfig = ctx.curveHandleConfig as (layer: any, key: string) => Record<string, any>
const curveGuideConfig = ctx.curveGuideConfig as (layer: any) => any[][]
const curveGuideLineConfig = ctx.curveGuideLineConfig as (layer: any, guide: any[]) => Record<string, any>
const curvePointKeys = ctx.curvePointKeys as (layer: any) => string[]
const moveCurvePoint = ctx.moveCurvePoint as (layer: any, key: string, event: KonvaEvent) => void
const endCurvePointMove = ctx.endCurvePointMove as (layer: any, key: string) => void
const maskedImageForLayer = ctx.maskedImageForLayer as (layer: any) => any
const imageForLayer = ctx.imageForLayer as (layer: any) => any
const isShapeLayer = ctx.isShapeLayer as (layer: any) => boolean
const zoomIn = ctx.zoomIn as () => void
const zoomOut = ctx.zoomOut as () => void
const fitEditorCanvas = ctx.fitEditorCanvas as (reason?: string) => void

void stageFrameRef; void stageRef; void transformerRef

function handleStageFramePointerDown(event: PointerEvent) {
  startCanvasPan(event)
  updateBrushCursorFromPointer(event)
}

function handleStageFramePointerMove(event: PointerEvent) {
  moveCanvasPan(event)
  updateBrushCursorFromPointer(event)
}

function handleStageFramePointerLeave() {
  stopCanvasPan()
  hideBrushCursor()
}

function handleStageFramePointerUp() {
  stopCanvasPan()
}

function handleStageFrameContextMenu(event: MouseEvent) {
  if (activeTool.value !== 'polygon') return
  event.preventDefault()
}

function draftStrokeConfig() {
  return paintStrokeLineConfig(
    draftStroke.value,
    editor.maskEditTarget ? { minOpacity: appConfiguration.mask.strokePreviewMinOpacity } : undefined,
  )
}
</script>

<template>
  <section class="canvas-wrap">
    <div class="canvas-meta">
      <Badge variant="secondary">{{ editor.document.canvas.width }} x {{ editor.document.canvas.height }} px</Badge>
      <Badge variant="outline">{{ Math.round(stageScale * 100) }}%</Badge>
      <Badge v-if="maskFeatureEnabled && maskEditLabel" variant="secondary">Editing {{ maskEditLabel }}</Badge>
      <div class="zoom-controls">
        <Button size="icon" variant="outline" @click="zoomOut">
          <Minus />
        </Button>
        <Button size="sm" variant="outline" @click="fitEditorCanvas('button')">Fit</Button>
        <Button size="icon" variant="outline" @click="zoomIn">
          <Plus />
        </Button>
      </div>
    </div>

    <div
      ref="stageFrameRef"
      class="stage-frame"
      :class="{
        'stage-frame-dropping': draggedAssetId || draggedFontId || draggedShapeKind,
        'stage-frame-panning': panState.active,
        'stage-frame-drawing': activeTool === 'brush' || activeTool === 'eraser',
        'stage-frame-polygon': activeTool === 'polygon',
      }"
      @dragenter.capture="handleCanvasDragOver"
      @dragover.capture="handleCanvasDragOver"
      @drop.capture="handleCanvasDrop"
      @wheel.prevent="handleCanvasWheel"
      @pointerdown="handleStageFramePointerDown"
      @pointermove="handleStageFramePointerMove"
      @pointerup="handleStageFramePointerUp"
      @pointerleave="handleStageFramePointerLeave"
      @contextmenu="handleStageFrameContextMenu"
    >
      <div class="stage-surface" :style="{ filter: documentFilterStyle }">
        <v-stage
          ref="stageRef"
          :config="stageConfig"
          @click="handleStagePointer"
          @tap="handleStagePointer"
          @mousedown="startSelectionBox"
          @mousemove="moveSelectionBox"
          @mouseup="stopSelectionBox"
        >
          <v-layer>
            <v-group :config="contentGroupConfig">
              <v-rect
                v-if="!maskedBackgroundImage"
                :config="{
                  name: 'canvas-background',
                  x: 0,
                  y: 0,
                  width: editor.document.canvas.width,
                  height: editor.document.canvas.height,
                  fill: editor.document.canvas.backgroundVisible !== false ? editor.document.canvas.backgroundColor : 'rgba(0,0,0,0)',
                }"
              />
              <v-image
                v-if="maskedBackgroundImage && editor.document.canvas.backgroundVisible !== false"
                :config="{
                  name: 'canvas-background',
                  image: maskedBackgroundImage,
                  x: 0,
                  y: 0,
                  width: editor.document.canvas.width,
                  height: editor.document.canvas.height,
                  listening: true,
                }"
              />
              <v-image
                v-if="!maskedBackgroundImage && backgroundImage && editor.document.canvas.backgroundVisible !== false"
                :config="{
                  image: backgroundImage,
                  x: 0,
                  y: 0,
                  width: editor.document.canvas.width,
                  height: editor.document.canvas.height,
                  listening: false,
                }"
              />
              <template v-for="layer in visibleCanvasLayers" :key="layer.id">
                <v-image
                  v-if="maskedImageForLayer(layer)"
                  :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                  :config="maskedLayerConfig(layer)"
                  @click="selectCanvasLayer(layer.id, $event)"
                  @tap="selectCanvasLayer(layer.id, $event)"
                  @dragstart="onLayerDragStart(layer, $event)"
                  @dragmove="onDragMove(layer, $event)"
                  @dragend="onDragEnd(layer)"
                  @transform="onTransform(layer, $event)"
                  @transformend="onTransformEnd(layer)"
                />
                <v-image
                  v-else-if="isImageLayer(layer) && imageForLayer(layer)"
                  :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                  :config="{ ...layerConfig(layer), image: imageForLayer(layer) }"
                  @click="selectCanvasLayer(layer.id, $event)"
                  @tap="selectCanvasLayer(layer.id, $event)"
                  @dragstart="onLayerDragStart(layer, $event)"
                  @dragmove="onDragMove(layer, $event)"
                  @dragend="onDragEnd(layer)"
                  @transform="onTransform(layer, $event)"
                  @transformend="onTransformEnd(layer)"
                />
                <v-text
                  v-else-if="isTextLayer(layer)"
                  :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                  :config="textConfig(layer)"
                  @click="selectCanvasLayer(layer.id, $event)"
                  @tap="selectCanvasLayer(layer.id, $event)"
                  @dragstart="onLayerDragStart(layer, $event)"
                  @dragmove="onDragMove(layer, $event)"
                  @dragend="onDragEnd(layer)"
                  @transform="onTransform(layer, $event)"
                  @transformend="onTransformEnd(layer)"
                />
                <v-rect
                  v-else-if="isShapeLayer(layer) && ['rect', 'round-rect'].includes(layer.shape)"
                  :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                  :config="shapeConfig(layer)"
                  @click="selectCanvasLayer(layer.id, $event)"
                  @tap="selectCanvasLayer(layer.id, $event)"
                  @dragstart="onLayerDragStart(layer, $event)"
                  @dragmove="onDragMove(layer, $event)"
                  @dragend="onDragEnd(layer)"
                  @transform="onTransform(layer, $event)"
                  @transformend="onTransformEnd(layer)"
                />
                <v-line
                  v-else-if="isShapeLayer(layer) && ['diamond', 'hexagon-h', 'hexagon-v', 'polygon'].includes(layer.shape)"
                  :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                  :config="shapeConfig(layer)"
                  @click="selectCanvasLayer(layer.id, $event)"
                  @tap="selectCanvasLayer(layer.id, $event)"
                  @dragstart="onLayerDragStart(layer, $event)"
                  @dragmove="onDragMove(layer, $event)"
                  @dragend="onDragEnd(layer)"
                  @transform="onTransform(layer, $event)"
                  @transformend="onTransformEnd(layer)"
                />
                <v-ellipse
                  v-else-if="isShapeLayer(layer) && layer.shape === 'ellipse'"
                  :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                  :config="shapeConfig(layer)"
                  @click="selectCanvasLayer(layer.id, $event)"
                  @tap="selectCanvasLayer(layer.id, $event)"
                  @dragstart="onLayerDragStart(layer, $event)"
                  @dragmove="onDragMove(layer, $event)"
                  @dragend="onDragEnd(layer)"
                  @transform="onTransform(layer, $event)"
                  @transformend="onTransformEnd(layer)"
                />
                <v-shape
                  v-else-if="isShapeLayer(layer) && isCurveShape(layer.shape)"
                  :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                  :config="shapeConfig(layer)"
                  @click="selectCanvasLayer(layer.id, $event)"
                  @tap="selectCanvasLayer(layer.id, $event)"
                  @dragstart="onLayerDragStart(layer, $event)"
                  @dragmove="onDragMove(layer, $event)"
                  @dragend="onDragEnd(layer)"
                  @transform="onTransform(layer, $event)"
                  @transformend="onTransformEnd(layer)"
                />
                <v-group
                  v-else-if="isShapeLayer(layer) && layer.shape === 'line'"
                  :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                  :config="shapeConfig(layer)"
                  @click="selectCanvasLayer(layer.id, $event)"
                  @tap="selectCanvasLayer(layer.id, $event)"
                  @dragstart="onLayerDragStart(layer, $event)"
                  @dragmove="onDragMove(layer, $event)"
                  @dragend="onDragEnd(layer)"
                  @transform="onTransform(layer, $event)"
                  @transformend="onTransformEnd(layer)"
                >
                  <v-rect :config="lineHitConfig(layer)" />
                  <template v-if="layer.lineStyle === 'double'">
                    <v-line :config="lineVisualConfig(layer, -lineDoubleOffset(layer))" />
                    <v-line :config="lineVisualConfig(layer, lineDoubleOffset(layer))" />
                  </template>
                  <v-arrow v-else :config="lineVisualConfig(layer)" />
                  <v-line
                    v-if="manualArrowVisible(layer.lineStartArrow, layer)"
                    :config="arrowLineConfig(layer.lineStartArrow, 'start', layer)"
                  />
                  <v-circle
                    v-if="layer.lineStartArrow === 'dot'"
                    :config="arrowDotConfig('start', layer)"
                  />
                  <v-line
                    v-if="manualArrowVisible(layer.lineEndArrow, layer)"
                    :config="arrowLineConfig(layer.lineEndArrow, 'end', layer)"
                  />
                  <v-circle
                    v-if="layer.lineEndArrow === 'dot'"
                    :config="arrowDotConfig('end', layer)"
                  />
                  <v-circle v-if="showLineHandle(layer, editor.selectedLayerIds)" :config="lineHandleConfig(layer)" />
                </v-group>
                <v-shape
                  v-else-if="isPaintLayer(layer)"
                  :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as NodeRef)"
                  :config="paintConfig(layer)"
                  @click="selectCanvasLayer(layer.id, $event)"
                  @tap="selectCanvasLayer(layer.id, $event)"
                  @dragstart="onLayerDragStart(layer, $event)"
                  @dragmove="onDragMove(layer, $event)"
                  @dragend="onDragEnd(layer)"
                  @transform="onTransform(layer, $event)"
                  @transformend="onTransformEnd(layer)"
                />
              </template>
              <template
                v-for="layer in selectedCurveLayers"
                :key="`curve-controls-${layer.id}`"
              >
                <v-line
                  v-for="(guide, index) in curveGuideConfig(layer)"
                  :key="`curve-guide-${layer.id}-${index}`"
                  :config="curveGuideLineConfig(layer, guide)"
                />
                <v-circle
                  v-for="key in curvePointKeys(layer)"
                  :key="`curve-handle-${layer.id}-${key}`"
                  :config="curveHandleConfig(layer, key)"
                  @dragmove="moveCurvePoint(layer, key, $event)"
                  @dragend="endCurvePointMove(layer, key)"
                />
              </template>
              <v-line
                v-if="draftStroke"
                :config="draftStrokeConfig()"
              />
              <v-line
                v-if="polygonDraft.points.length"
                :config="polygonDraftLineConfig()"
              />
              <v-circle
                v-for="(_point, index) in polygonDraft.points"
                :key="`polygon-draft-point-${index}`"
                :config="polygonDraftPointConfig(index)"
              />
              <v-image
                v-if="maskFeatureEnabled && activeMaskEditLayer?.mask && maskEditImage"
                :ref="setMaskEditNodeRef"
                :config="maskEditConfig(activeMaskEditLayer)"
                @dragstart="onMaskEditDragStart(activeMaskEditLayer)"
                @dragend="onMaskEditDragEnd(activeMaskEditLayer, $event)"
                @transformend="onMaskEditTransformEnd(activeMaskEditLayer, $event)"
              />
              <template v-for="guide in guideLines" :key="`${guide.orientation}-${guide.value}`">
                <v-line
                  v-if="guide.orientation === 'vertical'"
                  :config="{
                    points: [guide.value, 0, guide.value, editor.document.canvas.height],
                    stroke: '#0ea5e9',
                    strokeWidth: 1 / stageScale,
                    dash: [6 / stageScale, 4 / stageScale],
                    listening: false,
                  }"
                />
                <v-line
                  v-else
                  :config="{
                    points: [0, guide.value, editor.document.canvas.width, guide.value],
                    stroke: '#0ea5e9',
                    strokeWidth: 1 / stageScale,
                    dash: [6 / stageScale, 4 / stageScale],
                    listening: false,
                  }"
                />
              </template>
              <v-rect
                v-if="selectionBox.visible"
                :config="{
                  x: selectionBox.x,
                  y: selectionBox.y,
                  width: selectionBox.width,
                  height: selectionBox.height,
                  fill: 'rgba(14, 165, 233, 0.12)',
                  stroke: '#0ea5e9',
                  strokeWidth: 1 / stageScale,
                  dash: [4 / stageScale, 4 / stageScale],
                  listening: false,
                }"
              />
              <v-transformer
                ref="transformerRef"
                :config="transformerConfig"
              />
            </v-group>
          </v-layer>
        </v-stage>
      </div>
      <div
        v-if="brushCursor.visible"
        class="brush-cursor-ring"
        :class="`brush-cursor-ring-${brushCursor.mode}`"
        :style="{
          width: `${brushCursor.diameter}px`,
          height: `${brushCursor.diameter}px`,
          transform: `translate(${brushCursor.x - brushCursor.diameter / 2}px, ${brushCursor.y - brushCursor.diameter / 2}px)`,
        }"
      />
    </div>
  </section>
</template>
