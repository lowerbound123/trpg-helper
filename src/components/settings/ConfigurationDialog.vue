<script setup lang="ts">
import { reactive, ref, watch } from 'vue'

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
import { Switch } from '@/components/ui/switch'

const open = defineModel<boolean>('open', { required: true })

const isLoading = ref(false)
const isSaving = ref(false)
const status = ref('')

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const draft = reactive<AppConfiguration>(cloneValue(appConfiguration))

function replaceDraft(next: AppConfiguration) {
  Object.assign(draft.paths, next.paths)
  Object.assign(draft.uploads, next.uploads)
  Object.assign(draft.previews, next.previews)
  Object.assign(draft.finder, next.finder)
  Object.assign(draft.editor, next.editor)
  Object.assign(draft.mask, next.mask)
  Object.assign(draft.export, next.export)
  Object.assign(draft.debug, next.debug)
  Object.assign(draft.token, cloneValue(next.token))
}

function normalizeNumber(value: number, fallback: number, min?: number) {
  const next = Number(value)
  if (!Number.isFinite(next)) return fallback
  return min === undefined ? next : Math.max(min, next)
}

function normalizeDraft() {
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
  draft.export.defaultScale = normalizeNumber(draft.export.defaultScale, appConfiguration.export.defaultScale, 0.1)
  draft.export.minScale = normalizeNumber(draft.export.minScale, appConfiguration.export.minScale, 0.01)
  draft.token.defaults.designSize = normalizeNumber(draft.token.defaults.designSize, appConfiguration.token.defaults.designSize, 1)
  draft.token.defaults.scale = normalizeNumber(draft.token.defaults.scale, appConfiguration.token.defaults.scale, draft.token.limits.scaleMin)
  draft.token.defaults.ringInnerRadius = normalizeNumber(draft.token.defaults.ringInnerRadius, appConfiguration.token.defaults.ringInnerRadius, 0)
  draft.token.defaults.ringOuterRadius = normalizeNumber(draft.token.defaults.ringOuterRadius, appConfiguration.token.defaults.ringOuterRadius, 1)
  draft.token.export.defaults.size = normalizeNumber(draft.token.export.defaults.size, appConfiguration.token.export.defaults.size, draft.token.export.limits.sizeMin)
  draft.token.preview.displayTokenSize = normalizeNumber(draft.token.preview.displayTokenSize, appConfiguration.token.preview.displayTokenSize, 1)
  draft.token.history.maximumEntries = normalizeNumber(draft.token.history.maximumEntries, appConfiguration.token.history.maximumEntries, 1)
}

