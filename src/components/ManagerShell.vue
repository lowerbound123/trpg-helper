<script setup lang="ts">
import type { Ref } from 'vue'
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Save, Settings } from '@lucide/vue'
import { VueFinder } from 'vuefinder'
import 'vuefinder/dist/vuefinder.css'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ConfigurationDialog from '@/components/settings/ConfigurationDialog.vue'
import { useEditorStore } from '@/stores/editor'
import { useTokenStore } from '@/stores/token'
import type { LibraryRecord } from '@/lib/backend'

const editor = useEditorStore()
const { t } = useI18n()

const ctx = inject<Record<string, unknown>>('manager-context')!

const isSettingsDialogOpen = ctx.isSettingsDialogOpen as Ref<boolean>
const fontSearch = ctx.fontSearch as Ref<string>
const finderRevision = ctx.finderRevision as Record<'background' | 'asset' | 'font', number>
const handoutFinderStyle = ctx.handoutFinderStyle as Record<string, string>
const finderUploadConfig = ctx.finderUploadConfig as Record<string, unknown>
const finderDrivers = ctx.finderDrivers as Record<string, any>
const handleFinderFileDoubleClick = ctx.handleFinderFileDoubleClick as (kind: string, event: unknown) => void
const handleFinderPathChange = ctx.handleFinderPathChange as (kind: string, path: string) => void
const handleFinderSelect = ctx.handleFinderSelect as (kind: string, items: unknown[]) => void
const handoutContextMenuItems = ctx.handoutContextMenuItems as any
const tokenContextMenuItems = ctx.tokenContextMenuItems as any
const imageHandoutContextMenuItems = ctx.imageHandoutContextMenuItems as Record<string, any>
const handleDirectFinderDrop = ctx.handleDirectFinderDrop as (kind: string, event: DragEvent) => void
const handleDirectFinderDragover = ctx.handleDirectFinderDragover as (kind: string, event: DragEvent) => void
const selectedHandoutStatus = ctx.selectedHandoutStatus as () => string
const selectedHandoutProject = ctx.selectedHandoutProject as () => unknown
const isSelectedHandoutExporting = ctx.isSelectedHandoutExporting as () => boolean
const exportSelectedHandout = ctx.exportSelectedHandout as () => void
const cloneHandoutProject = ctx.cloneHandoutProject as (project: unknown) => void
const selectedImageStatus = ctx.selectedImageStatus as (kind: string) => string
const selectedImageRecord = ctx.selectedImageRecord as (kind: string) => unknown
const createHandoutFromFinderImage = ctx.createHandoutFromFinderImage as (kind: string) => void
const fontPreviewSource = ctx.fontPreviewSource as (font: LibraryRecord) => string | undefined
const fontFamily = ctx.fontFamily as (font: LibraryRecord) => string
const filteredFonts = ctx.filteredFonts as LibraryRecord[]
const finderFeaturesForKind = ctx.finderFeaturesForKind as (kind: string) => any
const tokenStore = ctx.tokenStore as ReturnType<typeof useTokenStore>
const createTokenFromSelectedAssets = ctx.createTokenFromSelectedAssets as () => Promise<void>
const selectedTokenAssets = ctx.selectedTokenAssets as () => LibraryRecord[]
</script>

