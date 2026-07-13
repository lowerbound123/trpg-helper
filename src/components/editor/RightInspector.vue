<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, FlipHorizontal, Italic, Strikethrough, Trash2, Underline } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import ExportPanel from '@/components/editor/ExportPanel.vue'
import NumericSliderField from '@/components/controls/NumericSliderField.vue'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { appConfiguration } from '@/lib/configuration'
import { fontRecordFamily } from '@/lib/backend'
import type { EditorTool } from '@/lib/editor-tools'
import { isPaintLayer, isShapeLayer, isTextLayer, useEditorStore } from '@/stores/editor'
import type { BrushKind } from '@/lib/handout'

const exportScale = defineModel<number>('exportScale', { required: true })
const exportFormat = defineModel<'png' | 'jpeg' | 'webp'>('exportFormat', { required: true })
const exportQuality = defineModel<number>('exportQuality', { required: true })

const props = defineProps<{
  isExporting?: boolean
  exportLog?: string
  exportProgress?: number
  activeTool?: EditorTool
}>()

defineEmits<{
  exportImage: []
}>()

const editor = useEditorStore()
type InspectorTab = 'inspect' | 'brush' | 'document'
const activeInspectorTab = ref<InspectorTab>('inspect')
const activeLayer = computed(() => editor.selectedLayer)
const activeTextLayer = computed(() => isTextLayer(activeLayer.value) ? activeLayer.value : undefined)
const selectedLayers = computed(() => editor.selectedLayers)
const selectedCount = computed(() => selectedLayers.value.length)
const selectedTextLayers = computed(() => selectedLayers.value.filter(isTextLayer))
const selectedShapeLayers = computed(() => selectedLayers.value.filter(isShapeLayer))
const selectedPaintLayers = computed(() => selectedLayers.value.filter(isPaintLayer))
const allSelectedText = computed(() => selectedLayers.value.length > 0 && selectedTextLayers.value.length === selectedLayers.value.length)
const allSelectedShapes = computed(() => selectedLayers.value.length > 0 && selectedShapeLayers.value.length === selectedLayers.value.length)
const allSelectedPaint = computed(() => selectedLayers.value.length > 0 && selectedPaintLayers.value.length === selectedLayers.value.length)
const allSelectedLines = computed(() => allSelectedShapes.value && selectedShapeLayers.value.every((layer) => layer.shape === 'line'))
const allSelectedRoundRects = computed(() => allSelectedShapes.value && selectedShapeLayers.value.every((layer) => layer.shape === 'round-rect'))
const backgroundAsset = computed(() =>
  editor.resolveBackground(editor.document.canvas.backgroundAssetId)
    || editor.resolveAsset(editor.document.canvas.backgroundAssetId),
)

function commonValue<T>(values: T[], fallback?: T) {
  if (!values.length) return fallback
  return values.every((value) => value === values[0]) ? values[0] : fallback
}

function commonLayerValue<T>(getter: (layer: NonNullable<typeof activeLayer.value>) => T, fallback?: T) {
  return commonValue(selectedLayers.value.map(getter), fallback)
}

function commonTextValue<T>(getter: (layer: (typeof selectedTextLayers.value)[number]) => T, fallback?: T) {
  return commonValue(selectedTextLayers.value.map(getter), fallback)
}

