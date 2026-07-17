<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { Directive } from 'vue'
import { useI18n } from 'vue-i18n'

import { readConfiguration, writeConfiguration } from '@/lib/backend'
import {
  appConfiguration,
  configurationFromToml,
  serializeConfigurationToml,
  type AppConfiguration,
} from '@/lib/configuration'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ParameterLabel from '@/components/controls/ParameterLabel.vue'

const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()

const isLoading = ref(false)
const isSaving = ref(false)
const status = ref('')
const activeTab = ref('general')
const isMacOS = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

function applyConfigurationHelp(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.configuration-section label').forEach((field) => {
    const explicit = field.querySelector<HTMLElement>('em, .sr-only')?.textContent?.trim()
    const label = field.querySelector<HTMLElement>('[data-parameter-label], strong, span')?.textContent?.trim()
    field.title = explicit || t('CONFIG_FIELD_GENERIC_HELP', { label: label || t('CONFIG_FIELD') })
    field.dataset.configurationHelp = 'true'
  })
}

const vConfigurationHelp: Directive<HTMLElement> = {
  mounted(element) {
    queueMicrotask(() => applyConfigurationHelp(element))
  },
  updated(element) {
    queueMicrotask(() => applyConfigurationHelp(element))
  },
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const draft = reactive<AppConfiguration>(cloneValue(appConfiguration))

function replaceDraft(next: AppConfiguration) {
  draft.schemaVersion = next.schemaVersion
  Object.assign(draft.application, next.application)
  Object.assign(draft.window, next.window)
  Object.assign(draft.diagnostics, next.diagnostics)
  Object.assign(draft.paths, next.paths)
  Object.assign(draft.uploads, next.uploads)
  Object.assign(draft.previews, next.previews)
  Object.assign(draft.finder, next.finder)
  Object.assign(draft.editor, next.editor)
  Object.assign(draft.mask, next.mask)
  Object.assign(draft.foregroundSegmentation, next.foregroundSegmentation)
  Object.assign(draft.export, next.export)
  Object.assign(draft.debug, next.debug)
  Object.assign(draft.token, cloneValue(next.token))
}

function normalizeNumber(value: number, fallback: number, min?: number) {
  const next = Number(value)
  if (!Number.isFinite(next)) return fallback
  return min === undefined ? next : Math.max(min, next)
}

function csvValues(value: string | number) {
  return String(value).split(',').map((entry) => entry.trim()).filter(Boolean)
}

function updateTokenImportFormats(value: string | number) {
  draft.token.files.importFormats = csvValues(value)
}

function updateTokenExportFormats(value: string | number) {
  const supported = new Set(['png', 'jpg', 'webp', 'jxl'])
  draft.token.files.exportFormats = csvValues(value)
    .filter((entry) => supported.has(entry)) as AppConfiguration['token']['files']['exportFormats']
}

function updateTokenPalette(value: string | number) {
  draft.token.export.randomColors.palette = csvValues(value)
}

function normalizeDraft() {
  draft.window.width = normalizeNumber(draft.window.width, appConfiguration.window.width, 1)
  draft.window.height = normalizeNumber(draft.window.height, appConfiguration.window.height, 1)
  draft.window.minWidth = normalizeNumber(draft.window.minWidth, appConfiguration.window.minWidth, 1)
  draft.window.minHeight = normalizeNumber(draft.window.minHeight, appConfiguration.window.minHeight, 1)
  draft.previews.thumbnailMaxEdgePx = normalizeNumber(draft.previews.thumbnailMaxEdgePx, appConfiguration.previews.thumbnailMaxEdgePx, 1)
  draft.previews.thumbnailQuality = normalizeNumber(draft.previews.thumbnailQuality, appConfiguration.previews.thumbnailQuality, 1)
  draft.previews.targetMaxBytes = normalizeNumber(draft.previews.targetMaxBytes, appConfiguration.previews.targetMaxBytes, 1)
  draft.finder.managerHeightPx = normalizeNumber(draft.finder.managerHeightPx, appConfiguration.finder.managerHeightPx, 1)
  draft.finder.compactHeightPx = normalizeNumber(draft.finder.compactHeightPx, appConfiguration.finder.compactHeightPx, 1)
  draft.finder.handoutGridScale = normalizeNumber(draft.finder.handoutGridScale, appConfiguration.finder.handoutGridScale, 0.25)
  draft.finder.backgroundGridScale = normalizeNumber(draft.finder.backgroundGridScale, appConfiguration.finder.backgroundGridScale, 0.25)
  draft.editor.snapThresholdScreenPx = normalizeNumber(draft.editor.snapThresholdScreenPx, appConfiguration.editor.snapThresholdScreenPx, 0)
  draft.editor.maxSnapCandidates = normalizeNumber(draft.editor.maxSnapCandidates, appConfiguration.editor.maxSnapCandidates, 0)
  draft.editor.continuousEditCommitDelayMs = normalizeNumber(draft.editor.continuousEditCommitDelayMs, appConfiguration.editor.continuousEditCommitDelayMs, 0)
  draft.mask.strokePreviewMinOpacity = Math.min(1, normalizeNumber(draft.mask.strokePreviewMinOpacity, appConfiguration.mask.strokePreviewMinOpacity, 0))
  draft.mask.interactiveRefreshDelayMs = normalizeNumber(draft.mask.interactiveRefreshDelayMs, appConfiguration.mask.interactiveRefreshDelayMs, 0)
  draft.mask.pointerIdleGraceMs = normalizeNumber(draft.mask.pointerIdleGraceMs, appConfiguration.mask.pointerIdleGraceMs, 0)
  draft.foregroundSegmentation.workerThreads = normalizeNumber(draft.foregroundSegmentation.workerThreads, appConfiguration.foregroundSegmentation.workerThreads, 1)
  draft.foregroundSegmentation.intraThreads = normalizeNumber(draft.foregroundSegmentation.intraThreads, appConfiguration.foregroundSegmentation.intraThreads, 0)
  draft.foregroundSegmentation.interThreads = normalizeNumber(draft.foregroundSegmentation.interThreads, appConfiguration.foregroundSegmentation.interThreads, 1)
  draft.foregroundSegmentation.downloadTimeoutSeconds = normalizeNumber(draft.foregroundSegmentation.downloadTimeoutSeconds, appConfiguration.foregroundSegmentation.downloadTimeoutSeconds, 1)
  draft.foregroundSegmentation.maxSourceDimension = normalizeNumber(draft.foregroundSegmentation.maxSourceDimension, appConfiguration.foregroundSegmentation.maxSourceDimension, 1)
  draft.foregroundSegmentation.maxSourcePixels = normalizeNumber(draft.foregroundSegmentation.maxSourcePixels, appConfiguration.foregroundSegmentation.maxSourcePixels, 1)
  draft.export.defaultScale = normalizeNumber(draft.export.defaultScale, appConfiguration.export.defaultScale, 0.1)
  draft.export.minScale = normalizeNumber(draft.export.minScale, appConfiguration.export.minScale, 0.01)
  draft.export.rawRgbaIpcMaxBytes = normalizeNumber(draft.export.rawRgbaIpcMaxBytes, appConfiguration.export.rawRgbaIpcMaxBytes, 1)
  draft.export.limits.maxCanvasDimension = normalizeNumber(draft.export.limits.maxCanvasDimension, appConfiguration.export.limits.maxCanvasDimension, 1)
  draft.export.limits.maxCanvasPixels = normalizeNumber(draft.export.limits.maxCanvasPixels, appConfiguration.export.limits.maxCanvasPixels, 1)
  draft.token.defaults.designSize = normalizeNumber(draft.token.defaults.designSize, appConfiguration.token.defaults.designSize, 1)
  draft.token.defaults.scale = normalizeNumber(draft.token.defaults.scale, appConfiguration.token.defaults.scale, draft.token.limits.scaleMin)
  draft.token.defaults.ringInnerRadius = normalizeNumber(draft.token.defaults.ringInnerRadius, appConfiguration.token.defaults.ringInnerRadius, 0)
  draft.token.defaults.ringOuterRadius = normalizeNumber(draft.token.defaults.ringOuterRadius, appConfiguration.token.defaults.ringOuterRadius, 1)
  draft.token.defaults.avatarRadius = normalizeNumber(draft.token.defaults.avatarRadius, appConfiguration.token.defaults.avatarRadius, 0)
  draft.token.export.defaults.size = normalizeNumber(draft.token.export.defaults.size, appConfiguration.token.export.defaults.size, draft.token.export.limits.sizeMin)
  draft.token.preview.displayTokenSize = normalizeNumber(draft.token.preview.displayTokenSize, appConfiguration.token.preview.displayTokenSize, 1)
  draft.token.preview.minimumWorldSize = normalizeNumber(draft.token.preview.minimumWorldSize, appConfiguration.token.preview.minimumWorldSize, 1)
  draft.token.preview.worldSizeStep = normalizeNumber(draft.token.preview.worldSizeStep, appConfiguration.token.preview.worldSizeStep, 1)
  draft.token.preview.devicePixelRatioMax = normalizeNumber(draft.token.preview.devicePixelRatioMax, appConfiguration.token.preview.devicePixelRatioMax, 1)
  draft.token.layout.resizeHandleWidth = normalizeNumber(draft.token.layout.resizeHandleWidth, appConfiguration.token.layout.resizeHandleWidth, 1)
  draft.token.files.thumbnailSize = normalizeNumber(draft.token.files.thumbnailSize, appConfiguration.token.files.thumbnailSize, 1)
  draft.token.history.maximumEntries = normalizeNumber(draft.token.history.maximumEntries, appConfiguration.token.history.maximumEntries, 1)
  draft.token.rings.thumbnailSize = normalizeNumber(draft.token.rings.thumbnailSize, appConfiguration.token.rings.thumbnailSize, 1)
  draft.token.rings.frontendCacheEntries = normalizeNumber(draft.token.rings.frontendCacheEntries, appConfiguration.token.rings.frontendCacheEntries, 1)
  draft.token.rings.backendCacheEntries = normalizeNumber(draft.token.rings.backendCacheEntries, appConfiguration.token.rings.backendCacheEntries, 1)
  draft.token.backgrounds.thumbnailSize = normalizeNumber(draft.token.backgrounds.thumbnailSize, appConfiguration.token.backgrounds.thumbnailSize, 1)
  draft.token.backgrounds.frontendCacheEntries = normalizeNumber(draft.token.backgrounds.frontendCacheEntries, appConfiguration.token.backgrounds.frontendCacheEntries, 1)
  draft.token.backgrounds.maxUploadBytes = normalizeNumber(draft.token.backgrounds.maxUploadBytes, appConfiguration.token.backgrounds.maxUploadBytes, 1)
  draft.token.backgrounds.maxSourceDimension = normalizeNumber(draft.token.backgrounds.maxSourceDimension, appConfiguration.token.backgrounds.maxSourceDimension, 1)
  draft.token.notifications.toastDurationMs = normalizeNumber(draft.token.notifications.toastDurationMs, appConfiguration.token.notifications.toastDurationMs, 1)
}

async function loadConfiguration() {
  isLoading.value = true
  status.value = ''
  try {
    const source = await readConfiguration()
    replaceDraft(configurationFromToml(source))
  } catch (error) {
    status.value = t('CONFIG_LOAD_FAILED')
    replaceDraft(appConfiguration)
  } finally {
    isLoading.value = false
  }
}

async function saveConfiguration() {
  isSaving.value = true
  status.value = ''
  try {
    normalizeDraft()
    const path = await writeConfiguration(serializeConfigurationToml(draft))
    status.value = t('CONFIG_SAVED_RESTART', { path })
  } catch (error) {
    status.value = t('CONFIG_SAVE_FAILED')
  } finally {
    isSaving.value = false
  }
}

watch(open, (value) => {
  if (value) void loadConfiguration()
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="configuration-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('SETTINGS') }}</DialogTitle>
        <DialogDescription>
          {{ t('SETTINGS_DESCRIPTION') }}
        </DialogDescription>
      </DialogHeader>

      <Tabs v-model="activeTab" v-configuration-help class="configuration-tabs" :aria-busy="isLoading">
        <TabsList class="configuration-tabs-list" :aria-label="t('SETTINGS_CATEGORIES_ARIA')">
          <TabsTrigger value="general">{{ t('SETTINGS_GENERAL') }}</TabsTrigger>
          <TabsTrigger value="library">{{ t('SETTINGS_LIBRARY') }}</TabsTrigger>
          <TabsTrigger value="handout">{{ t('SETTINGS_HANDOUT') }}</TabsTrigger>
          <TabsTrigger value="token">{{ t('SETTINGS_TOKEN') }}</TabsTrigger>
          <TabsTrigger value="export">{{ t('SETTINGS_EXPORT') }}</TabsTrigger>
          <TabsTrigger value="ai">{{ t('SETTINGS_AI') }}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" class="configuration-tab-content">
          <div class="configuration-grid">
        <section class="configuration-section">
          <h3>{{ t('CONFIG_APPLICATION_WINDOW') }}</h3>
          <label><span>{{ t('CONFIG_APPLICATION_TITLE') }}</span><Input v-model="draft.application.title" /></label>
          <label>
            <span>{{ t('LANGUAGE_LABEL') }}</span>
            <Select v-model="draft.application.locale">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{{ t('LANGUAGE_AUTO') }}</SelectItem>
                <SelectItem value="zh-CN">{{ t('LANGUAGE_SIMPLIFIED_CHINESE') }}</SelectItem>
                <SelectItem value="en-US">{{ t('LANGUAGE_ENGLISH') }}</SelectItem>
              </SelectContent>
            </Select>
            <em>{{ t('LANGUAGE_RESTART_NOTICE') }}</em>
          </label>
          <label><span>{{ t('CONFIG_WINDOW_WIDTH') }}</span><Input v-model.number="draft.window.width" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_WINDOW_HEIGHT') }}</span><Input v-model.number="draft.window.height" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_MIN_WIDTH') }}</span><Input v-model.number="draft.window.minWidth" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_MIN_HEIGHT') }}</span><Input v-model.number="draft.window.minHeight" type="number" min="1" /></label>
          <label class="configuration-switch"><span><strong>{{ t('CONFIG_RESIZABLE') }}</strong><em>{{ t('CONFIG_RESIZABLE_HELP') }}</em></span><Switch v-model="draft.window.resizable" /></label>
        </section>

        <section class="configuration-section">
          <h3>{{ t('CONFIG_PATHS') }}</h3>
          <label>
            <span>{{ t('CONFIG_DATA_DIRECTORY') }}</span>
            <Input v-model="draft.paths.dataDir" />
          </label>
          <label>
            <span>{{ t('CONFIG_LOG_FILE') }}</span>
            <Input v-model="draft.paths.logFile" />
          </label>
          <label><span>{{ t('CONFIG_DIAGNOSTICS_DIRECTORY') }}</span><Input v-model="draft.diagnostics.logDirectory" /></label>
        </section>

        <section class="configuration-section">
          <h3>{{ t('CONFIG_DEBUG') }}</h3>
          <label class="configuration-switch">
            <span><strong>{{ t('CONFIG_FILE_LOG') }}</strong><em>{{ t('CONFIG_FILE_LOG_HELP') }}</em></span>
            <Switch v-model="draft.debug.fileLogEnabled" />
          </label>
          <label class="configuration-switch">
            <span><strong>{{ t('CONFIG_RENDER_PERF_LOG') }}</strong><em>{{ t('CONFIG_RENDER_PERF_LOG_HELP') }}</em></span>
            <Switch v-model="draft.debug.renderPerfLogEnabled" />
          </label>
        </section>
          </div>
        </TabsContent>

        <TabsContent value="library" class="configuration-tab-content">
          <div class="configuration-grid">

        <section class="configuration-section">
          <h3>{{ t('CONFIG_UPLOADS_PREVIEWS') }}</h3>
          <label>
            <span>{{ t('CONFIG_MAX_UPLOAD_SIZE') }}</span>
            <Input v-model="draft.uploads.maxFileSize" />
          </label>
          <label>
            <span>{{ t('CONFIG_THUMBNAIL_MAX_EDGE') }}</span>
            <Input v-model.number="draft.previews.thumbnailMaxEdgePx" type="number" min="1" />
          </label>
          <label>
            <span>{{ t('CONFIG_THUMBNAIL_QUALITY') }}</span>
            <Input v-model.number="draft.previews.thumbnailQuality" type="number" min="1" max="100" />
          </label>
          <label>
            <span>{{ t('CONFIG_PREVIEW_TARGET_BYTES') }}</span>
            <Input v-model.number="draft.previews.targetMaxBytes" type="number" min="1" />
          </label>
        </section>

        <section class="configuration-section">
          <h3>{{ t('CONFIG_FINDER') }}</h3>
          <label>
            <span>{{ t('CONFIG_MANAGER_HEIGHT') }}</span>
            <Input v-model.number="draft.finder.managerHeightPx" type="number" min="1" />
          </label>
          <label>
            <span>{{ t('CONFIG_COMPACT_HEIGHT') }}</span>
            <Input v-model.number="draft.finder.compactHeightPx" type="number" min="1" />
          </label>
          <label>
            <span>{{ t('CONFIG_HANDOUT_GRID_SCALE') }}</span>
            <Input v-model.number="draft.finder.handoutGridScale" type="number" min="0.25" step="0.25" />
          </label>
          <label>
            <span>{{ t('CONFIG_BACKGROUND_GRID_SCALE') }}</span>
            <Input v-model.number="draft.finder.backgroundGridScale" type="number" min="0.25" step="0.25" />
          </label>
        </section>
          </div>
        </TabsContent>

        <TabsContent value="handout" class="configuration-tab-content">
          <div class="configuration-grid">

        <section class="configuration-section">
          <h3>{{ t('CONFIG_EDITOR') }}</h3>
          <label>
            <span>{{ t('CONFIG_SNAP_THRESHOLD') }}</span>
            <Input v-model.number="draft.editor.snapThresholdScreenPx" type="number" min="0" />
          </label>
          <label>
            <span>{{ t('CONFIG_MAX_SNAP_CANDIDATES') }}</span>
            <Input v-model.number="draft.editor.maxSnapCandidates" type="number" min="0" />
          </label>
          <label>
            <span>{{ t('CONFIG_CONTINUOUS_COMMIT_DELAY') }}</span>
            <Input v-model.number="draft.editor.continuousEditCommitDelayMs" type="number" min="0" />
          </label>
        </section>

        <section class="configuration-section">
          <h3>{{ t('CONFIG_MASK') }}</h3>
          <label class="configuration-switch">
            <span>
              <strong>{{ t('CONFIG_ENABLE_MASKS') }}</strong>
              <em>{{ t('CONFIG_ENABLE_MASKS_HELP') }}</em>
            </span>
            <Switch v-model="draft.mask.enabled" />
          </label>
          <label class="configuration-switch">
            <span>
              <strong>{{ t('CONFIG_USE_PIXI_PREVIEW') }}</strong>
              <em>{{ t('CONFIG_USE_PIXI_PREVIEW_HELP') }}</em>
            </span>
            <Switch v-model="draft.mask.usePixiPreview" :disabled="!draft.mask.enabled" />
          </label>
          <label>
            <span>{{ t('CONFIG_STROKE_PREVIEW_MIN_OPACITY') }}</span>
            <Input
              v-model.number="draft.mask.strokePreviewMinOpacity"
              type="number"
              min="0"
              max="1"
              step="0.05"
              :disabled="!draft.mask.enabled"
            />
          </label>
          <label>
            <span>{{ t('CONFIG_SECONDARY_REFRESH_DELAY') }}</span>
            <Input
              v-model.number="draft.mask.interactiveRefreshDelayMs"
              type="number"
              min="0"
              step="50"
              :disabled="!draft.mask.enabled"
            />
          </label>
          <label>
            <span>{{ t('CONFIG_SECONDARY_POINTER_GRACE') }}</span>
            <Input
              v-model.number="draft.mask.pointerIdleGraceMs"
              type="number"
              min="0"
              step="10"
              :disabled="!draft.mask.enabled"
            />
          </label>
        </section>
          </div>
        </TabsContent>

        <TabsContent value="token" class="configuration-tab-content">
          <div class="configuration-grid">

        <section class="configuration-section">
          <h3>{{ t('CONFIG_TOKEN_DEFAULTS') }}</h3>
          <label><span>{{ t('CONFIG_DESIGN_SIZE') }}</span><Input v-model.number="draft.token.defaults.designSize" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_AVATAR_SCALE') }}</span><Input v-model.number="draft.token.defaults.scale" type="number" :min="draft.token.limits.scaleMin" :max="draft.token.limits.scaleMax" /></label>
          <label><span>{{ t('CONFIG_OFFSET_X') }}</span><Input v-model.number="draft.token.defaults.offsetX" type="number" /></label>
          <label><span>{{ t('CONFIG_OFFSET_Y') }}</span><Input v-model.number="draft.token.defaults.offsetY" type="number" /></label>
          <label><span>{{ t('TOKEN_RING_INNER_RADIUS') }}</span><Input v-model.number="draft.token.defaults.ringInnerRadius" type="number" min="0" /></label>
          <label><span>{{ t('TOKEN_RING_OUTER_RADIUS') }}</span><Input v-model.number="draft.token.defaults.ringOuterRadius" type="number" min="1" /></label>
          <label><span>{{ t('TOKEN_AVATAR_RADIUS') }}</span><Input v-model.number="draft.token.defaults.avatarRadius" type="number" min="0" :max="draft.token.defaults.designSize / 2" /></label>
          <label><span>{{ t('CONFIG_RING_STYLE') }}</span><Input v-model="draft.token.defaults.ringStyle" /></label>
          <label><span>{{ t('CONFIG_BACKGROUND_COLOR') }}</span><Input v-model="draft.token.defaults.backgroundColor" /></label>
          <label><span>{{ t('CONFIG_RING_COLOR') }}</span><Input v-model="draft.token.defaults.ringColor" /></label>
        </section>

        <section class="configuration-section">
          <h3>{{ t('CONFIG_TOKEN_BACKGROUNDS') }}</h3>
          <label><span>{{ t('CONFIG_BACKGROUND_THUMBNAIL_SIZE') }}</span><Input v-model.number="draft.token.backgrounds.thumbnailSize" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_BACKGROUND_CACHE') }}</span><Input v-model.number="draft.token.backgrounds.frontendCacheEntries" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_MAX_UPLOAD_BYTES') }}</span><Input v-model.number="draft.token.backgrounds.maxUploadBytes" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_MAX_SOURCE_DIMENSION') }}</span><Input v-model.number="draft.token.backgrounds.maxSourceDimension" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_OFFSET_MIN') }}</span><Input v-model.number="draft.token.backgrounds.offsetMin" type="number" /></label>
          <label><span>{{ t('CONFIG_OFFSET_MAX') }}</span><Input v-model.number="draft.token.backgrounds.offsetMax" type="number" /></label>
        </section>

        <section class="configuration-section">
          <h3>{{ t('CONFIG_TOKEN_PREVIEW') }}</h3>
          <label><span>{{ t('CONFIG_PREVIEW_TOKEN_SIZE') }}</span><Input v-model.number="draft.token.preview.displayTokenSize" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_MIN_WORLD_SIZE') }}</span><Input v-model.number="draft.token.preview.minimumWorldSize" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_WORLD_SIZE_STEP') }}</span><Input v-model.number="draft.token.preview.worldSizeStep" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_PREVIEW_RENDERER') }}</span><Input v-model="draft.token.preview.renderer" /></label>
          <label><span>{{ t('CONFIG_DEVICE_PIXEL_RATIO_MAX') }}</span><Input v-model.number="draft.token.preview.devicePixelRatioMax" type="number" min="1" step="0.25" /></label>
          <label class="configuration-switch"><span><strong>{{ t('CONFIG_ANTIALIAS') }}</strong></span><Switch v-model="draft.token.preview.antialias" /></label>
          <label><span>{{ t('CONFIG_GUIDE_LINE_COLOR') }}</span><Input v-model="draft.token.preview.guide.lineColor" /></label>
          <label><span>{{ t('CONFIG_GUIDE_LINE_ALPHA') }}</span><Input v-model.number="draft.token.preview.guide.lineAlpha" type="number" min="0" max="1" step="0.05" /></label>
        </section>
          </div>
        </TabsContent>

        <TabsContent value="export" class="configuration-tab-content">
          <div class="configuration-grid">

        <section class="configuration-section">
          <h3>{{ t('CONFIG_HANDOUT_EXPORT_LIMITS') }}</h3>
          <label><span>{{ t('CONFIG_DEFAULT_EXPORT_SCALE') }}</span><Input v-model.number="draft.export.defaultScale" type="number" min="0.1" step="0.1" /></label>
          <label><span>{{ t('CONFIG_MIN_EXPORT_SCALE') }}</span><Input v-model.number="draft.export.minScale" type="number" min="0.01" step="0.01" /></label>
          <label><span>{{ t('CONFIG_RAW_RGBA_IPC_MAX_BYTES') }}</span><Input v-model.number="draft.export.rawRgbaIpcMaxBytes" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_MAX_CANVAS_DIMENSION') }}</span><Input v-model.number="draft.export.limits.maxCanvasDimension" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_MAX_CANVAS_PIXELS') }}</span><Input v-model.number="draft.export.limits.maxCanvasPixels" type="number" min="1" /></label>
        </section>

        <section class="configuration-section">
          <h3>{{ t('CONFIG_TOKEN_LAYOUT') }}</h3>
          <label><span>{{ t('CONFIG_LEFT_WIDTH') }}</span><Input v-model.number="draft.token.layout.leftWidth" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_RIGHT_WIDTH') }}</span><Input v-model.number="draft.token.layout.rightWidth" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_LEFT_MIN_WIDTH') }}</span><Input v-model.number="draft.token.layout.leftMinWidth" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_CENTER_MIN_WIDTH') }}</span><Input v-model.number="draft.token.layout.centerMinWidth" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_RIGHT_MIN_WIDTH') }}</span><Input v-model.number="draft.token.layout.rightMinWidth" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_RESIZE_HANDLE_WIDTH') }}</span><Input v-model.number="draft.token.layout.resizeHandleWidth" type="number" min="1" /></label>
        </section>

        <section class="configuration-section">
          <h3>{{ t('CONFIG_TOKEN_FILES_HISTORY_NOTIFICATIONS') }}</h3>
          <label><span>{{ t('CONFIG_THUMBNAIL_SIZE') }}</span><Input v-model.number="draft.token.files.thumbnailSize" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_IMPORT_FORMATS') }}</span><Input :model-value="draft.token.files.importFormats.join(', ')" @update:model-value="updateTokenImportFormats" /></label>
          <label><span>{{ t('CONFIG_EXPORT_FORMATS') }}</span><Input :model-value="draft.token.files.exportFormats.join(', ')" @update:model-value="updateTokenExportFormats" /></label>
          <label><span>{{ t('CONFIG_HISTORY_ENTRIES') }}</span><Input v-model.number="draft.token.history.maximumEntries" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_NOTIFICATION_DURATION') }}</span><Input v-model.number="draft.token.notifications.toastDurationMs" type="number" min="1" /></label>
        </section>

        <section class="configuration-section">
          <h3>{{ t('CONFIG_TOKEN_RINGS') }}</h3>
          <label><span>{{ t('CONFIG_RING_THUMBNAIL_SIZE') }}</span><Input v-model.number="draft.token.rings.thumbnailSize" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_REQUEST_DEBOUNCE') }}</span><Input v-model.number="draft.token.rings.requestDebounceMs" type="number" min="0" /></label>
          <label><span>{{ t('CONFIG_FRONTEND_RING_CACHE') }}</span><Input v-model.number="draft.token.rings.frontendCacheEntries" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_LEGACY_BACKEND_RING_CACHE') }}</span><Input v-model.number="draft.token.rings.backendCacheEntries" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_MAX_UPLOAD_BYTES') }}</span><Input v-model.number="draft.token.rings.maxUploadBytes" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_MAX_SOURCE_DIMENSION') }}</span><Input v-model.number="draft.token.rings.maxSourceDimension" type="number" min="1" /></label>
          <label><span>{{ t('CONFIG_CUSTOM_SCALE_MIN') }}</span><Input v-model.number="draft.token.rings.customScaleMin" type="number" min="0.01" /></label>
          <label><span>{{ t('CONFIG_CUSTOM_SCALE_MAX') }}</span><Input v-model.number="draft.token.rings.customScaleMax" type="number" min="0.01" /></label>
        </section>

        <section class="configuration-section">
          <h3>{{ t('CONFIG_HANDOUT_ENCODING_DEFAULTS') }}</h3>
          <label><span>{{ t('CONFIG_FORMAT') }}</span><Input v-model="draft.export.defaults.format" /></label>
          <label><span>{{ t('CONFIG_PNG_OPTIMIZATION') }}</span><Input v-model.number="draft.export.defaults.pngOptimizationLevel" type="number" min="0" max="6" /></label>
          <label><span>{{ t('EXPORT_JPEG_QUALITY') }}</span><Input v-model.number="draft.export.defaults.jpegQuality" type="number" min="1" max="100" /></label>
          <label><span>{{ t('EXPORT_WEBP_QUALITY') }}</span><Input v-model.number="draft.export.defaults.webpQuality" type="number" min="1" max="100" /></label>
          <label><span>{{ t('EXPORT_JXL_DISTANCE') }}</span><Input v-model.number="draft.export.defaults.jxlDistance" type="number" min="0" max="5" step="0.01" /></label>
          <label><span>{{ t('EXPORT_JXL_EFFORT') }}</span><Input v-model.number="draft.export.defaults.jxlEffort" type="number" min="1" max="9" /></label>
          <label><span>{{ t('CONFIG_JPEG_MATTE') }}</span><Input v-model="draft.export.rendering.jpegMatteColor" /></label>
          <label class="configuration-switch"><span><strong>{{ t('CONFIG_PNG_ALPHA_OPTIMIZATION') }}</strong></span><Switch v-model="draft.export.defaults.pngOptimizeAlpha" /></label>
          <label class="configuration-switch"><span><strong>{{ t('CONFIG_PNG_ZOPFLI') }}</strong></span><Switch v-model="draft.export.defaults.pngZopfli" /></label>
          <label class="configuration-switch"><span><strong>{{ t('EXPORT_JPEG_PROGRESSIVE') }}</strong></span><Switch v-model="draft.export.defaults.jpegProgressive" /></label>
          <label class="configuration-switch"><span><strong>{{ t('EXPORT_WEBP_LOSSLESS') }}</strong></span><Switch v-model="draft.export.defaults.webpLossless" /></label>
          <label class="configuration-switch"><span><strong>{{ t('EXPORT_JXL_LOSSLESS') }}</strong></span><Switch v-model="draft.export.defaults.jxlLossless" /></label>
        </section>

        <section class="configuration-section">
          <h3>{{ t('CONFIG_TOKEN_EXPORT_DEFAULTS') }}</h3>
          <label><span>{{ t('CONFIG_FORMAT') }}</span><Input v-model="draft.token.export.defaults.format" /></label>
          <label><span>{{ t('CONFIG_DEFAULT_EXPORT_SIZE') }}</span><Input v-model.number="draft.token.export.defaults.size" type="number" :min="draft.token.export.limits.sizeMin" :max="draft.token.export.limits.sizeMax" /></label>
          <label><span>{{ t('CONFIG_PNG_OPTIMIZATION') }}</span><Input v-model.number="draft.token.export.defaults.pngOptimizationLevel" type="number" min="0" max="6" /></label>
          <label><span>{{ t('EXPORT_JPEG_QUALITY') }}</span><Input v-model.number="draft.token.export.defaults.jpegQuality" type="number" min="1" max="100" /></label>
          <label><span>{{ t('EXPORT_WEBP_QUALITY') }}</span><Input v-model.number="draft.token.export.defaults.webpQuality" type="number" min="1" max="100" /></label>
          <label><span>{{ t('EXPORT_JXL_DISTANCE') }}</span><Input v-model.number="draft.token.export.defaults.jxlDistance" type="number" min="0" max="5" step="0.01" /></label>
          <label><span>{{ t('EXPORT_JXL_EFFORT') }}</span><Input v-model.number="draft.token.export.defaults.jxlEffort" type="number" min="1" max="9" /></label>
          <label><span>{{ t('CONFIG_JPEG_MATTE') }}</span><Input v-model="draft.token.export.rendering.jpegMatteColor" /></label>
          <label><span>{{ t('CONFIG_COLLISION_SEPARATOR') }}</span><Input v-model="draft.token.export.naming.collisionSeparator" /></label>
          <label><span>{{ t('CONFIG_COLLISION_START') }}</span><Input v-model.number="draft.token.export.naming.collisionStart" type="number" min="2" /></label>
          <label><span>{{ t('CONFIG_RANDOM_COLOR_PALETTE') }}</span><Input :model-value="draft.token.export.randomColors.palette.join(', ')" @update:model-value="updateTokenPalette" /></label>
          <label><span>{{ t('CONFIG_MIN_CONTRAST_RATIO') }}</span><Input v-model.number="draft.token.export.randomColors.minimumContrastRatio" type="number" min="1" max="21" step="0.1" /></label>
          <label><span>{{ t('CONFIG_MIN_OKLAB_DISTANCE') }}</span><Input v-model.number="draft.token.export.randomColors.minimumOklabDistance" type="number" min="0" max="1" step="0.01" /></label>
        </section>
          </div>
        </TabsContent>

        <TabsContent value="ai" class="configuration-tab-content">
          <div class="configuration-grid">
            <section class="configuration-section">
              <h3>{{ t('CONFIG_FOREGROUND_SEGMENTATION') }}</h3>
              <label class="configuration-switch"><span><ParameterLabel :label="t('CONFIG_ENABLE_FOREGROUND_SEGMENTATION')" :description="t('CONFIG_ENABLE_FOREGROUND_SEGMENTATION_HELP')" /></span><Switch v-model="draft.foregroundSegmentation.enabled" /></label>
              <label>
                <ParameterLabel :label="t('CONFIG_SEGMENTATION_MODEL')" :description="t('CONFIG_SEGMENTATION_MODEL_HELP')" />
                <Select v-model="draft.foregroundSegmentation.model">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="birefnet-general">BiRefNet General</SelectItem>
                    <SelectItem value="u2net">U²-Net</SelectItem>
                    <SelectItem value="ben2">BEN2 Base</SelectItem>
                    <SelectItem value="macos-vision" :disabled="!isMacOS">macOS Vision</SelectItem>
                  </SelectContent>
                </Select>
                <em v-if="!isMacOS">{{ t('CONFIG_VISION_FALLBACK_HELP') }}</em>
              </label>
              <label>
                <ParameterLabel :label="t('CONFIG_SEGMENTATION_DEVICE')" :description="t('CONFIG_SEGMENTATION_DEVICE_HELP')" />
                <Select v-model="draft.foregroundSegmentation.device">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{{ t('CONFIG_DEVICE_AUTO') }}</SelectItem>
                    <SelectItem value="cpu">CPU</SelectItem>
                    <SelectItem value="coreml" :disabled="!isMacOS">CoreML</SelectItem>
                    <SelectItem value="directml">DirectML</SelectItem>
                    <SelectItem value="cuda">CUDA</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label><ParameterLabel :label="t('CONFIG_WORKER_THREADS')" :description="t('CONFIG_WORKER_THREADS_HELP')" /><Input v-model.number="draft.foregroundSegmentation.workerThreads" type="number" min="1" /></label>
              <label><ParameterLabel :label="t('CONFIG_INTRA_OP_THREADS')" :description="t('CONFIG_INTRA_OP_THREADS_HELP')" /><Input v-model.number="draft.foregroundSegmentation.intraThreads" type="number" min="0" /></label>
              <label><ParameterLabel :label="t('CONFIG_INTER_OP_THREADS')" :description="t('CONFIG_INTER_OP_THREADS_HELP')" /><Input v-model.number="draft.foregroundSegmentation.interThreads" type="number" min="1" /></label>
              <label class="configuration-switch"><span><ParameterLabel :label="t('CONFIG_DOWNLOAD_MISSING_MODELS')" :description="t('CONFIG_DOWNLOAD_MISSING_MODELS_HELP')" /></span><Switch v-model="draft.foregroundSegmentation.downloadMissingModels" /></label>
              <label><ParameterLabel :label="t('CONFIG_DOWNLOAD_TIMEOUT')" :description="t('CONFIG_DOWNLOAD_TIMEOUT_HELP')" /><Input v-model.number="draft.foregroundSegmentation.downloadTimeoutSeconds" type="number" min="1" /></label>
              <label><ParameterLabel :label="t('CONFIG_MODEL_CACHE_DIRECTORY')" :description="t('CONFIG_MODEL_CACHE_DIRECTORY_HELP')" /><Input v-model="draft.foregroundSegmentation.modelCacheDirectory" /></label>
              <label><ParameterLabel :label="t('CONFIG_OUTPUT_SUFFIX')" :description="t('CONFIG_OUTPUT_SUFFIX_HELP')" /><Input v-model="draft.foregroundSegmentation.outputSuffix" /></label>
              <label><ParameterLabel :label="t('CONFIG_MAX_SOURCE_DIMENSION')" :description="t('CONFIG_MAX_SOURCE_DIMENSION_HELP')" /><Input v-model.number="draft.foregroundSegmentation.maxSourceDimension" type="number" min="1" /></label>
              <label><ParameterLabel :label="t('CONFIG_MAX_SOURCE_PIXELS')" :description="t('CONFIG_MAX_SOURCE_PIXELS_HELP')" /><Input v-model.number="draft.foregroundSegmentation.maxSourcePixels" type="number" min="1" /></label>
            </section>
          </div>
        </TabsContent>
      </Tabs>

      <p v-if="status" class="configuration-status">{{ status }}</p>

      <DialogFooter>
        <Button variant="outline" @click="open = false">{{ t('CLOSE') }}</Button>
        <Button :disabled="isLoading || isSaving" @click="saveConfiguration">
          {{ isSaving ? t('SAVING') : t('SAVE_SETTINGS') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.configuration-dialog {
  width: min(1440px, calc(100vw - 32px));
  max-width: none;
  max-height: min(86vh, 860px);
  border: 1px solid hsl(var(--border));
  background: hsl(var(--popover));
  color: hsl(var(--popover-foreground));
  box-shadow: 0 24px 70px hsl(222 31% 11% / 0.28);
}

.configuration-tabs {
  min-height: 0;
  overflow: hidden;
}

.configuration-tabs-list {
  width: 100%;
  justify-content: flex-start;
  border-bottom: 1px solid hsl(var(--border));
  border-radius: 0;
  background: transparent;
}

.configuration-tab-content {
  min-height: 0;
  max-height: min(66vh, 680px);
  overflow: auto;
  padding-right: 4px;
}

.configuration-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.configuration-section {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
  box-shadow: 0 1px 2px hsl(222 31% 11% / 0.06);
}

.configuration-section h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.configuration-section label {
  display: grid;
  gap: 5px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.configuration-switch {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.configuration-switch strong {
  display: block;
  color: hsl(var(--foreground));
  font-size: 12px;
}

.configuration-switch em {
  display: block;
  font-style: normal;
  line-height: 1.35;
}

.configuration-status {
  margin: 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

@media (max-width: 760px) {
  .configuration-grid {
    grid-template-columns: 1fr;
  }
}
</style>
