<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, FlipHorizontal, Italic, Strikethrough, Trash2, Underline } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import ExportPanel from '@/components/editor/ExportPanel.vue'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
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

defineProps<{
  isExporting?: boolean
  exportLog?: string
  exportProgress?: number
  activeTool?: EditorTool
}>()

defineEmits<{
  exportImage: []
}>()

const editor = useEditorStore()
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
const commonWidth = computed(() => commonLayerValue((layer) => layer.width, undefined))
const commonRotation = computed(() => commonLayerValue((layer) => layer.rotation, undefined))
const commonFlipX = computed(() => commonLayerValue((layer) => layer.flipX, undefined))
const brushOpacityPercent = computed(() => Math.round((commonBrushOpacity.value ?? editor.toolSettings.brushOpacity) * 100))
const eraserOpacityPercent = computed(() => Math.round((commonEraserOpacity.value ?? editor.toolSettings.eraserOpacity) * 100))
const brushOpacityLabel = computed(() => commonBrushOpacity.value === undefined ? 'Mixed' : `${Math.round(commonBrushOpacity.value * 100)}%`)
const eraserOpacityLabel = computed(() => commonEraserOpacity.value === undefined ? 'Mixed' : `${Math.round(commonEraserOpacity.value * 100)}%`)
const continuousEditTimers = new Map<string, number>()

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

function percentSliderValue(value: number[] | undefined, fallback: number) {
  return Math.max(0, Math.min(100, sliderValue(value, fallback)))
}

function patchBrushOpacitySlider(value: number[] | undefined) {
  patchBrushSettings({ brushOpacity: percentSliderValue(value, brushOpacityPercent.value) / 100 })
}

