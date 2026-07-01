<script setup lang="ts">
import type { Ref } from 'vue'
import { inject } from 'vue'
import { ArrowDown, ArrowLeft, ArrowUp, Brush, ChevronDown, ChevronRight, Eye, EyeOff, Layers, Trash2, Type } from '@lucide/vue'
import { VueFinder } from 'vuefinder'
import 'vuefinder/dist/vuefinder.css'

import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEditorStore } from '@/stores/editor'
import type { LibraryRecord } from '@/lib/backend'
import { shapeItems } from '@/lib/shape-items'
import { shapePreviewPoints } from '@/lib/shape-rendering'

const editor = useEditorStore()

const ctx = inject<Record<string, any>>('left-rail-context')!

const activeRailTab = ctx.activeRailTab as Ref<string>
const assetSearch = ctx.assetSearch as Ref<string>
const fontSearch = ctx.fontSearch as Ref<string>
const maskFeatureEnabled = ctx.maskFeatureEnabled as boolean
const finderRevision = ctx.finderRevision as Record<string, number>
const finderUploadConfig = ctx.finderUploadConfig as Record<string, any>
const finderDrivers = ctx.finderDrivers as Record<string, any>
const finderFeaturesForKind = ctx.finderFeaturesForKind as (kind: string) => any
const handleFinderFileDoubleClick = ctx.handleFinderFileDoubleClick as (kind: string, event: unknown) => void
const handleFinderPathChange = ctx.handleFinderPathChange as (kind: string, path: string) => void
const handleDirectFinderDrop = ctx.handleDirectFinderDrop as (kind: string, event: DragEvent) => void
const handleDirectFinderDragover = ctx.handleDirectFinderDragover as (kind: string, event: DragEvent) => void
const filteredAssets = ctx.filteredAssets as LibraryRecord[]
const filteredFonts = ctx.filteredFonts as LibraryRecord[]
const previewUrl = ctx.previewUrl as (record: LibraryRecord) => string | undefined
const fontPreviewSource = ctx.fontPreviewSource as (font: LibraryRecord) => string | undefined
const fontFamily = ctx.fontFamily as (font: LibraryRecord) => string
const addAssetToCanvas = ctx.addAssetToCanvas as (asset: LibraryRecord) => void
const addFontTextToCanvas = ctx.addFontTextToCanvas as (font: LibraryRecord) => void
const addShapeToCanvas = ctx.addShapeToCanvas as (shape: string) => void
const startPolygonCreation = ctx.startPolygonCreation as () => void
const startAssetDrag = ctx.startAssetDrag as (asset: LibraryRecord, event: DragEvent) => void
const clearAssetDrag = ctx.clearAssetDrag as () => void
const startFontDrag = ctx.startFontDrag as (font: LibraryRecord, event: DragEvent) => void
const clearFontDrag = ctx.clearFontDrag as () => void
const startShapeDrag = ctx.startShapeDrag as (shape: string, event: DragEvent) => void
const clearShapeDrag = ctx.clearShapeDrag as () => void
const layerListItems = ctx.layerListItems as any[]
const draggedLayerId = ctx.draggedLayerId as Ref<string>
const draggedGroupId = ctx.draggedGroupId as Ref<string>
const startLayerListDrag = ctx.startLayerListDrag as (layer: any, event: DragEvent) => void
const startGroupListDrag = ctx.startGroupListDrag as (group: any, event: DragEvent) => void
const handleLayerListDrop = ctx.handleLayerListDrop as (layer: any, event: DragEvent) => void
const handleGroupDrop = ctx.handleGroupDrop as (group: any, event: DragEvent) => void
const clearLayerDragState = ctx.clearLayerDragState as () => void
const selectLayerFromList = ctx.selectLayerFromList as (layerId: string, event: MouseEvent | KeyboardEvent) => void
const toggleLayerVisibility = ctx.toggleLayerVisibility as (layer: any) => void
const groupIsCollapsed = ctx.groupIsCollapsed as (groupId: string) => boolean
const toggleGroupCollapsed = ctx.toggleGroupCollapsed as (groupId: string) => void
const layerName = ctx.layerName as (layer: any) => string
const layerPreviewStyle = ctx.layerPreviewStyle as (layer: any) => Record<string, string>
const layerPreviewText = ctx.layerPreviewText as (layer: any) => string
const maskPreviewClass = ctx.maskPreviewClass as (layer: any) => Record<string, boolean>
const maskPreviewUrls = ctx.maskPreviewUrls as Record<string, string | undefined>
const toggleSelectedLayerMask = ctx.toggleSelectedLayerMask as () => void
const toggleMaskEditFromLayerRow = ctx.toggleMaskEditFromLayerRow as (layer: any, event: MouseEvent) => void
const toggleMaskEnabledFromLayerRow = ctx.toggleMaskEnabledFromLayerRow as (layer: any, event: MouseEvent) => void
const startMaskDrag = ctx.startMaskDrag as (layer: any, event: DragEvent) => void
const selectedMaskControlLayers = ctx.selectedMaskControlLayers as any[]
const selectedMaskControlDeletes = ctx.selectedMaskControlDeletes as boolean
const isFlatteningLayers = ctx.isFlatteningLayers as Ref<boolean>
const flattenSelectedLayers = ctx.flattenSelectedLayers as () => void
const deleteLayer = ctx.deleteLayer as (layerId?: string) => void
const toggleBackgroundVisibility = ctx.toggleBackgroundVisibility as () => void
</script>