async function loadConfiguration() {
  isLoading.value = true
  status.value = ''
  try {
    const source = await readConfiguration()
    replaceDraft(configurationFromToml(source))
  } catch (error) {
    status.value = `Failed to load configuration: ${String(error)}`
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
    status.value = `Saved to ${path}. Restart the app to apply changes.`
  } catch (error) {
    status.value = `Failed to save configuration: ${String(error)}`
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
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>
          Edit local configuration. Changes are written to configuration.toml and take effect after restart.
        </DialogDescription>
      </DialogHeader>

      <div class="configuration-grid" :aria-busy="isLoading">
        <section class="configuration-section">
          <h3>Paths</h3>
          <label>
            <span>Data directory</span>
            <Input v-model="draft.paths.dataDir" />
          </label>
          <label>
            <span>Log file</span>
            <Input v-model="draft.paths.logFile" />
          </label>
        </section>

        <section class="configuration-section">
          <h3>Uploads & previews</h3>
          <label>
            <span>Max upload size</span>
            <Input v-model="draft.uploads.maxFileSize" />
          </label>
          <label>
            <span>Thumbnail max edge</span>
            <Input v-model.number="draft.previews.thumbnailMaxEdgePx" type="number" min="1" />
          </label>
          <label>
            <span>Thumbnail quality</span>
            <Input v-model.number="draft.previews.thumbnailQuality" type="number" min="1" max="100" />
          </label>
          <label>
            <span>Preview target bytes</span>
            <Input v-model.number="draft.previews.targetMaxBytes" type="number" min="1" />
          </label>
        </section>

        <section class="configuration-section">
          <h3>Finder</h3>
          <label>
            <span>Manager height</span>
            <Input v-model.number="draft.finder.managerHeightPx" type="number" min="1" />
          </label>
          <label>
            <span>Compact height</span>
            <Input v-model.number="draft.finder.compactHeightPx" type="number" min="1" />
          </label>
          <label>
            <span>Handout grid scale</span>
            <Input v-model.number="draft.finder.handoutGridScale" type="number" min="0.25" step="0.25" />
          </label>
          <label>
            <span>Background grid scale</span>
            <Input v-model.number="draft.finder.backgroundGridScale" type="number" min="0.25" step="0.25" />
          </label>
        </section>

        <section class="configuration-section">
          <h3>Editor</h3>
          <label>
            <span>Snap threshold px</span>
            <Input v-model.number="draft.editor.snapThresholdScreenPx" type="number" min="0" />
          </label>
          <label>
            <span>Max snap candidates</span>
            <Input v-model.number="draft.editor.maxSnapCandidates" type="number" min="0" />
          </label>
          <label>
            <span>Continuous commit delay</span>
            <Input v-model.number="draft.editor.continuousEditCommitDelayMs" type="number" min="0" />
          </label>
        </section>

        <section class="configuration-section">
          <h3>Mask</h3>
          <label class="configuration-switch">
            <span>
              <strong>Enable masks</strong>
              <em>Turns all mask UI and rendering on or off.</em>
            </span>
            <Switch v-model:checked="draft.mask.enabled" />
          </label>
          <label class="configuration-switch">
            <span>
              <strong>Use Pixi preview</strong>
              <em>Only affects low-frequency preview composition.</em>
            </span>
            <Switch v-model:checked="draft.mask.usePixiPreview" :disabled="!draft.mask.enabled" />
          </label>
          <label>
            <span>Stroke preview min opacity</span>
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
            <span>Secondary refresh delay ms</span>
            <Input
              v-model.number="draft.mask.interactiveRefreshDelayMs"
              type="number"
              min="0"
              step="50"
              :disabled="!draft.mask.enabled"
            />
          </label>
          <label>
            <span>Secondary pointer idle grace ms</span>
            <Input
              v-model.number="draft.mask.pointerIdleGraceMs"
              type="number"
              min="0"
              step="10"
              :disabled="!draft.mask.enabled"
            />
          </label>
        </section>

        <section class="configuration-section">
          <h3>Export & debug</h3>
          <label>
            <span>Default export scale</span>
            <Input v-model.number="draft.export.defaultScale" type="number" min="0.1" step="0.1" />
          </label>
          <label>
            <span>Min export scale</span>
            <Input v-model.number="draft.export.minScale" type="number" min="0.01" step="0.01" />
          </label>
          <label class="configuration-switch">
            <span>
              <strong>File log</strong>
              <em>Write debug logs to the configured log file.</em>
            </span>
            <Switch v-model:checked="draft.debug.fileLogEnabled" />
          </label>
          <label class="configuration-switch">
            <span>
              <strong>Render perf log</strong>
              <em>Include mask/export/render timing logs.</em>
            </span>
            <Switch v-model:checked="draft.debug.renderPerfLogEnabled" />
          </label>
        </section>

        <section class="configuration-section">
          <h3>Token defaults</h3>
          <label><span>Design size</span><Input v-model.number="draft.token.defaults.designSize" type="number" min="1" /></label>
          <label><span>Avatar scale</span><Input v-model.number="draft.token.defaults.scale" type="number" :min="draft.token.limits.scaleMin" :max="draft.token.limits.scaleMax" /></label>
          <label><span>Ring inner radius</span><Input v-model.number="draft.token.defaults.ringInnerRadius" type="number" min="0" /></label>
          <label><span>Ring outer radius</span><Input v-model.number="draft.token.defaults.ringOuterRadius" type="number" min="1" /></label>
          <label><span>Default export size</span><Input v-model.number="draft.token.export.defaults.size" type="number" :min="draft.token.export.limits.sizeMin" :max="draft.token.export.limits.sizeMax" /></label>
          <label><span>Preview token size</span><Input v-model.number="draft.token.preview.displayTokenSize" type="number" min="1" /></label>
          <label><span>History entries</span><Input v-model.number="draft.token.history.maximumEntries" type="number" min="1" /></label>
        </section>
      </div>

      <p v-if="status" class="configuration-status">{{ status }}</p>

      <DialogFooter>
        <Button variant="outline" @click="open = false">Close</Button>
        <Button :disabled="isLoading || isSaving" @click="saveConfiguration">
          {{ isSaving ? 'Saving...' : 'Save settings' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.configuration-dialog {
  width: min(920px, calc(100vw - 32px));
  max-width: none;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--popover));
  color: hsl(var(--popover-foreground));
  box-shadow: 0 24px 70px hsl(222 31% 11% / 0.28);
}

.configuration-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  max-height: min(66vh, 680px);
  overflow: auto;
  padding-right: 4px;
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

.configuration-switch :deep([data-slot="switch"]) {
  width: 42px;
  height: 24px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--muted));
  box-shadow: inset 0 0 0 1px hsl(222 31% 11% / 0.08);
}

.configuration-switch :deep([data-slot="switch"][data-state="checked"]) {
  border-color: hsl(var(--accent));
  background: hsl(var(--accent));
}

.configuration-switch :deep([data-slot="switch-thumb"]) {
  width: 20px;
  height: 20px;
  background: hsl(var(--card));
  box-shadow: 0 1px 4px hsl(222 31% 11% / 0.3);
}

.configuration-switch :deep([data-slot="switch"][data-state="checked"] [data-slot="switch-thumb"]) {
  background: hsl(var(--accent-foreground));
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
