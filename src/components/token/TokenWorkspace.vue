<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref } from 'vue'
import { ArrowLeft, Download, FolderOpen, Layers, List, Minus, Plus, Redo2, Save, Undo2 } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import EditableProjectTitle from '@/components/editor/EditableProjectTitle.vue'
import { saveTokenProjectPreview } from '@/lib/backend'
import { appConfiguration } from '@/lib/configuration'
import { AppFrontendRingProvider } from '@/lib/token/rings/RingTextureProvider'
import { ringProviderKey } from '@/lib/token/rings/providerContext'
import { useTokenStore } from '@/stores/token'
import { translate } from '@/i18n'
import { useTokenRingStore } from '@/stores/token-rings'
import { isEditableTarget } from '@/lib/dom'
import TokenAssetFinder from './TokenAssetFinder.vue'
import TokenExportPanel from './TokenExportPanel.vue'
import TokenItemsPanel from './TokenItemsPanel.vue'
import TokenParametersPanel from './TokenParametersPanel.vue'
import TokenPreview from './TokenPreview.vue'

const token = useTokenStore()
const rings = useTokenRingStore()
const ringProvider = new AppFrontendRingProvider(appConfiguration.token, rings.descriptor)
provide(ringProviderKey, ringProvider)
const leftTab = ref('items')
const rightTab = ref('parameters')
const preview = ref<InstanceType<typeof TokenPreview>>()
const previewZoom = computed(() => Math.round((preview.value?.viewportZoom ?? 1) * 100))
const workspaceWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const layout = appConfiguration.token.layout
const panelPercent = (pixels: number) => Math.max(1, pixels / workspaceWidth.value * 100)
const leftDefaultSize = computed(() => panelPercent(layout.leftWidth))
const rightDefaultSize = computed(() => panelPercent(layout.rightWidth))
const centerDefaultSize = computed(() => Math.max(panelPercent(layout.centerMinWidth), 100 - leftDefaultSize.value - rightDefaultSize.value))

function syncWorkspaceWidth() {
  workspaceWidth.value = window.innerWidth
}

function handleTokenShortcut(event: KeyboardEvent) {
  if (isEditableTarget(event.target)) return
  const command = event.metaKey || event.ctrlKey
  if (!command) return
  const key = event.key.toLowerCase()
  if (key === 's') {
    event.preventDefault()
    void saveProject()
  } else if (key === 'z') {
    event.preventDefault()
    if (event.shiftKey) token.redo()
    else token.undo()
  } else if (key === 'y') {
    event.preventDefault()
    token.redo()
  }
}

onMounted(() => {
  window.addEventListener('resize', syncWorkspaceWidth)
  window.addEventListener('keydown', handleTokenShortcut)
  void rings.ensureMigrations()
})
onUnmounted(() => {
  window.removeEventListener('resize', syncWorkspaceWidth)
  window.removeEventListener('keydown', handleTokenShortcut)
  ringProvider.destroy()
})

async function saveProject() {
  await token.save()
  const dataUrl = preview.value?.capturePreview()
  if (dataUrl && token.document?.id) await saveTokenProjectPreview(token.document.id, dataUrl)
  await token.refreshProjects()
}

async function leaveEditor() {
  await saveProject()
  await token.close()
}

async function renameProject(title: string) {
  try {
    await token.renameCurrentProject(title)
  } catch (error) {
    token.status = translate('TOKEN_RENAME_FAILED')
  }
}
</script>