const commonFontId = computed(() => commonTextValue((layer) => layer.fontId, ''))
const commonFontFamily = computed(() => commonTextValue((layer) => layer.fontFamily, 'Mixed fonts'))
const commonFontSize = computed(() => commonTextValue((layer) => layer.fontSize, undefined))
const commonFill = computed(() => commonTextValue((layer) => layer.fill, undefined))
const commonLineHeight = computed(() => commonTextValue((layer) => layer.lineHeight, undefined))
const commonAlign = computed(() => commonTextValue((layer) => layer.align, undefined))
const commonBold = computed(() => commonTextValue((layer) => layer.fontWeight >= 700, undefined))
const commonItalic = computed(() => commonTextValue((layer) => layer.italic, undefined))
const commonUnderline = computed(() => commonTextValue((layer) => layer.underline, undefined))
const commonStrikethrough = computed(() => commonTextValue((layer) => layer.strikethrough, undefined))
const commonShapeFill = computed(() => commonValue(selectedShapeLayers.value.map((layer) => layer.fill), undefined))
const commonShapeStroke = computed(() => commonValue(selectedShapeLayers.value.map((layer) => layer.stroke), undefined))
const commonShapeStrokeWidth = computed(() => commonValue(selectedShapeLayers.value.map((layer) => layer.strokeWidth), undefined))
const commonShapeCornerRadius = computed(() => commonValue(selectedShapeLayers.value.map((layer) => layer.cornerRadius), undefined))
const commonLineStartArrow = computed(() => commonValue(selectedShapeLayers.value.map((layer) => layer.lineStartArrow), undefined))
const commonLineEndArrow = computed(() => commonValue(selectedShapeLayers.value.map((layer) => layer.lineEndArrow), undefined))
const commonLineArrowSize = computed(() => commonValue(selectedShapeLayers.value.map((layer) => layer.lineArrowSize), undefined))
const commonLineStyle = computed(() => commonValue(selectedShapeLayers.value.map((layer) => layer.lineStyle), undefined))
const commonBrushColor = computed(() => allSelectedPaint.value ? commonValue(selectedPaintLayers.value.map((layer) => layer.brushColor), undefined) : editor.toolSettings.brushColor)
const commonBrushKind = computed(() => allSelectedPaint.value ? commonValue(selectedPaintLayers.value.map((layer) => layer.brushKind), undefined) : editor.toolSettings.brushKind)
const commonBrushWidth = computed(() => allSelectedPaint.value ? commonValue(selectedPaintLayers.value.map((layer) => layer.brushWidth), undefined) : editor.toolSettings.brushWidth)
const commonBrushOpacity = computed(() => allSelectedPaint.value ? commonValue(selectedPaintLayers.value.map((layer) => layer.brushOpacity), undefined) : editor.toolSettings.brushOpacity)
const commonEraserWidth = computed(() => allSelectedPaint.value ? commonValue(selectedPaintLayers.value.map((layer) => layer.eraserWidth), undefined) : editor.toolSettings.eraserWidth)
const commonEraserOpacity = computed(() => allSelectedPaint.value ? commonValue(selectedPaintLayers.value.map((layer) => layer.eraserOpacity), undefined) : editor.toolSettings.eraserOpacity)
const commonBrushTension = computed(() => allSelectedPaint.value ? commonValue(selectedPaintLayers.value.map((layer) => layer.brushTension), undefined) : editor.toolSettings.brushTension)
const commonX = computed(() => commonLayerValue((layer) => layer.x, undefined))
const commonY = computed(() => commonLayerValue((layer) => layer.y, undefined))
const commonWidth = computed(() => commonLayerValue((layer) => layer.width, undefined))
const commonHeight = computed(() => commonLayerValue((layer) => layer.height, undefined))
const commonRotation = computed(() => commonLayerValue((layer) => layer.rotation, undefined))
const commonOpacity = computed(() => commonLayerValue((layer) => layer.opacity, undefined))
const commonFlipX = computed(() => commonLayerValue((layer) => layer.flipX, undefined))
const commonLayerBlur = computed(() => commonLayerValue((layer) => layer.effects.blur, undefined))
const commonLayerBrightness = computed(() => commonLayerValue((layer) => layer.effects.brightness, undefined))
const commonLayerContrast = computed(() => commonLayerValue((layer) => layer.effects.contrast, undefined))
const commonLayerSaturation = computed(() => commonLayerValue((layer) => layer.effects.saturation, undefined))
const brushOpacityPercent = computed(() => commonBrushOpacity.value === undefined ? undefined : Math.round(commonBrushOpacity.value * 100))
const eraserOpacityPercent = computed(() => commonEraserOpacity.value === undefined ? undefined : Math.round(commonEraserOpacity.value * 100))
const continuousEditTimers = new Map<string, number>()

watch(() => props.activeTool, (tool) => {
  if (tool === 'brush' || tool === 'eraser') {
    activeInspectorTab.value = 'brush'
    return
  }
  if (tool === 'select' || tool === 'polygon') {
    activeInspectorTab.value = 'inspect'
  }
}, { immediate: true })

function scheduleContinuousEditEnd(key: string) {
  const existing = continuousEditTimers.get(key)
  if (existing) window.clearTimeout(existing)
  continuousEditTimers.set(key, window.setTimeout(() => {
    editor.endContinuousEdit(key)
    continuousEditTimers.delete(key)
  }, appConfiguration.editor.continuousEditCommitDelayMs))
}

