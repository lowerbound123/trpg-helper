<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowLeft, Check, Redo2, Save, Trash2, Undo2 } from '@lucide/vue'

import NumericSliderField from '@/components/controls/NumericSliderField.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fileUrl, saveTokenProjectPreview, updateTokenRingConfig } from '@/lib/backend'
import { appConfiguration } from '@/lib/configuration'
import type { TokenExportSettings, TokenRingConfig, TokenVisualStyle } from '@/lib/token'
import { useEditorStore } from '@/stores/editor'
import { useTokenStore } from '@/stores/token'
import { useTokenExport } from '@/composables/useTokenExport'
import TokenPreview from './TokenPreview.vue'

const token = useTokenStore()
const editor = useEditorStore()
const { progress: exportProgress, percentage: exportPercentage, exportScope } = useTokenExport()
const leftTab = ref('items')
const rightTab = ref('parameters')
const assetSearch = ref('')
const sourceInput = ref<HTMLInputElement>()
const sourceFolderInput = ref<HTMLInputElement>()
const ringInput = ref<HTMLInputElement>()
const preview = ref<InstanceType<typeof TokenPreview>>()
const ringDraft = ref<TokenRingConfig>()

const style = computed(() => token.selectedItem?.style)
const exportSettings = computed(() => token.document?.exportSettings)
const tokenAssets = computed(() => {
  const query = assetSearch.value.trim().toLowerCase()
  return editor.library.assets.filter((asset) =>
    asset.mediaType.startsWith('image/')
      && (!query || [asset.name, ...asset.tags].some((value) => value.toLowerCase().includes(query))),
  )
})
const customRings = computed(() => editor.library.assets.filter((asset) => asset.tokenRing))
const selectedCustomRing = computed(() => {
  const id = style.value?.ringStyle.startsWith('asset:') ? style.value.ringStyle.slice('asset:'.length) : ''
  return id ? editor.resolveAsset(id) : undefined
})
const builtinRings = ['solid', 'double', 'dashed', 'dots', 'gradient_inner', 'bevel', 'segmented', 'circuit', 'arcane', 'notched', 'braided']

function checked(itemId: string) {
  return token.checkedItemIds.includes(itemId)
}

function setChecked(itemId: string, value: boolean | 'indeterminate') {
  const ids = new Set(token.checkedItemIds)
  if (value === true) ids.add(itemId)
  else ids.delete(itemId)
  token.checkedItemIds = [...ids]
}

function updateStyle<K extends keyof TokenVisualStyle>(key: K, value: TokenVisualStyle[K]) {
  token.updateVisualStyle(key, value)
}

function updateExport<K extends keyof TokenExportSettings>(key: K, value: TokenExportSettings[K]) {
  token.updateExportSetting(key, value)
}

async function leaveEditor() {
  await saveProject()
  await token.close()
}

async function saveProject() {
  await token.save()
  const dataUrl = preview.value?.capturePreview()
  if (dataUrl && token.document?.id) await saveTokenProjectPreview(token.document.id, dataUrl)
  await token.refreshProjects()
}

async function importTokenSources(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? [])
  const imported = []
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    imported.push(await editor.importAssetFile(file, '', 'token-tmp'))
  }
  token.addAssets(imported)
  ;(event.target as HTMLInputElement).value = ''
}

async function importCustomRing(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const asset = await editor.importAssetFile(file, 'token-ring', 'rings')
  updateStyle('ringStyle', `asset:${asset.id}`)
  token.commitEdit()
  ;(event.target as HTMLInputElement).value = ''
}

async function saveRingGeometry() {
  const asset = selectedCustomRing.value
  const config = ringDraft.value
  if (!asset?.tokenRing || !config) return
  await updateTokenRingConfig(asset.id, asset.tokenRing.revision, config)
  await editor.refreshLibrary()
}

watch(selectedCustomRing, (asset) => {
  ringDraft.value = asset?.tokenRing ? structuredClone(asset.tokenRing) : undefined
}, { immediate: true })
</script>