<template>
  <div
    class="token-workspace flex h-screen min-h-0 flex-col bg-background text-foreground"
    :style="{ '--token-resize-handle-width': `${appConfiguration.token.layout.resizeHandleWidth}px` }"
  >
    <ResizablePanelGroup direction="horizontal" class="min-h-0 flex-1 overflow-hidden">
      <ResizablePanel :default-size="leftDefaultSize" :min-size="panelPercent(layout.leftMinWidth)" :max-size="40" class="min-w-0 border-r border-border">
        <Tabs v-model="leftTab" class="flex h-full min-h-0 flex-col gap-0">
          <div class="token-panel-heading justify-start gap-2 px-2">
            <Button variant="ghost" size="icon" :title="$t('BACK_TO_PROJECT_MANAGER')" @click="leaveEditor"><ArrowLeft /></Button>
            <EditableProjectTitle :title="token.document?.title || $t('TOKEN_PROJECT')" @commit="renameProject" />
          </div>
          <TabsList class="token-underline-tabs grid grid-cols-2">
            <TabsTrigger value="items" class="token-underline-tab"><List />{{ $t('TOKEN_ITEMS') }}</TabsTrigger>
            <TabsTrigger value="assets" class="token-underline-tab"><FolderOpen />{{ $t('ASSETS') }}</TabsTrigger>
          </TabsList>
          <TabsContent value="items" class="mt-0 min-h-0 flex-1 overflow-hidden"><TokenItemsPanel /></TabsContent>
          <TabsContent value="assets" class="mt-0 min-h-0 flex-1 overflow-hidden"><TokenAssetFinder /></TabsContent>
        </Tabs>
      </ResizablePanel>

      <ResizableHandle with-handle />
      <ResizablePanel :default-size="centerDefaultSize" :min-size="panelPercent(layout.centerMinWidth)" class="min-w-0">
        <section class="flex h-full min-h-0 flex-col bg-background">
          <div class="token-panel-heading justify-between px-3">
            <p>{{ $t('TOKEN_PREVIEW') }}</p>
            <div class="flex items-center gap-1">
              <Button size="icon" variant="ghost" :title="$t('TOKEN_PREVIEW_ZOOM_OUT')" @click="preview?.changeViewportZoom(1 / 1.2)"><Minus /></Button>
              <Button size="sm" variant="ghost" :title="$t('TOKEN_PREVIEW_ZOOM_RESET')" @click="preview?.fitViewport()">{{ $t('VIEWPORT_FIT') }}</Button>
              <span class="w-10 text-center text-[11px] tabular-nums text-muted-foreground">{{ previewZoom }}%</span>
              <Button size="icon" variant="ghost" :title="$t('TOKEN_PREVIEW_ZOOM_IN')" @click="preview?.changeViewportZoom(1.2)"><Plus /></Button>
            </div>
          </div>
          <div class="min-h-0 flex-1 overflow-hidden p-2"><TokenPreview ref="preview" /></div>
          <p class="shrink-0 pb-2 text-center text-[11px] text-muted-foreground">{{ $t('TOKEN_PREVIEW_DRAG_HELP') }}</p>
        </section>
      </ResizablePanel>
      <ResizableHandle with-handle />

      <ResizablePanel :default-size="rightDefaultSize" :min-size="panelPercent(layout.rightMinWidth)" :max-size="45" class="min-w-0 border-l border-border">
        <Tabs v-model="rightTab" class="flex h-full min-h-0 flex-col gap-0">
          <div class="token-panel-heading justify-between px-3">
            <p>{{ $t('TOKEN_CONTROL_PANEL') }}</p>
            <div class="flex items-center gap-1">
              <Button variant="ghost" size="icon" :title="$t('UNDO')" :disabled="!token.canUndo" @click="token.undo()"><Undo2 /></Button>
              <Button variant="ghost" size="icon" :title="$t('REDO')" :disabled="!token.canRedo" @click="token.redo()"><Redo2 /></Button>
              <Button size="sm" @click="saveProject"><Save data-icon="inline-start" />{{ $t('SAVE') }}</Button>
            </div>
          </div>
          <TabsList class="token-underline-tabs grid grid-cols-2">
            <TabsTrigger value="parameters" class="token-underline-tab"><Layers />{{ $t('TOKEN_PARAMETERS') }}</TabsTrigger>
            <TabsTrigger value="export" class="token-underline-tab"><Download />{{ $t('TOKEN_EXPORT') }}</TabsTrigger>
          </TabsList>
          <TabsContent value="parameters" class="mt-0 min-h-0 flex-1 overflow-auto"><TokenParametersPanel /></TabsContent>
          <TabsContent value="export" class="mt-0 min-h-0 flex-1 overflow-auto"><TokenExportPanel /></TabsContent>
        </Tabs>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
</template>