<template>
  <aside class="left-rail">
    <div class="brand-strip">
      <Button variant="outline" size="sm" @click="editor.closeEditor()">
        <ArrowLeft data-icon="inline-start" />
        Projects
      </Button>
      <div>
        <h1>{{ editor.document.title }}</h1>
        <p>Single-page canvas editor</p>
      </div>
    </div>

    <Tabs v-model="activeRailTab" default-value="assets" class="rail-tabs">
      <TabsList class="grid grid-cols-4">
        <TabsTrigger value="assets">Assets</TabsTrigger>
        <TabsTrigger value="fonts">Fonts</TabsTrigger>
        <TabsTrigger value="graph">Graph</TabsTrigger>
        <TabsTrigger value="layers">Layers</TabsTrigger>
      </TabsList>

      <TabsContent value="assets" class="rail-tab-content">
        <VueFinder
          :key="`editor-asset-${finderRevision.asset}`"
          id="editor-asset-finder"
          class="rail-finder"
          :driver="finderDrivers.asset"
          :features="finderFeaturesForKind('asset')"
          :config="finderUploadConfig"
          selection-mode="single"
          selection-filter-type="both"
          @path-change="(path) => handleFinderPathChange('asset', path)"
          @file-dclick="(event) => handleFinderFileDoubleClick('asset', event)"
          @dragover.capture="handleDirectFinderDragover('asset', $event as DragEvent)"
          @drop.capture="handleDirectFinderDrop('asset', $event as DragEvent)"
        />
        <Input v-model="assetSearch" placeholder="Search assets or tags" />
        <ScrollArea class="rail-scroll">
          <button
            v-for="asset in filteredAssets"
            :key="asset.id"
            class="asset-row"
            type="button"
            draggable="true"
            @click="addAssetToCanvas(asset)"
            @dragstart="startAssetDrag(asset, $event)"
            @dragend="clearAssetDrag"
          >
            <span class="asset-thumb"><img :src="previewUrl(asset)" alt="" draggable="false" /></span>
            <span class="asset-meta">
              <strong>{{ asset.name }}</strong>
              <span>Click or drag to add · {{ asset.tags.join(', ') || 'No tags' }}</span>
            </span>
          </button>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="fonts" class="rail-tab-content">
        <VueFinder
          :key="`editor-font-${finderRevision.font}`"
          id="editor-font-finder"
          class="rail-finder"
          :driver="finderDrivers.font"
          :features="finderFeaturesForKind('font')"
          :config="finderUploadConfig"
          selection-mode="single"
          selection-filter-type="both"
          @path-change="(path) => handleFinderPathChange('font', path)"
          @file-dclick="(event) => handleFinderFileDoubleClick('font', event)"
          @dragover.capture="handleDirectFinderDragover('font', $event as DragEvent)"
          @drop.capture="handleDirectFinderDrop('font', $event as DragEvent)"
        />
        <Input v-model="fontSearch" placeholder="Search fonts or tags" />
        <ScrollArea class="rail-scroll">
          <button
            v-for="font in filteredFonts"
            :key="font.id"
            class="font-row"
            type="button"
            draggable="true"
            @click="addFontTextToCanvas(font)"
            @dragstart="startFontDrag(font, $event)"
            @dragend="clearFontDrag"
          >
            <span class="font-preview">
              <img v-if="font.thumbnailPath" :src="fontPreviewSource(font)" alt="" draggable="false" />
              <span v-else :style="{ fontFamily: fontFamily(font) }">Ag 字</span>
            </span>
            <span class="font-meta">
              <strong>{{ font.name }}</strong>
              <span>Click to apply/create · drag for New Text · {{ font.tags.join(', ') || 'No tags' }}</span>
            </span>
          </button>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="graph" class="rail-tab-content">
        <ScrollArea class="rail-scroll">
          <button
            v-for="shape in shapeItems"
            :key="shape.kind"
            class="shape-row"
            type="button"
            :draggable="shape.kind !== 'polygon'"
            @click="shape.kind === 'polygon' ? startPolygonCreation() : addShapeToCanvas(shape.kind)"
            @dragstart="shape.kind !== 'polygon' && startShapeDrag(shape.kind, $event)"
            @dragend="clearShapeDrag"
          >
            <svg class="shape-preview" viewBox="0 0 36 36" aria-hidden="true">
              <line
                v-if="shape.kind === 'line'"
                x1="5"
                y1="18"
                x2="31"
                y2="18"
              />
              <path
                v-else-if="shape.kind === 'quadratic-curve'"
                d="M5 26 Q18 5 31 24"
              />
              <path
                v-else-if="shape.kind === 'cubic-bezier'"
                d="M4 25 C11 5 25 32 32 10"
              />
              <rect
                v-else-if="shape.kind === 'rect'"
                x="7"
                y="8"
                width="22"
                height="20"
              />
              <rect
                v-else-if="shape.kind === 'round-rect'"
                x="7"
                y="8"
                width="22"
                height="20"
                rx="6"
              />
              <ellipse
                v-else-if="shape.kind === 'ellipse'"
                cx="18"
                cy="18"
                rx="12"
                ry="10"
              />
              <polygon
                v-else
                :points="shapePreviewPoints(shape.kind)"
              />
            </svg>
            <span>
              <strong>{{ shape.label }}</strong>
              <em>{{ shape.detail }}</em>
            </span>
          </button>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="layers" class="rail-tab-content">
        <ButtonGroup class="layer-actions" aria-label="Layer creation actions">
          <Button size="sm" variant="outline" @click="editor.addText()">
            <Type data-icon="inline-start" />
            Text
          </Button>
          <Button size="sm" variant="outline" @click="editor.addPaint()">
            <Brush data-icon="inline-start" />
            Paint
          </Button>
          <Button
            v-if="maskFeatureEnabled"
            class="mask-toggle"
            size="sm"
            variant="outline"
            :disabled="!selectedMaskControlLayers.length"
            :title="selectedMaskControlDeletes ? 'Delete masks from selected layers' : 'Add masks to selected layers without one'"
            @click="toggleSelectedLayerMask"
          >
            Mask {{ selectedMaskControlDeletes ? '-' : '+' }}
          </Button>
        </ButtonGroup>
        <ScrollArea class="rail-scroll">
          <template v-for="item in layerListItems" :key="item.kind === 'group' ? item.group.id : item.layer.id">
            <div
              v-if="item.kind === 'group'"
              class="layer-row layer-group-row"
              :class="{ dragging: draggedGroupId === item.group.id }"
              role="button"
              tabindex="0"
              draggable="true"
              @click="toggleGroupCollapsed(item.group.id)"
              @dragstart="startGroupListDrag(item.group, $event)"
              @dragover.prevent
              @drop="handleGroupDrop(item.group, $event)"
              @dragend="clearLayerDragState"
              @keydown.enter="toggleGroupCollapsed(item.group.id)"
            >
              <ChevronRight v-if="groupIsCollapsed(item.group.id)" class="layer-icon" />
              <ChevronDown v-else class="layer-icon" />
              <span>
                <strong>{{ item.group.name }}</strong>
                <em>{{ item.layers.length }} layers · drag group to reorder</em>
              </span>
              <Button
                class="layer-visibility"
                size="icon"
                variant="ghost"
                :data-visible="item.group.visible"
                @click.stop="editor.toggleGroupVisibility(item.group.id)"
              >
                <Eye v-if="item.group.visible" />
                <EyeOff v-else />
              </Button>
              <Button
                class="row-delete"
                size="icon"
                variant="ghost"
                title="Ungroup"
                @click.stop="editor.ungroupGroup(item.group.id)"
              >
                <Trash2 />
              </Button>
            </div>
            <div
              v-for="layer in item.kind === 'group' && !groupIsCollapsed(item.group.id) ? item.layers : item.kind === 'layer' ? [item.layer] : []"
              :key="layer.id"
              class="layer-row"
              :class="{ selected: editor.selectedLayerIds.includes(layer.id), dragging: draggedLayerId === layer.id, child: item.kind === 'group' }"
              role="button"
              tabindex="0"
              draggable="true"
              @click="selectLayerFromList(layer.id, $event)"
              @dragstart="startLayerListDrag(layer, $event)"
              @dragover.prevent
              @drop="handleLayerListDrop(layer, $event)"
              @dragend="clearLayerDragState"
              @keydown.enter="selectLayerFromList(layer.id, $event)"
            >
              <div class="layer-preview" :style="layerPreviewStyle(layer)">
                <span>{{ layerPreviewText(layer) }}</span>
              </div>
              <span>
                <strong>{{ layerName(layer) }}</strong>
                <em>{{ layer.type }} · z{{ layer.zIndex }}</em>
              </span>
              <div class="layer-row-actions">
                <div
                  v-if="maskFeatureEnabled && layer.mask"
                  class="mask-preview"
                  :class="maskPreviewClass(layer)"
                  draggable="true"
                  title="Click to enter or exit mask edit, double click to enable or disable"
                  @click="toggleMaskEditFromLayerRow(layer, $event)"
                  @dblclick="toggleMaskEnabledFromLayerRow(layer, $event)"
                  @dragstart.stop="startMaskDrag(layer, $event)"
                  @dragend="clearLayerDragState"
                >
                  <img v-if="maskPreviewUrls[layer.mask.id]" :src="maskPreviewUrls[layer.mask.id]" alt="" />
                </div>
                <Button
                  class="layer-visibility"
                  size="icon"
                  variant="ghost"
                  :data-visible="layer.visible"
                  @click.stop="toggleLayerVisibility(layer)"
                >
                  <Eye v-if="layer.visible" />
                  <EyeOff v-else />
                </Button>
                <Button
                  class="row-delete"
                  size="icon"
                  variant="ghost"
                  @click.stop="deleteLayer(layer.id)"
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          </template>
          <div class="layer-row background-layer-row" role="button" tabindex="-1">
            <Layers class="layer-icon" />
            <span>
              <strong>Background</strong>
              <em>locked · bottom layer</em>
            </span>
            <Button
              class="layer-visibility"
              size="icon"
              variant="ghost"
              :data-visible="editor.document.canvas.backgroundVisible !== false"
              @click.stop="toggleBackgroundVisibility"
            >
              <Eye v-if="editor.document.canvas.backgroundVisible !== false" />
              <EyeOff v-else />
            </Button>
          </div>
        </ScrollArea>
        <ButtonGroup class="layer-actions layer-actions-bottom" aria-label="Selected layer actions">
          <Button size="sm" variant="outline" :disabled="!editor.selectedLayerIds.length" @click="editor.mergeSelectedLayersIntoGroup()">
            Merge
          </Button>
          <Button size="sm" variant="outline" :disabled="!editor.selectedLayerIds.length || isFlatteningLayers" @click="flattenSelectedLayers">
            Flat
          </Button>
          <Button size="icon" variant="outline" title="Move up" @click="editor.moveSelectedLayer(1)">
            <ArrowUp />
          </Button>
          <Button size="icon" variant="outline" title="Move down" @click="editor.moveSelectedLayer(-1)">
            <ArrowDown />
          </Button>
          <Button size="sm" variant="destructive" :disabled="!editor.selectedLayer" @click="deleteLayer()">
            <Trash2 data-icon="inline-start" />
            Delete
          </Button>
        </ButtonGroup>
      </TabsContent>
    </Tabs>
  </aside>
</template>
