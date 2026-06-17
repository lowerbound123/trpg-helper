<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import type Konva from 'konva'
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Layers,
  Redo2,
  Save,
  Trash2,
  Type,
  Undo2,
  Upload,
} from '@lucide/vue'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { exportImage, fileUrl, type LibraryRecord } from '@/lib/backend'
import type { HandoutLayer, ImageLayer, TextLayer } from '@/lib/handout'
import { isImageLayer, isTextLayer, useEditorStore } from '@/stores/editor'

const editor = useEditorStore()
const stageRef = ref<{ getNode: () => Konva.Stage }>()
const transformerRef = ref<{ getNode: () => Konva.Transformer }>()
const layerNodeRefs = reactive<Record<string, { getNode: () => Konva.Node } | undefined>>({})
const imageElements = reactive<Record<string, HTMLImageElement>>({})
const assetSearch = ref('')
const fontSearch = ref('')
const assetTags = ref('')
const fontTags = ref('')
const projectPathInput = ref('')
const exportPathInput = ref('')

const stageScale = computed(() => {
  const maxWidth = 920
  const maxHeight = 620
  return Math.min(
    maxWidth / editor.document.canvas.width,
    maxHeight / editor.document.canvas.height,
    1,
  )
})

const stageConfig = computed(() => ({
  width: editor.document.canvas.width * stageScale.value,
  height: editor.document.canvas.height * stageScale.value,
  scaleX: stageScale.value,
  scaleY: stageScale.value,
}))

const backgroundAsset = computed(() => editor.resolveAsset(editor.document.canvas.backgroundAssetId))
const backgroundImage = computed(() =>
  backgroundAsset.value ? imageElements[backgroundAsset.value.id] : undefined,
)

const filteredAssets = computed(() => {
  const query = assetSearch.value.trim().toLowerCase()
  if (!query) return editor.library.assets
  return editor.library.assets.filter((asset) =>
    [asset.name, ...asset.tags].some((part) => part.toLowerCase().includes(query)),
  )
})

const filteredFonts = computed(() => {
  const query = fontSearch.value.trim().toLowerCase()
  if (!query) return editor.library.fonts
  return editor.library.fonts.filter((font) =>
    [font.name, ...font.tags].some((part) => part.toLowerCase().includes(query)),
  )
})

function layerName(layer: HandoutLayer) {
  if (isTextLayer(layer)) return layer.text || layer.name
  return layer.name
}

function imageForLayer(layer: ImageLayer) {
  const asset = editor.resolveAsset(layer.assetId)
  return asset ? imageElements[asset.id] : undefined
}

function loadImage(record: LibraryRecord) {
  if (imageElements[record.id]) return
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = fileUrl(record.path)
  image.onload = () => {
    imageElements[record.id] = image
  }
}

function syncImages() {
  editor.library.assets.forEach(loadImage)
}

function layerConfig(layer: HandoutLayer) {
  return {
    id: layer.id,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    draggable: !layer.locked,
    globalCompositeOperation: layer.blendMode,
    blurRadius: layer.effects.blur,
    brightness: layer.effects.brightness / 100,
    contrast: layer.effects.contrast,
    saturation: layer.effects.saturation / 100,
  }
}

function textConfig(layer: TextLayer) {
  return {
    ...layerConfig(layer),
    text: layer.text,
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontStyle: `${layer.fontWeight}`,
    fill: layer.fill,
    align: layer.align,
    lineHeight: layer.lineHeight,
    verticalAlign: 'top',
  }
}

function onTransformEnd(layer: HandoutLayer) {
  const node = layerNodeRefs[layer.id]?.getNode()
  if (!node) return

  const scaleX = node.scaleX()
  const scaleY = node.scaleY()
  node.scaleX(1)
  node.scaleY(1)

  editor.patchLayer(layer.id, {
    x: Math.round(node.x()),
    y: Math.round(node.y()),
    width: Math.max(12, Math.round(node.width() * scaleX)),
    height: Math.max(12, Math.round(node.height() * scaleY)),
    rotation: Math.round(node.rotation()),
  })
}

function onDragEnd(layer: HandoutLayer) {
  const node = layerNodeRefs[layer.id]?.getNode()
  if (!node) return
  editor.patchLayer(layer.id, {
    x: Math.round(node.x()),
    y: Math.round(node.y()),
  })
}

async function updateTransformer() {
  await nextTick()
  const transformer = transformerRef.value?.getNode()
  if (!transformer) return
  const selected = editor.selectedLayerId
    ? layerNodeRefs[editor.selectedLayerId]?.getNode()
    : undefined
  transformer.nodes(selected ? [selected] : [])
  transformer.getLayer()?.batchDraw()
}

