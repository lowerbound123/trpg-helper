<script setup lang="ts">
import type { Ref } from 'vue'
import { inject } from 'vue'
import { Plus, Save, Settings } from '@lucide/vue'
import { VueFinder } from 'vuefinder'
import 'vuefinder/dist/vuefinder.css'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import CreateHandoutDialog from '@/components/handout/CreateHandoutDialog.vue'
import ConfigurationDialog from '@/components/settings/ConfigurationDialog.vue'
import { useEditorStore } from '@/stores/editor'
import type { LibraryRecord } from '@/lib/backend'

const editor = useEditorStore()

const ctx = inject<Record<string, unknown>>('manager-context')!

const isSettingsDialogOpen = ctx.isSettingsDialogOpen as Ref<boolean>
const isCreateDialogOpen = ctx.isCreateDialogOpen as Ref<boolean>
const newProjectTitle = ctx.newProjectTitle as Ref<string>
const createMode = ctx.createMode as Ref<'blank' | 'upload-background'>
const blankWidth = ctx.blankWidth as Ref<number>
const blankHeight = ctx.blankHeight as Ref<number>
const fontSearch = ctx.fontSearch as Ref<string>
const finderRevision = ctx.finderRevision as Record<'background' | 'asset' | 'font', number>
const handoutFinderStyle = ctx.handoutFinderStyle as Record<string, string>
const finderUploadConfig = ctx.finderUploadConfig as Record<string, unknown>
const finderDrivers = ctx.finderDrivers as Record<string, any>
const handleFinderFileDoubleClick = ctx.handleFinderFileDoubleClick as (kind: string, event: unknown) => void
const handleFinderPathChange = ctx.handleFinderPathChange as (kind: string, path: string) => void
const handleFinderSelect = ctx.handleFinderSelect as (kind: string, items: unknown[]) => void
const handoutContextMenuItems = ctx.handoutContextMenuItems as any
const imageHandoutContextMenuItems = ctx.imageHandoutContextMenuItems as Record<string, any>
const handleDirectFinderDrop = ctx.handleDirectFinderDrop as (kind: string, event: DragEvent) => void
const handleDirectFinderDragover = ctx.handleDirectFinderDragover as (kind: string, event: DragEvent) => void
const selectedHandoutStatus = ctx.selectedHandoutStatus as () => string
const selectedHandoutProject = ctx.selectedHandoutProject as () => unknown
const isSelectedHandoutExporting = ctx.isSelectedHandoutExporting as () => boolean
const exportSelectedHandout = ctx.exportSelectedHandout as () => void
const cloneHandoutProject = ctx.cloneHandoutProject as (project: unknown) => void
const createProject = ctx.createProject as () => void
const handleCreateBackgroundDrop = ctx.handleCreateBackgroundDrop as (event: DragEvent) => void
const handleCreateBackgroundInput = ctx.handleCreateBackgroundInput as (event: Event) => void
const selectedImageStatus = ctx.selectedImageStatus as (kind: string) => string
const selectedImageRecord = ctx.selectedImageRecord as (kind: string) => unknown
const createHandoutFromFinderImage = ctx.createHandoutFromFinderImage as (kind: string) => void
const fontPreviewSource = ctx.fontPreviewSource as (font: LibraryRecord) => string | undefined
const fontFamily = ctx.fontFamily as (font: LibraryRecord) => string
const filteredFonts = ctx.filteredFonts as LibraryRecord[]
const finderFeaturesForKind = ctx.finderFeaturesForKind as (kind: string) => any
</script>