function patchEraserOpacitySlider(value: number[] | undefined) {
  patchBrushSettings({ eraserOpacity: percentSliderValue(value, eraserOpacityPercent.value) / 100 })
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

function sliderValue(value: number[] | undefined, fallback = 0) {
  return value?.[0] ?? fallback
}

function patchOpacity(value: number[] | undefined) {
  const key = 'layer-opacity'
  editor.patchSelectedLayersContinuous(key, { opacity: sliderValue(value, 100) / 100 })
  scheduleContinuousEditEnd(key)
}

function patchEffect(kind: 'blur' | 'brightness' | 'contrast' | 'saturation', value: number[] | undefined) {
  const key = `layer-effect-${kind}`
  editor.patchSelectedLayerEffectContinuous(key, kind, sliderValue(value))
  scheduleContinuousEditEnd(key)
}

function patchBlur(value: number[] | undefined) {
  patchEffect('blur', value)
}

function patchBrightness(value: number[] | undefined) {
  patchEffect('brightness', value)
}

function patchContrast(value: number[] | undefined) {
  patchEffect('contrast', value)
}

function patchSaturation(value: number[] | undefined) {
  patchEffect('saturation', value)
}

function patchDocumentEffect(kind: 'blur' | 'brightness' | 'contrast' | 'saturation', value: number[] | undefined) {
  const key = `document-effect-${kind}`
  editor.patchCanvasEffectContinuous(key, kind, sliderValue(value))
  scheduleContinuousEditEnd(key)
}

function patchDocumentBlur(value: number[] | undefined) {
  patchDocumentEffect('blur', value)
}

function patchDocumentBrightness(value: number[] | undefined) {
  patchDocumentEffect('brightness', value)
}

function patchDocumentContrast(value: number[] | undefined) {
  patchDocumentEffect('contrast', value)
}

function patchDocumentSaturation(value: number[] | undefined) {
  patchDocumentEffect('saturation', value)
}
</script>

<template>
  <aside class="right-rail">
    <Tabs default-value="inspect" class="rail-tabs">
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
            <label>
              X
              <Input type="number" :model-value="activeLayer.x" @update:model-value="(value) => editor.patchSelectedLayer({ x: Number(value) || 0 })" />
            </label>
            <label>
              Y
              <Input type="number" :model-value="activeLayer.y" @update:model-value="(value) => editor.patchSelectedLayer({ y: Number(value) || 0 })" />
            </label>
            <label>
              Rotation
              <Input
                type="number"
                :model-value="commonRotation ?? ''"
                placeholder="Mixed"
                @update:model-value="(value) => editor.patchSelectedLayers({ rotation: Number(value) || 0 })"
              />
            </label>
            <label>
              Width
              <Input type="number" :model-value="activeLayer.width" @update:model-value="(value) => editor.patchSelectedLayer({ width: Number(value) || 1 })" />
            </label>
            <label>
              Height
              <Input type="number" :model-value="activeLayer.height" @update:model-value="(value) => editor.patchSelectedLayer({ height: Number(value) || 1 })" />
            </label>
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
          <label>
            Opacity {{ Math.round(activeLayer.opacity * 100) }}%
              <Slider
                :model-value="[activeLayer.opacity * 100]"
                :max="100"
                :step="1"
                @update:model-value="patchOpacity"
                @value-commit="endContinuousEdit('layer-opacity')"
              />
          </label>
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
            <div class="two-col">
              <label>
                Font size
                <Input
                  type="number"
                  :model-value="commonFontSize ?? ''"
                  placeholder="Mixed"
                  @update:model-value="(value) => editor.patchSelectedLayers({ fontSize: Number(value) || 1 })"
                />
              </label>
              <label>
                Color
                <Input
                  :type="commonFill ? 'color' : 'text'"
                  :model-value="commonFill ?? ''"
                  placeholder="Mixed"
                  @update:model-value="(value) => editor.patchSelectedLayers({ fill: String(value) })"
                />
              </label>
            </div>
            <label>
              Line height
              <Input
                type="number"
                step="0.05"
                min="0.5"
                :model-value="commonLineHeight ?? ''"
                placeholder="Mixed"
                @update:model-value="(value) => editor.patchSelectedLayers({ lineHeight: Math.max(0.5, Number(value) || 1) })"
              />
            </label>
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
            <label v-if="allSelectedLines">
              Line length
              <Input
                type="number"
                min="12"
                step="1"
                :model-value="commonWidth ?? ''"
                placeholder="Mixed"
                @update:model-value="(value) => editor.patchSelectedLayers({ width: Math.max(12, Number(value) || 12) })"
              />
            </label>
            <label v-if="allSelectedRoundRects">
              Corner radius
              <Input
                type="number"
                min="0"
                step="1"
                :model-value="commonShapeCornerRadius ?? ''"
                placeholder="Mixed"
                @update:model-value="(value) => editor.patchSelectedLayers({ cornerRadius: Math.max(0, Number(value) || 0) })"
              />
            </label>
            <label>
              Stroke width
              <Input
                type="number"
                min="0"
                step="1"
                :model-value="commonShapeStrokeWidth ?? ''"
                placeholder="Mixed"
                @update:model-value="(value) => editor.patchSelectedLayers({ strokeWidth: Math.max(0, Number(value) || 0) })"
              />
            </label>
            <template v-if="allSelectedLines">
              <div class="two-col">
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
                <label>
                  Arrow size
                  <Input
                    type="number"
                    min="0.25"
                    step="0.25"
                    :model-value="commonLineArrowSize ?? ''"
                    placeholder="Mixed"
                    @update:model-value="(value) => editor.patchSelectedLayers({ lineArrowSize: Math.max(0.25, Number(value) || 1) })"
                  />
                </label>
              </div>
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
            <label>
              Blur {{ activeLayer.effects.blur }}
              <Slider
                :model-value="[activeLayer.effects.blur]"
                :max="40"
                :step="1"
                @update:model-value="patchBlur"
                @value-commit="endContinuousEdit('layer-effect-blur')"
              />
            </label>
            <label>
              Brightness {{ activeLayer.effects.brightness }}%
              <Slider
                :model-value="[activeLayer.effects.brightness]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="patchBrightness"
                @value-commit="endContinuousEdit('layer-effect-brightness')"
              />
            </label>
            <label>
              Contrast {{ activeLayer.effects.contrast }}%
              <Slider
                :model-value="[activeLayer.effects.contrast]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="patchContrast"
                @value-commit="endContinuousEdit('layer-effect-contrast')"
              />
            </label>
            <label>
              Saturation {{ activeLayer.effects.saturation }}%
              <Slider
                :model-value="[activeLayer.effects.saturation]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="patchSaturation"
                @value-commit="endContinuousEdit('layer-effect-saturation')"
              />
            </label>
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
          <div class="two-col">
            <label>
              Brush width
              <Input
                type="number"
                min="1"
                step="1"
                :model-value="commonBrushWidth ?? ''"
                placeholder="Mixed"
                @update:model-value="(value) => patchBrushSettings({ brushWidth: Math.max(1, Number(value) || 1) })"
              />
            </label>
            <label>
              Eraser width
              <Input
                type="number"
                min="1"
                step="1"
                :model-value="commonEraserWidth ?? ''"
                placeholder="Mixed"
                @update:model-value="(value) => patchBrushSettings({ eraserWidth: Math.max(1, Number(value) || 1) })"
              />
            </label>
          </div>
          <label>
            Tension
            <Input
              type="number"
              min="0"
              max="1"
              step="0.05"
              :model-value="commonBrushTension ?? ''"
              placeholder="Mixed"
              @update:model-value="(value) => patchBrushSettings({ brushTension: Math.max(0, Math.min(1, Number(value) || 0)) })"
            />
          </label>
          <label>
            Brush opacity {{ brushOpacityLabel }}
            <Slider
              :model-value="[brushOpacityPercent]"
              :min="0"
              :max="100"
              :step="1"
              @update:model-value="patchBrushOpacitySlider"
            />
          </label>
          <label>
            Eraser opacity {{ eraserOpacityLabel }}
            <Slider
              :model-value="[eraserOpacityPercent]"
              :min="0"
              :max="100"
              :step="1"
              @update:model-value="patchEraserOpacitySlider"
            />
          </label>
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
          <div class="two-col">
            <label>
              Width
              <Input
                type="number"
                :model-value="editor.document.canvas.width"
                @update:model-value="(value) => editor.patchCanvas({ width: Number(value) || 1 })"
              />
            </label>
            <label>
              Height
              <Input
                type="number"
                :model-value="editor.document.canvas.height"
                @update:model-value="(value) => editor.patchCanvas({ height: Number(value) || 1 })"
              />
            </label>
          </div>
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
            <label>
              Document blur {{ editor.document.canvas.effects.blur }}
              <Slider
                :model-value="[editor.document.canvas.effects.blur]"
                :max="40"
                :step="1"
                @update:model-value="patchDocumentBlur"
                @value-commit="endContinuousEdit('document-effect-blur')"
              />
            </label>
            <label>
              Document brightness {{ editor.document.canvas.effects.brightness }}%
              <Slider
                :model-value="[editor.document.canvas.effects.brightness]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="patchDocumentBrightness"
                @value-commit="endContinuousEdit('document-effect-brightness')"
              />
            </label>
            <label>
              Document contrast {{ editor.document.canvas.effects.contrast }}%
              <Slider
                :model-value="[editor.document.canvas.effects.contrast]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="patchDocumentContrast"
                @value-commit="endContinuousEdit('document-effect-contrast')"
              />
            </label>
            <label>
              Document saturation {{ editor.document.canvas.effects.saturation }}%
              <Slider
                :model-value="[editor.document.canvas.effects.saturation]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="patchDocumentSaturation"
                @value-commit="endContinuousEdit('document-effect-saturation')"
              />
            </label>
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