async function handleAssetInput(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  await editor.importAssetFile(file, assetTags.value)
  assetTags.value = ''
  syncImages()
  ;(event.target as HTMLInputElement).value = ''
}

async function handleFontInput(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  await editor.importFontFile(file, fontTags.value)
  fontTags.value = ''
  ;(event.target as HTMLInputElement).value = ''
}

async function openProject() {
  if (!projectPathInput.value.trim()) return
  await editor.openProjectFromPath(projectPathInput.value)
}

async function saveProject() {
  const saved = await editor.saveCurrentProject()
  if (!saved) return
}

async function exportCurrentImage() {
  const path = exportPathInput.value.trim()
  const stage = stageRef.value?.getNode()
  if (!path || !stage) return
  const dataUrl = stage.toDataURL({
    pixelRatio: 1 / stageScale.value,
    mimeType: path.toLowerCase().endsWith('.jpg') || path.toLowerCase().endsWith('.jpeg')
      ? 'image/jpeg'
      : 'image/png',
  })
  await exportImage(path, dataUrl)
  editor.status = `Exported image to ${path}`
}

function setFont(fontId: string) {
  const font = editor.resolveFont(fontId)
  editor.patchSelectedLayer({
    fontId,
    fontFamily: font?.name.replace(/\.[^.]+$/, '') || 'Inter',
  })
}

onMounted(async () => {
  try {
    await editor.refreshLibrary()
    syncImages()
  } catch (error) {
    editor.status = String(error)
  }
})

watch(() => editor.library.assets, syncImages, { deep: true })
watch(() => editor.selectedLayerId, updateTransformer)
watch(() => editor.document.layers, updateTransformer, { deep: true })
</script>

