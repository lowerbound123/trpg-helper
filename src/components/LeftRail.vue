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
import EditableProjectTitle from '@/components/editor/EditableProjectTitle.vue'
import { useEditorStore } from '@/stores/editor'
import type { LibraryRecord } from '@/lib/backend'
import type { HandoutLayer, LayerGroup } from '@/lib/handout'
import { shapeItems } from '@/lib/shape-items'
import { shapePreviewPoints } from '@/lib/shape-rendering'
import { translate } from '@/i18n'

const editor = useEditorStore()

const ctx = inject<Record<string, any>>('left-rail-context')!

type LayerListItem =
  | { kind: 'layer'; layer: HandoutLayer }
  | { kind: 'group'; group: LayerGroup; layers: HandoutLayer[] }

const activeRailTab = ctx.activeRailTab as Ref<string>
const assetSearch = ctx.assetSearch as Ref<string>
const fontSearch = ctx.fontSearch as Ref<string>
const maskFeatureEnabled = ctx.maskFeatureEnabled as boolean
const finderRevision = ctx.finderRevision as Record<string, number>
const finderUploadConfig = ctx.finderUploadConfig as Record<string, any>
const finderDrivers = ctx.finderDrivers as Record<string, any>
const finderFeaturesForKind = ctx.finderFeaturesForKind as (kind: string) => any
const imageHandoutContextMenuItems = ctx.imageHandoutContextMenuItems as Record<'background' | 'asset', any[]>
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
const layerListItems = ctx.layerListItems as LayerListItem[]
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
const selectedMaskControlLayers = ctx.selectedMaskControlLayers as HandoutLayer[]
const selectedMaskControlDeletes = ctx.selectedMaskControlDeletes as boolean
const isFlatteningLayers = ctx.isFlatteningLayers as Ref<boolean>
const flattenSelectedLayers = ctx.flattenSelectedLayers as () => void
const deleteLayer = ctx.deleteLayer as (layerId?: string) => void
const toggleBackgroundVisibility = ctx.toggleBackgroundVisibility as () => void

async function renameProject(title: string) {
  try {
    await editor.renameCurrentProject(title)
  } catch (error) {
    editor.status = translate('RENAME_FAILED')
  }
}
</script>

