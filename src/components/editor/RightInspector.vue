<script setup lang="ts">
import { computed } from 'vue'
import { Download, Eye, Trash2 } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { isTextLayer, useEditorStore } from '@/stores/editor'

const exportPath = defineModel<string>('exportPath', { required: true })
const exportScale = defineModel<number>('exportScale', { required: true })

defineEmits<{
  exportImage: []
}>()

const editor = useEditorStore()
const backgroundAsset = computed(() => editor.resolveBackground(editor.document.canvas.backgroundAssetId))

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
              @update:model-value="(value) => editor.patchSelectedLayer({ opacity: ((value?.[0] ?? 100) as number) / 100 })"
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
                @update:model-value="(value) => editor.patchSelectedLayer({ effects: { ...editor.selectedLayer!.effects, blur: (value?.[0] ?? 0) as number } })"
              />
            </label>
            <label>
              Brightness {{ editor.selectedLayer.effects.brightness }}
              <Slider
                :model-value="[editor.selectedLayer.effects.brightness]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="(value) => editor.patchSelectedLayer({ effects: { ...editor.selectedLayer!.effects, brightness: (value?.[0] ?? 0) as number } })"
              />
            </label>
            <label>
              Contrast {{ editor.selectedLayer.effects.contrast }}
              <Slider
                :model-value="[editor.selectedLayer.effects.contrast]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="(value) => editor.patchSelectedLayer({ effects: { ...editor.selectedLayer!.effects, contrast: (value?.[0] ?? 0) as number } })"
              />
            </label>
            <label>
              Saturation {{ editor.selectedLayer.effects.saturation }}
              <Slider
                :model-value="[editor.selectedLayer.effects.saturation]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="(value) => editor.patchSelectedLayer({ effects: { ...editor.selectedLayer!.effects, saturation: (value?.[0] ?? 0) as number } })"
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
        </div>
      </TabsContent>

      <TabsContent value="export" class="rail-tab-content">
        <div class="panel-stack inspector-panel">
          <Input v-model="exportPath" placeholder="/path/to/output.png" />
          <label>
            Export scale {{ exportScale }}x
            <Slider
              :model-value="[exportScale]"
              :min="0.25"
              :max="4"
              :step="0.25"
              @update:model-value="(value) => (exportScale = (value?.[0] ?? 1) as number)"
            />
          </label>
          <Button @click="$emit('exportImage')">
            <Download data-icon="inline-start" />
            Export PNG/JPEG
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  </aside>
</template>