<template>
  <div class="flex h-screen min-h-0 flex-col bg-background text-foreground">
    <header class="flex h-14 shrink-0 items-center justify-between border-b px-3">
      <div class="flex min-w-0 items-center gap-2">
        <Button variant="ghost" size="icon" title="Back" @click="leaveEditor"><ArrowLeft /></Button>
        <div class="min-w-0">
          <strong class="block truncate text-sm">{{ token.document?.title || 'Token project' }}</strong>
          <span class="block truncate text-xs text-muted-foreground">{{ token.status }}</span>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <Button variant="outline" size="icon" title="Undo" :disabled="!token.canUndo" @click="token.undo()"><Undo2 /></Button>
        <Button variant="outline" size="icon" title="Redo" :disabled="!token.canRedo" @click="token.redo()"><Redo2 /></Button>
        <Button size="sm" @click="saveProject"><Save data-icon="inline-start" />Save</Button>
      </div>
    </header>

    <ResizablePanelGroup direction="horizontal" class="min-h-0 flex-1">
      <ResizablePanel :default-size="20" :min-size="14" :max-size="32" class="min-w-0">
        <Tabs v-model="leftTab" class="flex h-full min-h-0 flex-col p-2">
          <TabsList class="grid w-full grid-cols-2"><TabsTrigger value="items">Items</TabsTrigger><TabsTrigger value="assets">Assets</TabsTrigger></TabsList>
          <TabsContent value="items" class="min-h-0 flex-1 overflow-auto pt-2">
            <div class="mb-2 flex items-center justify-between gap-2">
              <span class="text-xs text-muted-foreground">{{ token.items.length }} images</span>
              <Button size="sm" variant="outline" :disabled="!token.selectedItem || !token.checkedItemIds.length" @click="token.applyCurrentStyleToChecked()">
                <Check data-icon="inline-start" />Apply style
              </Button>
            </div>
            <button
              v-for="item in token.items"
              :key="item.id"
              type="button"
              class="mb-1 grid w-full grid-cols-[auto_44px_minmax(0,1fr)_auto] items-center gap-2 border p-1.5 text-left"
              :class="item.id === token.selectedItemId ? 'border-primary bg-accent' : 'border-border'"
              @click="token.selectedItemId = item.id"
            >
              <input type="checkbox" :checked="checked(item.id)" @click.stop @change="setChecked(item.id, ($event.target as HTMLInputElement).checked)" />
              <img class="h-11 w-11 object-cover" :src="fileUrl(token.resolvedSources[item.id] || item.sourcePath)" alt="" />
              <span class="truncate text-xs">{{ item.name }}</span>
              <Button size="icon" variant="ghost" title="Remove" @click.stop="token.removeItem(item.id)"><Trash2 /></Button>
            </button>
          </TabsContent>
          <TabsContent value="assets" class="min-h-0 flex-1 overflow-auto pt-2">
            <div class="mb-2 grid grid-cols-2 gap-1">
              <Button size="sm" variant="outline" @click="sourceInput?.click()">Import files</Button>
              <Button size="sm" variant="outline" @click="sourceFolderInput?.click()">Import folder</Button>
              <input ref="sourceInput" class="hidden" type="file" accept="image/*" multiple @change="importTokenSources" />
              <input ref="sourceFolderInput" class="hidden" type="file" accept="image/*" multiple webkitdirectory @change="importTokenSources" />
            </div>
            <Input v-model="assetSearch" class="mb-2" placeholder="Search assets" />
            <button
              v-for="asset in tokenAssets"
              :key="asset.id"
              type="button"
              class="mb-1 grid w-full grid-cols-[44px_minmax(0,1fr)] items-center gap-2 border p-1.5 text-left"
              @dblclick="token.addAssets([asset])"
            >
              <img class="h-11 w-11 object-cover" :src="fileUrl(asset.thumbnailPath || asset.path)" alt="" />
              <span class="truncate text-xs">{{ asset.name }}</span>
            </button>
          </TabsContent>
        </Tabs>
      </ResizablePanel>

      <ResizableHandle with-handle />

      <ResizablePanel :default-size="55" :min-size="35" class="min-w-0">
        <TokenPreview ref="preview" />
      </ResizablePanel>

      <ResizableHandle with-handle />

      <ResizablePanel :default-size="25" :min-size="18" :max-size="38" class="min-w-0">
        <Tabs v-model="rightTab" class="flex h-full min-h-0 flex-col p-2">
          <TabsList class="grid w-full grid-cols-2"><TabsTrigger value="parameters">参数</TabsTrigger><TabsTrigger value="export">导出</TabsTrigger></TabsList>
          <TabsContent value="parameters" class="min-h-0 flex-1 space-y-3 overflow-auto pt-3">
            <template v-if="style">
              <NumericSliderField label="Scale" :model-value="style.scale" :min="appConfiguration.token.limits.scaleMin" :max="appConfiguration.token.limits.scaleMax" :step="appConfiguration.token.limits.scaleStep" unit="%" @edit-start="token.beginEdit()" @update:model-value="updateStyle('scale', $event)" @commit="token.commitEdit()" />
              <NumericSliderField label="Offset X" :model-value="style.offsetX" :min="appConfiguration.token.limits.offsetMin" :max="appConfiguration.token.limits.offsetMax" @edit-start="token.beginEdit()" @update:model-value="updateStyle('offsetX', $event)" @commit="token.commitEdit()" />
              <NumericSliderField label="Offset Y" :model-value="style.offsetY" :min="appConfiguration.token.limits.offsetMin" :max="appConfiguration.token.limits.offsetMax" @edit-start="token.beginEdit()" @update:model-value="updateStyle('offsetY', $event)" @commit="token.commitEdit()" />
              <label class="grid gap-1 text-xs"><span>Background</span><Input type="color" :model-value="style.background.slice(0, 7)" @update:model-value="updateStyle('background', `${$event}FF`)" @change="token.commitEdit()" /></label>
              <label class="grid gap-1 text-xs"><span>Ring style</span><select class="h-9 border bg-background px-2" :value="style.ringStyle" @change="updateStyle('ringStyle', ($event.target as HTMLSelectElement).value); token.commitEdit()"><option v-for="ring in builtinRings" :key="ring" :value="ring">{{ ring }}</option><option v-for="ring in customRings" :key="ring.id" :value="`asset:${ring.id}`">{{ ring.name }}</option></select></label>
              <Button size="sm" variant="outline" @click="ringInput?.click()">Import custom ring</Button>
              <input ref="ringInput" class="hidden" type="file" accept="image/*" @change="importCustomRing" />
              <div v-if="ringDraft && selectedCustomRing" class="space-y-2 border p-2">
                <strong class="text-xs">Custom ring geometry</strong>
                <NumericSliderField label="Design size" :model-value="ringDraft.designSize" :min="64" :max="4096" @update:model-value="ringDraft!.designSize = $event" />
                <NumericSliderField label="Inner radius" :model-value="ringDraft.innerRadius" :min="0" :max="ringDraft.designSize / 2" @update:model-value="ringDraft!.innerRadius = $event" />
                <NumericSliderField label="Outer radius" :model-value="ringDraft.outerRadius" :min="1" :max="ringDraft.designSize / 2" @update:model-value="ringDraft!.outerRadius = $event" />
                <NumericSliderField label="Asset scale" :model-value="ringDraft.assetScale" :min="0.1" :max="5" :step="0.01" @update:model-value="ringDraft!.assetScale = $event" />
                <NumericSliderField label="Offset X" :model-value="ringDraft.offsetX" :min="-512" :max="512" @update:model-value="ringDraft!.offsetX = $event" />
                <NumericSliderField label="Offset Y" :model-value="ringDraft.offsetY" :min="-512" :max="512" @update:model-value="ringDraft!.offsetY = $event" />
                <Button size="sm" class="w-full" @click="saveRingGeometry">Update ring</Button>
              </div>
              <label class="grid gap-1 text-xs"><span>Ring color</span><Input type="color" :model-value="style.ringColor.slice(0, 7)" @update:model-value="updateStyle('ringColor', `${$event}FF`)" @change="token.commitEdit()" /></label>
              <NumericSliderField label="Inner radius" :model-value="style.ringInnerRadius" :min="0" :max="512" @edit-start="token.beginEdit()" @update:model-value="updateStyle('ringInnerRadius', $event)" @commit="token.commitEdit()" />
              <NumericSliderField label="Outer radius" :model-value="style.ringOuterRadius" :min="0" :max="512" @edit-start="token.beginEdit()" @update:model-value="updateStyle('ringOuterRadius', $event)" @commit="token.commitEdit()" />
              <NumericSliderField label="Ring stretch X" :model-value="style.ringStretchX" :min="appConfiguration.token.limits.ringStretchMin" :max="appConfiguration.token.limits.ringStretchMax" :step="0.01" @edit-start="token.beginEdit()" @update:model-value="updateStyle('ringStretchX', $event)" @commit="token.commitEdit()" />
              <NumericSliderField label="Ring stretch Y" :model-value="style.ringStretchY" :min="appConfiguration.token.limits.ringStretchMin" :max="appConfiguration.token.limits.ringStretchMax" :step="0.01" @edit-start="token.beginEdit()" @update:model-value="updateStyle('ringStretchY', $event)" @commit="token.commitEdit()" />
              <label class="flex items-center justify-between text-xs"><span>Split ring</span><Switch :checked="style.splitRing" @update:checked="updateStyle('splitRing', $event); token.commitEdit()" /></label>
              <NumericSliderField v-if="style.splitRing" label="Split angle" :model-value="style.splitAngle" :min="0" :max="359" @edit-start="token.beginEdit()" @update:model-value="updateStyle('splitAngle', $event)" @commit="token.commitEdit()" />
              <NumericSliderField v-if="style.splitRing" label="Split height" :model-value="style.splitHeight" :min="-100" :max="100" @edit-start="token.beginEdit()" @update:model-value="updateStyle('splitHeight', $event)" @commit="token.commitEdit()" />
            </template>
          </TabsContent>
          <TabsContent value="export" class="min-h-0 flex-1 space-y-3 overflow-auto pt-3">
            <template v-if="exportSettings">
              <label class="grid gap-1 text-xs"><span>Format</span><select class="h-9 border bg-background px-2" :value="exportSettings.exportFormat" @change="updateExport('exportFormat', ($event.target as HTMLSelectElement).value as TokenExportSettings['exportFormat']); token.commitEdit()"><option v-for="format in appConfiguration.token.files.exportFormats" :key="format" :value="format">{{ format.toUpperCase() }}</option></select></label>
              <NumericSliderField label="Size" :model-value="exportSettings.exportSize" :min="appConfiguration.token.export.limits.sizeMin" :max="appConfiguration.token.export.limits.sizeMax" @edit-start="token.beginEdit()" @update:model-value="updateExport('exportSize', $event)" @commit="token.commitEdit()" />
              <NumericSliderField v-if="exportSettings.exportFormat === 'jpg'" label="JPEG quality" :model-value="exportSettings.jpegQuality" :min="1" :max="100" unit="%" @edit-start="token.beginEdit()" @update:model-value="updateExport('jpegQuality', $event)" @commit="token.commitEdit()" />
              <NumericSliderField v-if="exportSettings.exportFormat === 'webp'" label="WebP quality" :model-value="exportSettings.webpQuality" :min="1" :max="100" unit="%" @edit-start="token.beginEdit()" @update:model-value="updateExport('webpQuality', $event)" @commit="token.commitEdit()" />
              <NumericSliderField v-if="exportSettings.exportFormat === 'jxl'" label="JXL distance" :model-value="exportSettings.jxlDistance" :min="0" :max="5" :step="0.1" @edit-start="token.beginEdit()" @update:model-value="updateExport('jxlDistance', $event)" @commit="token.commitEdit()" />
              <label class="flex items-center justify-between text-xs"><span>Random background</span><Switch :checked="exportSettings.randomBackground" @update:checked="updateExport('randomBackground', $event); token.commitEdit()" /></label>
              <label class="flex items-center justify-between text-xs"><span>Random ring color</span><Switch :checked="exportSettings.randomRingColor" @update:checked="updateExport('randomRingColor', $event); token.commitEdit()" /></label>
              <p class="text-xs text-muted-foreground">导出可使用勾选项、当前项或全部项目项。</p>
              <div class="grid grid-cols-3 gap-1">
                <Button size="sm" variant="outline" :disabled="exportProgress.running || !token.selectedItem" @click="exportScope('current')">Current</Button>
                <Button size="sm" variant="outline" :disabled="exportProgress.running || !token.checkedItemIds.length" @click="exportScope('checked')">Checked</Button>
                <Button size="sm" :disabled="exportProgress.running || !token.items.length" @click="exportScope('all')">All</Button>
              </div>
              <p v-if="exportProgress.running" class="text-xs text-muted-foreground">{{ exportProgress.phase }} · {{ exportPercentage }}%</p>
              <p v-if="exportProgress.error" class="text-xs text-destructive">{{ exportProgress.error }}</p>
            </template>
          </TabsContent>
        </Tabs>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
</template>
