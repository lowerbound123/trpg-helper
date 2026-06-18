<script setup lang="ts">
import { computed } from 'vue'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Download, Eye, Italic, Strikethrough, Trash2, Underline } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { isTextLayer, useEditorStore } from '@/stores/editor'

const exportScale = defineModel<number>('exportScale', { required: true })

defineProps<{
  isExporting?: boolean
  exportLog?: string
  exportProgress?: number
}>()

defineEmits<{
  exportImage: []
}>()

const editor = useEditorStore()
const backgroundAsset = computed(() =>
  editor.resolveBackground(editor.document.canvas.backgroundAssetId)
    || editor.resolveAsset(editor.document.canvas.backgroundAssetId),
)

function setFont(fontId: string) {
  const font = editor.resolveFont(fontId)
  editor.patchSelectedLayer({
    fontId,
    fontFamily: font?.name.replace(/\.[^.]+$/, '') || 'Inter',
  })
}

function deleteLayer() {
  editor.deleteSelectedLayer()
}

function patchTextDecoration(kind: 'underline' | 'strikethrough', value: boolean) {
  editor.patchSelectedLayer({ [kind]: value })
}

function sliderValue(value: number[] | undefined, fallback = 0) {
  return value?.[0] ?? fallback
}

function patchOpacity(value: number[] | undefined) {
  editor.patchSelectedLayer({ opacity: sliderValue(value, 100) / 100 })
}