<template>
  <aside class="left-rail">
    <header class="panel-topbar panel-topbar-project">
      <Button variant="ghost" size="icon" :title="$t('BACK_TO_PROJECTS')" @click="editor.closeEditor()"><ArrowLeft /></Button>
      <div class="project-heading-copy">
        <EditableProjectTitle :title="editor.document.title" @commit="renameProject" />
        <span>{{ editor.status }}</span>
      </div>
    </header>

    <Tabs v-model="activeRailTab" default-value="assets" class="rail-tabs">
      <TabsList class="grid grid-cols-4">
        <TabsTrigger value="assets">{{ $t('ASSETS') }}</TabsTrigger>
        <TabsTrigger value="fonts">{{ $t('FONTS') }}</TabsTrigger>
        <TabsTrigger value="graph">{{ $t('GRAPH') }}</TabsTrigger>
        <TabsTrigger value="layers">{{ $t('LAYERS') }}</TabsTrigger>
      </TabsList>

      <TabsContent value="assets" class="rail-tab-content">
        <Input v-model="assetSearch" :placeholder="$t('SEARCH_ASSETS_OR_TAGS')" />
        <template v-if="assetSearch.trim()">
          <p class="asset-search-summary">{{ $t('RAIL_SEARCH_RESULTS', { count: filteredAssets.length }) }}</p>
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
              <span>{{ $t('RAIL_ASSET_HELP', { tags: asset.tags.join(', ') || $t('NO_TAGS') }) }}</span>
            </span>
          </button>
          <p v-if="filteredAssets.length === 0" class="rail-empty-state">{{ $t('NO_MATCHING_ASSETS') }}</p>
          </ScrollArea>
        </template>
        <VueFinder
          v-else
          :key="`editor-asset-${finderRevision.asset}`"
          id="editor-asset-finder"
          class="rail-finder rail-finder-fill"
          :driver="finderDrivers.asset"
          :features="finderFeaturesForKind('asset')"
          :config="finderUploadConfig"
          :context-menu-items="imageHandoutContextMenuItems.asset"
          selection-mode="multiple"
          selection-filter-type="both"
          @path-change="(path) => handleFinderPathChange('asset', path)"
          @file-dclick="(event) => handleFinderFileDoubleClick('asset', event)"
          @dragover.capture="handleDirectFinderDragover('asset', $event as DragEvent)"
          @drop.capture="handleDirectFinderDrop('asset', $event as DragEvent)"
        />
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
        <Input v-model="fontSearch" :placeholder="$t('SEARCH_FONTS_OR_TAGS')" />
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
              <span v-else :style="{ fontFamily: fontFamily(font) }">{{ $t('FONT_SAMPLE') }}</span>
            </span>
            <span class="font-meta">
              <strong>{{ font.name }}</strong>
              <span>{{ $t('RAIL_FONT_HELP', { tags: font.tags.join(', ') || $t('NO_TAGS') }) }}</span>
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
              <strong>{{ $t(shape.labelKey) }}</strong>
              <em>{{ $t(shape.detailKey) }}</em>
            </span>
          </button>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="layers" class="rail-tab-content">
        <ButtonGroup class="layer-actions" :aria-label="$t('LAYER_CREATION_ACTIONS_ARIA')">
          <Button size="sm" variant="outline" @click="editor.addText()">
            <Type data-icon="inline-start" />
            {{ $t('LAYER_TEXT') }}
          </Button>
          <Button size="sm" variant="outline" @click="editor.addPaint()">
            <Brush data-icon="inline-start" />
            {{ $t('LAYER_PAINT') }}
          </Button>
          <Button
            v-if="maskFeatureEnabled"
            class="mask-toggle"
            size="sm"
            variant="outline"
            :disabled="!selectedMaskControlLayers.length"
            :title="selectedMaskControlDeletes ? $t('DELETE_MASKS_FROM_SELECTED_LAYERS') : $t('ADD_MASKS_TO_SELECTED_LAYERS')"
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
                <em>{{ $t('GROUP_LAYER_COUNT', { count: item.layers.length }) }}</em>
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
                :title="$t('UNGROUP')"
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
                  :title="$t('MASK_EDIT_TOGGLE_HELP')"
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
              <strong>{{ $t('BACKGROUND_LAYER') }}</strong>
              <em>{{ $t('LOCKED_BOTTOM_LAYER') }}</em>
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
        <ButtonGroup class="layer-actions layer-actions-bottom" :aria-label="$t('SELECTED_LAYER_ACTIONS_ARIA')">
          <Button size="sm" variant="outline" :disabled="!editor.selectedLayerIds.length" @click="editor.mergeSelectedLayersIntoGroup()">
            {{ $t('LAYER_MERGE') }}
          </Button>
          <Button size="sm" variant="outline" :disabled="!editor.selectedLayerIds.length || isFlatteningLayers" @click="flattenSelectedLayers">
            {{ $t('LAYER_FLATTEN') }}
          </Button>
          <Button size="icon" variant="outline" :title="$t('MOVE_UP')" @click="editor.moveSelectedLayer(1)">
            <ArrowUp />
          </Button>
          <Button size="icon" variant="outline" :title="$t('MOVE_DOWN')" @click="editor.moveSelectedLayer(-1)">
            <ArrowDown />
          </Button>
          <Button size="sm" variant="destructive" :disabled="!editor.selectedLayer" @click="deleteLayer()">
            <Trash2 data-icon="inline-start" />
            {{ $t('LAYER_DELETE') }}
          </Button>
        </ButtonGroup>
      </TabsContent>
    </Tabs>
  </aside>
</template>