function endContinuousEdit(key: string) {
  const existing = continuousEditTimers.get(key)
  if (existing) window.clearTimeout(existing)
  continuousEditTimers.delete(key)
  editor.endContinuousEdit(key)
}

function patchBrushSettings(patch: Record<string, unknown>) {
  if (allSelectedPaint.value) editor.patchSelectedLayers(patch as any)
  else editor.patchToolSettings(patch as any)
}

function patchBrushOpacitySlider(value: number) {
  patchBrushSettings({ brushOpacity: value / 100 })
}

function patchEraserOpacitySlider(value: number) {
  patchBrushSettings({ eraserOpacity: value / 100 })
}

onBeforeUnmount(() => {
  for (const timer of continuousEditTimers.values()) window.clearTimeout(timer)
  continuousEditTimers.clear()
  editor.endContinuousEdit()
})

function setFont(fontId: string) {
  const font = editor.resolveFont(fontId)
  if (font) {
    editor.applyOrCreateTextWithFont(font)
    return
  }
  editor.patchSelectedLayers({
    fontId,
    fontFamily: fontRecordFamily(font),
  })
}

function deleteLayer() {
  editor.deleteSelectedLayer()
}

function patchTextDecoration(kind: 'underline' | 'strikethrough', value: boolean) {
  editor.patchSelectedLayers({ [kind]: value })
}

function patchOpacity(value: number) {
  const key = 'layer-opacity'
  editor.patchSelectedLayersContinuous(key, { opacity: value / 100 })
  scheduleContinuousEditEnd(key)
}

function patchEffect(kind: 'blur' | 'brightness' | 'contrast' | 'saturation', value: number) {
  const key = `layer-effect-${kind}`
  editor.patchSelectedLayerEffectContinuous(key, kind, value)
  scheduleContinuousEditEnd(key)
}

function patchBlur(value: number) {
  patchEffect('blur', value)
}

function patchBrightness(value: number) {
  patchEffect('brightness', value)
}

function patchContrast(value: number) {
  patchEffect('contrast', value)
}

function patchSaturation(value: number) {
  patchEffect('saturation', value)
}

function patchDocumentEffect(kind: 'blur' | 'brightness' | 'contrast' | 'saturation', value: number) {
  const key = `document-effect-${kind}`
  editor.patchCanvasEffectContinuous(key, kind, value)
  scheduleContinuousEditEnd(key)
}

function patchDocumentBlur(value: number) {
  patchDocumentEffect('blur', value)
}

function patchDocumentBrightness(value: number) {
  patchDocumentEffect('brightness', value)
}

function patchDocumentContrast(value: number) {
  patchDocumentEffect('contrast', value)
}

function patchDocumentSaturation(value: number) {
  patchDocumentEffect('saturation', value)
}
</script>