<template>
  <div class="manager-shell">
    <header class="manager-header">
      <div>
        <h1>Handout Generator</h1>
        <p>Manage handouts, assets, and fonts before opening the canvas editor.</p>
      </div>
      <ButtonGroup class="manager-header-actions">
        <Button variant="outline" size="sm" @click="isSettingsDialogOpen = true">
          <Settings data-icon="inline-start" />
          Settings
        </Button>
        <Badge variant="secondary">{{ editor.status }}</Badge>
      </ButtonGroup>
    </header>

    <Tabs default-value="handouts" class="manager-tabs">
      <TabsList class="manager-tab-list">
        <TabsTrigger value="handouts">Handouts</TabsTrigger>
        <TabsTrigger value="assets">Assets</TabsTrigger>
        <TabsTrigger value="fonts">Fonts</TabsTrigger>
      </TabsList>

      <TabsContent value="handouts" class="manager-tab-content">
        <section class="manager-actions">
          <div class="create-header">
            <Button @click="isCreateDialogOpen = true">
              <Plus data-icon="inline-start" />
              New handout
            </Button>
          </div>
        </section>

        <VueFinder
          id="handout-finder"
          class="manager-finder large-grid-finder"
          :style="handoutFinderStyle"
          :driver="finderDrivers.handout"
          :features="finderFeaturesForKind('handout')"
          :config="finderUploadConfig"
          :context-menu-items="handoutContextMenuItems"
          selection-mode="single"
          selection-filter-type="both"
          @select="(items) => handleFinderSelect('handout', items)"
          @path-change="(path) => handleFinderPathChange('handout', path)"
          @file-dclick="(event) => handleFinderFileDoubleClick('handout', event)"
        >
          <template #status-bar="{ count }">
            <div class="finder-status-bar">
              <span>{{ count }} items · {{ selectedHandoutStatus() }}</span>
              <ButtonGroup class="finder-status-actions">
                <Button
                  size="sm"
                  variant="outline"
                  :disabled="!selectedHandoutProject()"
                  @click="selectedHandoutProject() && cloneHandoutProject(selectedHandoutProject()!)"
                >
                  <Plus data-icon="inline-start" />
                  Clone
                </Button>
                <Button
                  size="sm"
                  :disabled="!selectedHandoutProject() || isSelectedHandoutExporting()"
                  @click="exportSelectedHandout"
                >
                  <Save data-icon="inline-start" />
                  Export PNG
                </Button>
              </ButtonGroup>
            </div>
          </template>
        </VueFinder>
      </TabsContent>

      <TabsContent value="assets" class="manager-tab-content">
        <VueFinder
          :key="`asset-${finderRevision.asset}`"
          id="asset-finder"
          class="manager-finder compact-finder"
          :driver="finderDrivers.asset"
          :features="finderFeaturesForKind('asset')"
          :config="finderUploadConfig"
          :context-menu-items="imageHandoutContextMenuItems.asset"
          selection-mode="single"
          selection-filter-type="both"
          @select="(items) => handleFinderSelect('asset', items)"
          @path-change="(path) => handleFinderPathChange('asset', path)"
          @file-dclick="(event) => handleFinderFileDoubleClick('asset', event)"
          @dragover.capture="handleDirectFinderDragover('asset', $event as DragEvent)"
          @drop.capture="handleDirectFinderDrop('asset', $event as DragEvent)"
        >
          <template #status-bar="{ count }">
            <div class="finder-status-bar">
              <span>{{ count }} items · {{ selectedImageStatus('asset') }}</span>
              <Button
                size="sm"
                :disabled="!selectedImageRecord('asset')"
                @click="createHandoutFromFinderImage('asset')"
              >
                <Plus data-icon="inline-start" />
                Create handout
              </Button>
            </div>
          </template>
        </VueFinder>
      </TabsContent>

      <TabsContent value="fonts" class="manager-tab-content">
        <VueFinder
          :key="`font-${finderRevision.font}`"
          id="font-finder"
          class="manager-finder compact-finder"
          :driver="finderDrivers.font"
          :features="finderFeaturesForKind('font')"
          :config="finderUploadConfig"
          selection-mode="single"
          selection-filter-type="both"
          @select="(items) => handleFinderSelect('font', items)"
          @path-change="(path) => handleFinderPathChange('font', path)"
          @file-dclick="(event) => handleFinderFileDoubleClick('font', event)"
          @dragover.capture="handleDirectFinderDragover('font', $event as DragEvent)"
          @drop.capture="handleDirectFinderDrop('font', $event as DragEvent)"
        />
        <Input v-model="fontSearch" placeholder="Search fonts or tags" />
        <div class="font-grid">
          <div v-for="font in filteredFonts" :key="font.id" class="font-card">
            <span class="font-card-preview">
              <img v-if="font.thumbnailPath" :src="fontPreviewSource(font)" alt="" draggable="false" />
              <span v-else :style="{ fontFamily: fontFamily(font) }">Ag 字</span>
            </span>
            <strong>{{ font.name }}</strong>
            <span>{{ font.tags.join(', ') || 'No tags' }}</span>
          </div>
        </div>
      </TabsContent>
    </Tabs>

    <CreateHandoutDialog
      v-model:open="isCreateDialogOpen"
      v-model:title="newProjectTitle"
      v-model:mode="createMode"
      v-model:width="blankWidth"
      v-model:height="blankHeight"
      @blank="createProject"
      @background-drop="handleCreateBackgroundDrop"
      @background-input="handleCreateBackgroundInput"
    />
    <ConfigurationDialog v-model:open="isSettingsDialogOpen" />
  </div>
</template>