function patchEffect(kind: 'blur' | 'brightness' | 'contrast' | 'saturation', value: number[] | undefined) {
  if (!editor.selectedLayer) return
  editor.patchSelectedLayer({
    effects: {
      ...editor.selectedLayer.effects,
      [kind]: sliderValue(value),
    },
  })
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
  editor.patchCanvas({
    effects: {
      ...editor.document.canvas.effects,
      [kind]: sliderValue(value),
    },
  })
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
        <TabsTrigger value="document">Doc Type</TabsTrigger>
        <TabsTrigger value="export">Export</TabsTrigger>
      </TabsList>

      <TabsContent value="inspect" class="rail-tab-content">
        <div v-if="editor.selectedLayer" class="panel-stack inspector-panel">
          <label>
            Name
            <Input :model-value="editor.selectedLayer.name" @update:model-value="(value) => editor.patchSelectedLayer({ name: String(value) })" />
          </label>
          <div class="two-col">
            <label>
              X
              <Input type="number" :model-value="editor.selectedLayer.x" @update:model-value="(value) => editor.patchSelectedLayer({ x: Number(value) || 0 })" />
            </label>
            <label>
              Y
              <Input type="number" :model-value="editor.selectedLayer.y" @update:model-value="(value) => editor.patchSelectedLayer({ y: Number(value) || 0 })" />
            </label>
          </div>
          <div class="two-col">
            <label>
              Width
              <Input type="number" :model-value="editor.selectedLayer.width" @update:model-value="(value) => editor.patchSelectedLayer({ width: Number(value) || 1 })" />
            </label>
            <label>
              Height
              <Input type="number" :model-value="editor.selectedLayer.height" @update:model-value="(value) => editor.patchSelectedLayer({ height: Number(value) || 1 })" />
            </label>
          </div>
          <label>
            Opacity {{ Math.round(editor.selectedLayer.opacity * 100) }}%
              <Slider
                :model-value="[editor.selectedLayer.opacity * 100]"
                :max="100"
                :step="1"
                @update:model-value="patchOpacity"
              />
          </label>
          <label>
            Blend mode
            <Select :model-value="editor.selectedLayer.blendMode" @update:model-value="(value) => editor.patchSelectedLayer({ blendMode: value as any })">
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
          <template v-if="isTextLayer(editor.selectedLayer)">
            <label>
              Text
              <Textarea :model-value="editor.selectedLayer.text" @update:model-value="(value) => editor.patchSelectedLayer({ text: String(value) })" />
            </label>
            <div class="two-col">
              <label>
                Font size
                <Input type="number" :model-value="editor.selectedLayer.fontSize" @update:model-value="(value) => editor.patchSelectedLayer({ fontSize: Number(value) || 1 })" />
              </label>
              <label>
                Color
                <Input type="color" :model-value="editor.selectedLayer.fill" @update:model-value="(value) => editor.patchSelectedLayer({ fill: String(value) })" />
              </label>
            </div>
            <label>
              Line height
              <Input
                type="number"
                step="0.05"
                min="0.5"
                :model-value="editor.selectedLayer.lineHeight"
                @update:model-value="(value) => editor.patchSelectedLayer({ lineHeight: Math.max(0.5, Number(value) || 1) })"
              />
            </label>
            <div class="icon-button-grid">
              <Button
                size="icon"
                variant="outline"
                :data-active="editor.selectedLayer.align === 'left'"
                @click="editor.patchSelectedLayer({ align: 'left' })"
              >
                <AlignLeft />
              </Button>
              <Button
                size="icon"
                variant="outline"
                :data-active="editor.selectedLayer.align === 'center'"
                @click="editor.patchSelectedLayer({ align: 'center' })"
              >
                <AlignCenter />
              </Button>
              <Button
                size="icon"
                variant="outline"
                :data-active="editor.selectedLayer.align === 'right'"
                @click="editor.patchSelectedLayer({ align: 'right' })"
              >
                <AlignRight />
              </Button>
              <Button
                size="icon"
                variant="outline"
                :data-active="editor.selectedLayer.align === 'justify'"
                @click="editor.patchSelectedLayer({ align: 'justify' })"
              >
                <AlignJustify />
              </Button>
            </div>
            <div class="icon-button-grid">
              <Button
                size="icon"
                variant="outline"
                :data-active="editor.selectedLayer.fontWeight >= 700"
                @click="editor.patchSelectedLayer({ fontWeight: editor.selectedLayer.fontWeight >= 700 ? 400 : 700 })"
              >
                <Bold />
              </Button>
              <Button
                size="icon"
                variant="outline"
                :data-active="editor.selectedLayer.italic"
                @click="editor.patchSelectedLayer({ italic: !editor.selectedLayer.italic })"
              >
                <Italic />
              </Button>
              <Button
                size="icon"
                variant="outline"
                :data-active="editor.selectedLayer.underline"
                @click="patchTextDecoration('underline', !editor.selectedLayer.underline)"
              >
                <Underline />
              </Button>
              <Button
                size="icon"
                variant="outline"
                :data-active="editor.selectedLayer.strikethrough"
                @click="patchTextDecoration('strikethrough', !editor.selectedLayer.strikethrough)"
              >
                <Strikethrough />
              </Button>
            </div>
            <label>
              Font
              <Select :model-value="editor.selectedLayer.fontId" @update:model-value="(value) => setFont(String(value))">
                <SelectTrigger><SelectValue :placeholder="editor.selectedLayer.fontFamily" /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="font in editor.library.fonts" :key="font.id" :value="font.id">
                    {{ font.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
          </template>
          <Separator />
          <div class="effect-grid">
            <label>
              Blur {{ editor.selectedLayer.effects.blur }}
              <Slider
                :model-value="[editor.selectedLayer.effects.blur]"
                :max="40"
                :step="1"
                @update:model-value="patchBlur"
              />
            </label>
            <label>
              Brightness {{ editor.selectedLayer.effects.brightness }}
              <Slider
                :model-value="[editor.selectedLayer.effects.brightness]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="patchBrightness"
              />
            </label>
            <label>
              Contrast {{ editor.selectedLayer.effects.contrast }}
              <Slider
                :model-value="[editor.selectedLayer.effects.contrast]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="patchContrast"
              />
            </label>
            <label>
              Saturation {{ editor.selectedLayer.effects.saturation }}
              <Slider
                :model-value="[editor.selectedLayer.effects.saturation]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="patchSaturation"
              />
            </label>
          </div>
          <div class="danger-row">
            <Button variant="outline" @click="editor.patchSelectedLayer({ visible: !editor.selectedLayer.visible })">
              <Eye data-icon="inline-start" />
              Toggle
            </Button>
            <Button variant="destructive" @click="deleteLayer">
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </div>
        </div>
        <div v-else class="empty-inspector">Select a layer on the canvas or in the layer list.</div>
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
              />
            </label>
            <label>
              Document brightness {{ editor.document.canvas.effects.brightness }}
              <Slider
                :model-value="[editor.document.canvas.effects.brightness]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="patchDocumentBrightness"
              />
            </label>
            <label>
              Document contrast {{ editor.document.canvas.effects.contrast }}
              <Slider
                :model-value="[editor.document.canvas.effects.contrast]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="patchDocumentContrast"
              />
            </label>
            <label>
              Document saturation {{ editor.document.canvas.effects.saturation }}
              <Slider
                :model-value="[editor.document.canvas.effects.saturation]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="patchDocumentSaturation"
              />
            </label>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="export" class="rail-tab-content">
        <div class="panel-stack inspector-panel">
          <label>
            Export scale
            <Input
              type="number"
              min="0.1"
              step="0.25"
              :model-value="exportScale"
              @update:model-value="(value) => (exportScale = Math.max(0.1, Number(value) || 1))"
            />
          </label>
          <Button variant="outline" :disabled="isExporting" @click="$emit('exportImage')">
            <Download data-icon="inline-start" />
            {{ isExporting ? 'Exporting...' : 'Export PNG' }}
          </Button>
          <div class="export-progress" role="progressbar" :aria-valuenow="exportProgress || 0" aria-valuemin="0" aria-valuemax="100">
            <div class="export-progress-track">
              <span :style="{ width: `${exportProgress || 0}%` }" />
            </div>
            <strong>{{ Math.round(exportProgress || 0) }}%</strong>
          </div>
          <div class="export-log">
            {{ exportLog || 'No export yet.' }}
          </div>
        </div>
      </TabsContent>
    </Tabs>
  </aside>
</template>