<template>
  <div class="app-shell">
    <aside class="left-rail">
      <div class="brand-strip">
        <div>
          <h1>Handout Generator</h1>
          <p>Single-page canvas editor</p>
        </div>
      </div>

      <Tabs default-value="assets" class="rail-tabs">
        <TabsList class="grid grid-cols-3">
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="fonts">Fonts</TabsTrigger>
          <TabsTrigger value="layers">Layers</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" class="rail-tab-content">
          <div class="import-row">
            <Input v-model="assetTags" placeholder="tags: paper, clue" />
            <Button as="label" size="sm" variant="outline">
              <Upload data-icon="inline-start" />
              Import
              <input class="sr-only" type="file" accept="image/*" @change="handleAssetInput" />
            </Button>
          </div>
          <Input v-model="assetSearch" placeholder="Search assets or tags" />
          <ScrollArea class="rail-scroll">
            <button
              v-for="asset in filteredAssets"
              :key="asset.id"
              class="asset-row"
              type="button"
              @click="editor.addLayerFromAsset(asset)"
            >
              <span class="asset-thumb">
                <img v-if="fileUrl(asset.path)" :src="fileUrl(asset.path)" alt="" />
              </span>
              <span class="asset-meta">
                <strong>{{ asset.name }}</strong>
                <span>{{ asset.tags.join(', ') || 'No tags' }}</span>
              </span>
            </button>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="fonts" class="rail-tab-content">
          <div class="import-row">
            <Input v-model="fontTags" placeholder="tags: serif, title" />
            <Button as="label" size="sm" variant="outline">
              <Upload data-icon="inline-start" />
              Import
              <input
                class="sr-only"
                type="file"
                accept=".ttf,.otf,.woff,.woff2,font/*"
                @change="handleFontInput"
              />
            </Button>
          </div>
          <Input v-model="fontSearch" placeholder="Search fonts or tags" />
          <ScrollArea class="rail-scroll">
            <div v-for="font in filteredFonts" :key="font.id" class="font-row">
              <strong>{{ font.name }}</strong>
              <span>{{ font.tags.join(', ') || 'No tags' }}</span>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="layers" class="rail-tab-content">
          <div class="layer-actions">
            <Button size="sm" variant="outline" @click="editor.addText()">
              <Type data-icon="inline-start" />
              Text
            </Button>
            <Button size="sm" variant="outline" @click="editor.moveSelectedLayer(1)">
              <ArrowUp data-icon="inline-start" />
              Up
            </Button>
            <Button size="sm" variant="outline" @click="editor.moveSelectedLayer(-1)">
              <ArrowDown data-icon="inline-start" />
              Down
            </Button>
          </div>
          <ScrollArea class="rail-scroll">
            <button
              v-for="layer in editor.layers"
              :key="layer.id"
              class="layer-row"
              :class="{ selected: editor.selectedLayerId === layer.id }"
              type="button"
              @click="editor.selectLayer(layer.id)"
            >
              <Layers class="layer-icon" />
              <span>
                <strong>{{ layerName(layer) }}</strong>
                <em>{{ layer.type }} · z{{ layer.zIndex }}</em>
              </span>
              <Eye v-if="layer.visible" class="layer-state" />
              <EyeOff v-else class="layer-state" />
            </button>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div class="project-fields">
          <Input
            v-model="projectPathInput"
            placeholder="/path/to/project-folder"
            @change="editor.projectDir = projectPathInput"
          />
          <Button variant="outline" @click="openProject">
            <FolderOpen data-icon="inline-start" />
            Open
          </Button>
          <Button @click="saveProject">
            <Save data-icon="inline-start" />
            Save
          </Button>
        </div>
        <Separator orientation="vertical" />
        <div class="topbar-actions">
          <Button variant="outline" :disabled="!editor.canUndo" @click="editor.undo()">
            <Undo2 data-icon="inline-start" />
            Undo
          </Button>
          <Button variant="outline" :disabled="!editor.canRedo" @click="editor.redo()">
            <Redo2 data-icon="inline-start" />
            Redo
          </Button>
        </div>
      </header>

      <section class="canvas-wrap">
        <div class="canvas-meta">
          <Badge variant="secondary">{{ editor.document.canvas.width }} x {{ editor.document.canvas.height }} px</Badge>
          <Badge variant="outline">{{ Math.round(stageScale * 100) }}%</Badge>
          <span>{{ editor.status }}</span>
        </div>

        <div class="stage-frame">
          <v-stage ref="stageRef" :config="stageConfig" @mousedown="editor.selectLayer(undefined)">
            <v-layer>
              <v-rect
                :config="{
                  x: 0,
                  y: 0,
                  width: editor.document.canvas.width,
                  height: editor.document.canvas.height,
                  fill: editor.document.canvas.backgroundColor,
                }"
              />
              <v-image
                v-if="backgroundImage"
                :config="{
                  image: backgroundImage,
                  x: 0,
                  y: 0,
                  width: editor.document.canvas.width,
                  height: editor.document.canvas.height,
                  listening: false,
                }"
              />
              <template v-for="layer in editor.document.layers" :key="layer.id">
                <v-image
                  v-if="isImageLayer(layer) && imageForLayer(layer)"
                  :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as any)"
                  :config="{ ...layerConfig(layer), image: imageForLayer(layer) }"
                  @mousedown.stop="editor.selectLayer(layer.id)"
                  @dragend="onDragEnd(layer)"
                  @transformend="onTransformEnd(layer)"
                />
                <v-text
                  v-else-if="isTextLayer(layer)"
                  :ref="(node: unknown) => (layerNodeRefs[layer.id] = node as any)"
                  :config="textConfig(layer)"
                  @mousedown.stop="editor.selectLayer(layer.id)"
                  @dragend="onDragEnd(layer)"
                  @transformend="onTransformEnd(layer)"
                />
              </template>
              <v-transformer
                ref="transformerRef"
                :config="{
                  rotateEnabled: true,
                  ignoreStroke: true,
                  boundBoxFunc: (_oldBox: unknown, newBox: { width: number; height: number }) =>
                    newBox.width < 12 || newBox.height < 12 ? _oldBox : newBox,
                }"
              />
            </v-layer>
          </v-stage>
        </div>
      </section>
    </main>

    <aside class="inspector">
      <Card>
        <CardHeader>
          <CardTitle>Document</CardTitle>
        </CardHeader>
        <CardContent class="panel-stack">
          <label>
            Title
            <Input
              :model-value="editor.document.title"
              @update:model-value="(value) => editor.replaceDocument({ ...editor.document, title: String(value) })"
            />
          </label>
          <div class="two-col">
            <label>
              Width
              <Input
                type="number"
                :model-value="editor.document.canvas.width"
                @update:model-value="
                  (value) =>
                    editor.replaceDocument({
                      ...editor.document,
                      canvas: { ...editor.document.canvas, width: Number(value) || 1 },
                    })
                "
              />
            </label>
            <label>
              Height
              <Input
                type="number"
                :model-value="editor.document.canvas.height"
                @update:model-value="
                  (value) =>
                    editor.replaceDocument({
                      ...editor.document,
                      canvas: { ...editor.document.canvas, height: Number(value) || 1 },
                    })
                "
              />
            </label>
          </div>
          <label>
            Background asset
            <Select
              :model-value="editor.document.canvas.backgroundAssetId"
              @update:model-value="
                (value) => editor.setBackground(editor.library.assets.find((asset) => asset.id === value))
              "
            >
              <SelectTrigger>
                <SelectValue placeholder="No background" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="asset in editor.library.assets" :key="asset.id" :value="asset.id">
                  {{ asset.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inspector</CardTitle>
        </CardHeader>
        <CardContent v-if="editor.selectedLayer" class="panel-stack">
          <label>
            Name
            <Input
              :model-value="editor.selectedLayer.name"
              @update:model-value="(value) => editor.patchSelectedLayer({ name: String(value) })"
            />
          </label>

          <div class="two-col">
            <label>
              X
              <Input
                type="number"
                :model-value="editor.selectedLayer.x"
                @update:model-value="(value) => editor.patchSelectedLayer({ x: Number(value) || 0 })"
              />
            </label>
            <label>
              Y
              <Input
                type="number"
                :model-value="editor.selectedLayer.y"
                @update:model-value="(value) => editor.patchSelectedLayer({ y: Number(value) || 0 })"
              />
            </label>
          </div>

          <div class="two-col">
            <label>
              Width
              <Input
                type="number"
                :model-value="editor.selectedLayer.width"
                @update:model-value="(value) => editor.patchSelectedLayer({ width: Number(value) || 1 })"
              />
            </label>
            <label>
              Height
              <Input
                type="number"
                :model-value="editor.selectedLayer.height"
                @update:model-value="(value) => editor.patchSelectedLayer({ height: Number(value) || 1 })"
              />
            </label>
          </div>

          <label>
            Opacity {{ Math.round(editor.selectedLayer.opacity * 100) }}%
            <Slider
              :model-value="[editor.selectedLayer.opacity * 100]"
              :max="100"
              :step="1"
              @update:model-value="
                (value) => editor.patchSelectedLayer({ opacity: ((value?.[0] ?? 100) as number) / 100 })
              "
            />
          </label>

          <label>
            Blend mode
            <Select
              :model-value="editor.selectedLayer.blendMode"
              @update:model-value="(value) => editor.patchSelectedLayer({ blendMode: value as any })"
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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
              <Textarea
                :model-value="editor.selectedLayer.text"
                @update:model-value="(value) => editor.patchSelectedLayer({ text: String(value) })"
              />
            </label>
            <div class="two-col">
              <label>
                Font size
                <Input
                  type="number"
                  :model-value="editor.selectedLayer.fontSize"
                  @update:model-value="(value) => editor.patchSelectedLayer({ fontSize: Number(value) || 1 })"
                />
              </label>
              <label>
                Color
                <Input
                  type="color"
                  :model-value="editor.selectedLayer.fill"
                  @update:model-value="(value) => editor.patchSelectedLayer({ fill: String(value) })"
                />
              </label>
            </div>
            <label>
              Font
              <Select :model-value="editor.selectedLayer.fontId" @update:model-value="(value) => setFont(String(value))">
                <SelectTrigger>
                  <SelectValue :placeholder="editor.selectedLayer.fontFamily" />
                </SelectTrigger>
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
                @update:model-value="
                  (value) =>
                    editor.patchSelectedLayer({
                      effects: { ...editor.selectedLayer!.effects, blur: (value?.[0] ?? 0) as number },
                    })
                "
              />
            </label>
            <label>
              Brightness {{ editor.selectedLayer.effects.brightness }}
              <Slider
                :model-value="[editor.selectedLayer.effects.brightness]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="
                  (value) =>
                    editor.patchSelectedLayer({
                      effects: { ...editor.selectedLayer!.effects, brightness: (value?.[0] ?? 0) as number },
                    })
                "
              />
            </label>
            <label>
              Contrast {{ editor.selectedLayer.effects.contrast }}
              <Slider
                :model-value="[editor.selectedLayer.effects.contrast]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="
                  (value) =>
                    editor.patchSelectedLayer({
                      effects: { ...editor.selectedLayer!.effects, contrast: (value?.[0] ?? 0) as number },
                    })
                "
              />
            </label>
            <label>
              Saturation {{ editor.selectedLayer.effects.saturation }}
              <Slider
                :model-value="[editor.selectedLayer.effects.saturation]"
                :min="-100"
                :max="100"
                :step="1"
                @update:model-value="
                  (value) =>
                    editor.patchSelectedLayer({
                      effects: { ...editor.selectedLayer!.effects, saturation: (value?.[0] ?? 0) as number },
                    })
                "
              />
            </label>
          </div>

          <div class="danger-row">
            <Button variant="outline" @click="editor.patchSelectedLayer({ visible: !editor.selectedLayer.visible })">
              <Eye data-icon="inline-start" />
              Toggle
            </Button>
            <Button variant="destructive" @click="editor.deleteSelectedLayer()">
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </div>
        </CardContent>
        <CardContent v-else class="empty-inspector">
          Select a layer on the canvas or in the layer list.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
        </CardHeader>
        <CardContent class="panel-stack">
          <Input v-model="exportPathInput" placeholder="/path/to/output.png" />
          <Button @click="exportCurrentImage">
            <Download data-icon="inline-start" />
            Export PNG/JPEG
          </Button>
        </CardContent>
      </Card>
    </aside>
  </div>
</template>