<template>
  <aside class="right-rail">
    <Tabs v-model="activeInspectorTab" default-value="inspect" class="rail-tabs">
      <TabsList class="grid grid-cols-3">
        <TabsTrigger value="inspect">Inspect</TabsTrigger>
        <TabsTrigger value="brush">Brush</TabsTrigger>
        <TabsTrigger value="document">Document</TabsTrigger>
      </TabsList>

      <TabsContent value="inspect" class="rail-tab-content">
        <div v-if="activeLayer" class="panel-stack inspector-panel">
          <div v-if="selectedCount > 1" class="selection-summary">
            {{ selectedCount }} layers selected
          </div>
          <label v-if="selectedCount === 1">
            Name
            <Input :model-value="activeLayer.name" @update:model-value="(value) => editor.patchSelectedLayer({ name: String(value) })" />
          </label>
          <div class="transform-grid">
            <NumericSliderField label="X" :model-value="commonX" :min="-16384" :max="16384" :step="1" @update:model-value="(value) => editor.patchSelectedLayers({ x: value })" />
            <NumericSliderField label="Y" :model-value="commonY" :min="-16384" :max="16384" :step="1" @update:model-value="(value) => editor.patchSelectedLayers({ y: value })" />
            <NumericSliderField label="Rotation" :model-value="commonRotation" :min="0" :max="359" :step="1" unit="°" @update:model-value="(value) => editor.patchSelectedLayers({ rotation: value })" />
            <NumericSliderField label="Width" :model-value="commonWidth" :min="1" :max="16384" :step="1" @update:model-value="(value) => editor.patchSelectedLayers({ width: value })" />
            <NumericSliderField label="Height" :model-value="commonHeight" :min="1" :max="16384" :step="1" @update:model-value="(value) => editor.patchSelectedLayers({ height: value })" />
            <label>
              Flip
              <Button
                type="button"
                size="icon"
                variant="outline"
                title="Flip horizontal"
                :data-active="commonFlipX === true"
                @click="editor.toggleSelectedLayersFlipX()"
              >
                <FlipHorizontal />
              </Button>
            </label>
          </div>
          <NumericSliderField
            label="Opacity"
            :model-value="commonOpacity === undefined ? undefined : Math.round(commonOpacity * 100)"
            :min="0"
            :max="100"
            :step="1"
            unit="%"
            @update:model-value="patchOpacity"
            @commit="endContinuousEdit('layer-opacity')"
          />
          <div class="appearance-row">
            <label class="blend-control">
              Blend mode
              <Select :model-value="activeLayer.blendMode" @update:model-value="(value) => editor.patchSelectedLayers({ blendMode: value as any })">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="source-over">Normal</SelectItem>
                  <SelectItem value="multiply">Multiply</SelectItem>
                  <SelectItem value="screen">Screen</SelectItem>
                  <SelectItem value="overlay">Overlay</SelectItem>
                  <SelectItem value="darken">Darken</SelectItem>
                  <SelectItem value="lighten">Lighten</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label v-if="allSelectedShapes" class="compact-color-control">
              Fill
              <Input
                :type="commonShapeFill ? 'color' : 'text'"
                :model-value="commonShapeFill ?? ''"
                placeholder="Mixed"
                @update:model-value="(value) => editor.patchSelectedLayers({ fill: String(value) })"
              />
            </label>
            <label v-if="allSelectedShapes" class="compact-color-control">
              Stroke
              <Input
                :type="commonShapeStroke ? 'color' : 'text'"
                :model-value="commonShapeStroke ?? ''"
                placeholder="Mixed"
                @update:model-value="(value) => editor.patchSelectedLayers({ stroke: String(value) })"
              />
            </label>
          </div>
          <template v-if="allSelectedText">
            <label v-if="selectedCount === 1">
              Text
              <Textarea :model-value="activeTextLayer?.text" @update:model-value="(value) => editor.patchSelectedLayer({ text: String(value) })" />
            </label>
            <NumericSliderField label="Font size" :model-value="commonFontSize" :min="1" :max="512" :step="1" @update:model-value="(value) => editor.patchSelectedLayers({ fontSize: value })" />
            <label>
              Color
              <Input
                :type="commonFill ? 'color' : 'text'"
                :model-value="commonFill ?? ''"
                placeholder="Mixed"
                @update:model-value="(value) => editor.patchSelectedLayers({ fill: String(value) })"
              />
            </label>
            <NumericSliderField label="Line height" :model-value="commonLineHeight" :min="0.5" :max="3" :step="0.05" @update:model-value="(value) => editor.patchSelectedLayers({ lineHeight: value })" />
            <div class="icon-button-grid">
              <Button
                size="icon"
                variant="outline"
                :data-active="commonAlign === 'left'"
                @click="editor.patchSelectedLayers({ align: 'left' })"
              >
                <AlignLeft />
              </Button>
              <Button
                size="icon"
                variant="outline"
                :data-active="commonAlign === 'center'"
                @click="editor.patchSelectedLayers({ align: 'center' })"
              >
                <AlignCenter />
              </Button>
              <Button
                size="icon"
                variant="outline"
                :data-active="commonAlign === 'right'"
                @click="editor.patchSelectedLayers({ align: 'right' })"
              >
                <AlignRight />
              </Button>
              <Button
                size="icon"
                variant="outline"
                :data-active="commonAlign === 'justify'"
                @click="editor.patchSelectedLayers({ align: 'justify' })"
              >
                <AlignJustify />
              </Button>
            </div>
            <div class="icon-button-grid">
              <Button
                size="icon"
                variant="outline"
                :data-active="commonBold === true"
                @click="editor.patchSelectedLayers({ fontWeight: commonBold === true ? 400 : 700 })"
              >
                <Bold />
              </Button>
              <Button
                size="icon"
                variant="outline"
                :data-active="commonItalic === true"
                @click="editor.patchSelectedLayers({ italic: !(commonItalic === true) })"
              >
                <Italic />
              </Button>
              <Button
                size="icon"
                variant="outline"
                :data-active="commonUnderline === true"
                @click="patchTextDecoration('underline', !(commonUnderline === true))"
              >
                <Underline />
              </Button>
              <Button
                size="icon"
                variant="outline"
                :data-active="commonStrikethrough === true"
                @click="patchTextDecoration('strikethrough', !(commonStrikethrough === true))"
              >
                <Strikethrough />
              </Button>
            </div>
            <label>
              Font
              <Select :model-value="commonFontId" @update:model-value="(value) => setFont(String(value))">
                <SelectTrigger><SelectValue :placeholder="commonFontFamily" /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="font in editor.library.fonts" :key="font.id" :value="font.id">
                    {{ font.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
          </template>
          <template v-if="allSelectedShapes">
            <NumericSliderField v-if="allSelectedLines" label="Line length" :model-value="commonWidth" :min="12" :max="16384" :step="1" @update:model-value="(value) => editor.patchSelectedLayers({ width: value })" />
            <NumericSliderField v-if="allSelectedRoundRects" label="Corner radius" :model-value="commonShapeCornerRadius" :min="0" :max="4096" :step="1" @update:model-value="(value) => editor.patchSelectedLayers({ cornerRadius: value })" />
            <NumericSliderField label="Stroke width" :model-value="commonShapeStrokeWidth" :min="0" :max="512" :step="1" @update:model-value="(value) => editor.patchSelectedLayers({ strokeWidth: value })" />
            <template v-if="allSelectedLines">
              <label>
                Line style
                <Select :model-value="commonLineStyle" @update:model-value="(value) => editor.patchSelectedLayers({ lineStyle: value as any })">
                  <SelectTrigger><SelectValue placeholder="Mixed" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solid">Solid</SelectItem>
                    <SelectItem value="dashed">Dashed</SelectItem>
                    <SelectItem value="dotted">Dotted</SelectItem>
                    <SelectItem value="double">Double</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <NumericSliderField label="Arrow size" :model-value="commonLineArrowSize" :min="0.25" :max="16" :step="0.25" @update:model-value="(value) => editor.patchSelectedLayers({ lineArrowSize: value })" />
              <div class="two-col">
                <label>
                  Start arrow
                  <Select :model-value="commonLineStartArrow" @update:model-value="(value) => editor.patchSelectedLayers({ lineStartArrow: value as any })">
                    <SelectTrigger><SelectValue placeholder="Mixed" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="triangle">Triangle</SelectItem>
                      <SelectItem value="notched">Notched</SelectItem>
                      <SelectItem value="bar">Bar</SelectItem>
                      <SelectItem value="dot">Dot</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label>
                  End arrow
                  <Select :model-value="commonLineEndArrow" @update:model-value="(value) => editor.patchSelectedLayers({ lineEndArrow: value as any })">
                    <SelectTrigger><SelectValue placeholder="Mixed" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="triangle">Triangle</SelectItem>
                      <SelectItem value="notched">Notched</SelectItem>
                      <SelectItem value="bar">Bar</SelectItem>
                      <SelectItem value="dot">Dot</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>
            </template>
          </template>
          <Separator />
          <div class="effect-grid">
            <NumericSliderField label="Blur" :model-value="commonLayerBlur" :min="0" :max="40" :step="1" @update:model-value="patchBlur" @commit="endContinuousEdit('layer-effect-blur')" />
            <NumericSliderField label="Brightness" :model-value="commonLayerBrightness" :min="-100" :max="100" :step="1" unit="%" @update:model-value="patchBrightness" @commit="endContinuousEdit('layer-effect-brightness')" />
            <NumericSliderField label="Contrast" :model-value="commonLayerContrast" :min="-100" :max="100" :step="1" unit="%" @update:model-value="patchContrast" @commit="endContinuousEdit('layer-effect-contrast')" />
            <NumericSliderField label="Saturation" :model-value="commonLayerSaturation" :min="-100" :max="100" :step="1" unit="%" @update:model-value="patchSaturation" @commit="endContinuousEdit('layer-effect-saturation')" />
          </div>
          <div class="danger-row">
            <Button variant="destructive" @click="deleteLayer">
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </div>
        </div>
        <div v-else class="empty-inspector">Select a layer on the canvas or in the layer list.</div>
      </TabsContent>

      <TabsContent value="brush" class="rail-tab-content">
        <div class="panel-stack inspector-panel">
          <label class="blend-control">
            Brush type
            <Select :model-value="commonBrushKind" @update:model-value="(value) => patchBrushSettings({ brushKind: value as BrushKind })">
              <SelectTrigger><SelectValue placeholder="Mixed" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pixel">Pixel</SelectItem>
                <SelectItem value="pencil">Pencil</SelectItem>
                <SelectItem value="marker">Marker</SelectItem>
                <SelectItem value="highlighter">Highlighter</SelectItem>
                <SelectItem value="airbrush">Airbrush</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label class="compact-color-control">
            Brush
            <Input
              :type="commonBrushColor ? 'color' : 'text'"
              :model-value="commonBrushColor ?? ''"
              placeholder="Mixed"
              @update:model-value="(value) => patchBrushSettings({ brushColor: String(value) })"
            />
          </label>
          <NumericSliderField label="Brush width" :model-value="commonBrushWidth" :min="1" :max="512" :step="1" @update:model-value="(value) => patchBrushSettings({ brushWidth: value })" />
          <NumericSliderField label="Eraser width" :model-value="commonEraserWidth" :min="1" :max="512" :step="1" @update:model-value="(value) => patchBrushSettings({ eraserWidth: value })" />
          <NumericSliderField label="Tension" :model-value="commonBrushTension" :min="0" :max="1" :step="0.05" @update:model-value="(value) => patchBrushSettings({ brushTension: value })" />
          <NumericSliderField label="Brush opacity" :model-value="brushOpacityPercent" :min="0" :max="100" :step="1" unit="%" @update:model-value="patchBrushOpacitySlider" />
          <NumericSliderField label="Eraser opacity" :model-value="eraserOpacityPercent" :min="0" :max="100" :step="1" unit="%" @update:model-value="patchEraserOpacitySlider" />
          <div class="document-summary">
            <span>Strokes</span>
            <strong>{{ selectedPaintLayers.reduce((sum, layer) => sum + layer.strokes.length, 0) }}</strong>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="document" class="rail-tab-content">
        <div class="panel-stack inspector-panel">
          <label>
            Title
            <Input :model-value="editor.document.title" @update:model-value="(value) => editor.renameDocument(String(value))" />
          </label>
          <NumericSliderField label="Width" :model-value="editor.document.canvas.width" :min="1" :max="16384" :step="1" @update:model-value="(value) => editor.patchCanvas({ width: value })" />
          <NumericSliderField label="Height" :model-value="editor.document.canvas.height" :min="1" :max="16384" :step="1" @update:model-value="(value) => editor.patchCanvas({ height: value })" />
          <div class="document-summary">
            <span>Background</span>
            <strong>{{ backgroundAsset?.name || 'Transparent canvas' }}</strong>
          </div>
          <div class="document-summary">
            <span>Layers</span>
            <strong>{{ editor.document.layers.length }}</strong>
          </div>
          <Separator />
          <div class="effect-grid">
            <NumericSliderField label="Document blur" :model-value="editor.document.canvas.effects.blur" :min="0" :max="40" :step="1" @update:model-value="patchDocumentBlur" @commit="endContinuousEdit('document-effect-blur')" />
            <NumericSliderField label="Document brightness" :model-value="editor.document.canvas.effects.brightness" :min="-100" :max="100" :step="1" unit="%" @update:model-value="patchDocumentBrightness" @commit="endContinuousEdit('document-effect-brightness')" />
            <NumericSliderField label="Document contrast" :model-value="editor.document.canvas.effects.contrast" :min="-100" :max="100" :step="1" unit="%" @update:model-value="patchDocumentContrast" @commit="endContinuousEdit('document-effect-contrast')" />
            <NumericSliderField label="Document saturation" :model-value="editor.document.canvas.effects.saturation" :min="-100" :max="100" :step="1" unit="%" @update:model-value="patchDocumentSaturation" @commit="endContinuousEdit('document-effect-saturation')" />
          </div>
          <Separator />
          <ExportPanel
            v-model:export-scale="exportScale"
            v-model:export-format="exportFormat"
            v-model:export-quality="exportQuality"
            :is-exporting="isExporting"
            :export-log="exportLog"
            :export-progress="exportProgress"
            @export-image="$emit('exportImage')"
          />
        </div>
      </TabsContent>
    </Tabs>
  </aside>
</template>