<template>
  <div class="manager-shell">
    <header class="manager-header">
      <div>
        <h1>{{ t('APP_NAME') }}</h1>
        <p>{{ t('MANAGER_DESCRIPTION') }}</p>
      </div>
      <div class="manager-header-actions">
        <Badge
          data-testid="manager-status"
          variant="secondary"
          aria-live="polite"
          :title="editor.status"
        >
          {{ editor.status }}
        </Badge>
        <Button data-testid="manager-settings" variant="outline" size="sm" @click="isSettingsDialogOpen = true">
          <Settings data-icon="inline-start" />
          {{ t('SETTINGS') }}
        </Button>
      </div>
    </header>

    <Tabs default-value="handouts" class="manager-tabs">
      <TabsList class="manager-tab-list">
        <TabsTrigger value="handouts">{{ t('HANDOUTS') }}</TabsTrigger>
        <TabsTrigger value="tokens">{{ t('TOKENS') }}</TabsTrigger>
        <TabsTrigger value="assets">{{ t('ASSETS') }}</TabsTrigger>
        <TabsTrigger value="fonts">{{ t('FONTS') }}</TabsTrigger>
      </TabsList>

      <TabsContent value="handouts" class="manager-tab-content">
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
              <span>{{ t('FINDER_ITEMS_COUNT', { count }) }} · {{ selectedHandoutStatus() }}</span>
              <ButtonGroup class="finder-status-actions" :aria-label="t('SELECTED_HANDOUT_ACTIONS_ARIA')">
                <Button
                  size="sm"
                  variant="outline"
                  :disabled="!selectedHandoutProject()"
                  @click="selectedHandoutProject() && cloneHandoutProject(selectedHandoutProject()!)"
                >
                  <Plus data-icon="inline-start" />
                  {{ t('CLONE') }}
                </Button>
                <Button
                  size="sm"
                  :disabled="!selectedHandoutProject() || isSelectedHandoutExporting()"
                  @click="exportSelectedHandout"
                >
                  <Save data-icon="inline-start" />
                  {{ t('EXPORT_PNG') }}
                </Button>
              </ButtonGroup>
            </div>
          </template>
        </VueFinder>
      </TabsContent>

      <TabsContent value="tokens" class="manager-tab-content">
        <VueFinder
          id="token-finder"
          class="manager-finder large-grid-finder"
          :style="handoutFinderStyle"
          :driver="finderDrivers.token"
          :features="finderFeaturesForKind('token')"
          :config="finderUploadConfig"
          :context-menu-items="tokenContextMenuItems"
          selection-mode="multiple"
          selection-filter-type="both"
          @select="(items) => handleFinderSelect('token', items)"
          @path-change="(path) => handleFinderPathChange('token', path)"
          @file-dclick="(event) => handleFinderFileDoubleClick('token', event)"
        >
          <template #status-bar="{ count }">
            <div class="finder-status-bar">
              <span>{{ t('FINDER_ITEMS_COUNT', { count }) }} · {{ t('TOKEN_PROJECTS_COUNT', { count: tokenStore.projects.length }) }}</span>
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
          selection-mode="multiple"
          selection-filter-type="both"
          @select="(items) => handleFinderSelect('asset', items)"
          @path-change="(path) => handleFinderPathChange('asset', path)"
          @file-dclick="(event) => handleFinderFileDoubleClick('asset', event)"
          @dragover.capture="handleDirectFinderDragover('asset', $event as DragEvent)"
          @drop.capture="handleDirectFinderDrop('asset', $event as DragEvent)"
        >
          <template #status-bar="{ count }">
            <div class="finder-status-bar">
              <span>{{ t('FINDER_ITEMS_COUNT', { count }) }} · {{ selectedImageStatus('asset') }}</span>
              <ButtonGroup :aria-label="t('SELECTED_ASSET_ACTIONS_ARIA')">
                <Button
                  size="sm"
                  variant="outline"
                  :disabled="!selectedImageRecord('asset')"
                  @click="createHandoutFromFinderImage('asset')"
                >
                  <Plus data-icon="inline-start" />
                  {{ t('CREATE_HANDOUT') }}
                </Button>
                <Button size="sm" :disabled="!selectedTokenAssets().length" @click="createTokenFromSelectedAssets">
                  <Plus data-icon="inline-start" />
                  {{ t('CREATE_TOKEN') }}
                </Button>
              </ButtonGroup>
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
        <Input v-model="fontSearch" :placeholder="t('SEARCH_FONTS_OR_TAGS')" />
        <div class="font-grid">
          <div v-for="font in filteredFonts" :key="font.id" class="font-card">
            <span class="font-card-preview">
              <img v-if="font.thumbnailPath" :src="fontPreviewSource(font)" alt="" draggable="false" />
              <span v-else :style="{ fontFamily: fontFamily(font) }">{{ t('FONT_SAMPLE') }}</span>
            </span>
            <strong>{{ font.name }}</strong>
            <span>{{ font.tags.join(', ') || t('NO_TAGS') }}</span>
          </div>
        </div>
      </TabsContent>
    </Tabs>

    <ConfigurationDialog v-model:open="isSettingsDialogOpen" />
  </div>
</template>
