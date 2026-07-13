<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ArrowLeft, Download, FolderOpen, Layers, List, Redo2, Save, Undo2 } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { saveTokenProjectPreview } from '@/lib/backend'
import { appConfiguration } from '@/lib/configuration'
import { useTokenStore } from '@/stores/token'
import TokenAssetFinder from './TokenAssetFinder.vue'
import TokenExportPanel from './TokenExportPanel.vue'
import TokenItemsPanel from './TokenItemsPanel.vue'
import TokenParametersPanel from './TokenParametersPanel.vue'
import TokenPreview from './TokenPreview.vue'

const token = useTokenStore()
const leftTab = ref('items')
const rightTab = ref('parameters')
const preview = ref<InstanceType<typeof TokenPreview>>()
const workspaceWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const layout = appConfiguration.token.layout
const panelPercent = (pixels: number) => Math.max(1, pixels / workspaceWidth.value * 100)
const leftDefaultSize = computed(() => panelPercent(layout.leftWidth))
const rightDefaultSize = computed(() => panelPercent(layout.rightWidth))
const centerDefaultSize = computed(() => Math.max(panelPercent(layout.centerMinWidth), 100 - leftDefaultSize.value - rightDefaultSize.value))

function syncWorkspaceWidth() {
  workspaceWidth.value = window.innerWidth
}

onMounted(() => window.addEventListener('resize', syncWorkspaceWidth))
onUnmounted(() => window.removeEventListener('resize', syncWorkspaceWidth))

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
</script>

<template>
  <div
    class="token-workspace flex h-screen min-h-0 flex-col bg-background text-foreground"
    :style="{ '--token-resize-handle-width': `${appConfiguration.token.layout.resizeHandleWidth}px` }"
  >
    <header class="flex h-14 shrink-0 items-center justify-between border-b px-3">
      <div class="flex min-w-0 items-center gap-2">
        <Button variant="ghost" size="icon" title="返回" @click="leaveEditor"><ArrowLeft /></Button>
        <div class="min-w-0">
          <strong class="block truncate text-sm">{{ token.document?.title || 'Token 项目' }}</strong>
          <span class="block truncate text-xs text-muted-foreground">{{ token.status }}</span>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <Button variant="outline" size="icon" title="撤销" :disabled="!token.canUndo" @click="token.undo()"><Undo2 /></Button>
        <Button variant="outline" size="icon" title="重做" :disabled="!token.canRedo" @click="token.redo()"><Redo2 /></Button>
        <Button size="sm" @click="saveProject"><Save data-icon="inline-start" />保存</Button>
      </div>
    </header>

    <ResizablePanelGroup direction="horizontal" class="min-h-0 flex-1 overflow-hidden">
      <ResizablePanel :default-size="leftDefaultSize" :min-size="panelPercent(layout.leftMinWidth)" :max-size="40" class="min-w-0 border-r border-border">
        <Tabs v-model="leftTab" class="flex h-full min-h-0 flex-col gap-0">
          <div class="token-panel-heading"><p>文件列表</p></div>
          <TabsList class="token-underline-tabs grid grid-cols-2">
            <TabsTrigger value="items" class="token-underline-tab"><List />Items</TabsTrigger>
            <TabsTrigger value="assets" class="token-underline-tab"><FolderOpen />Assets</TabsTrigger>
          </TabsList>
          <TabsContent value="items" class="mt-0 min-h-0 flex-1 overflow-hidden"><TokenItemsPanel /></TabsContent>
          <TabsContent value="assets" class="mt-0 min-h-0 flex-1 overflow-hidden"><TokenAssetFinder /></TabsContent>
        </Tabs>
      </ResizablePanel>

      <ResizableHandle with-handle />
      <ResizablePanel :default-size="centerDefaultSize" :min-size="panelPercent(layout.centerMinWidth)" class="min-w-0">
        <section class="flex h-full min-h-0 flex-col bg-background">
          <div class="token-panel-heading"><p>实时预览</p></div>
          <div class="min-h-0 flex-1 overflow-hidden p-2"><TokenPreview ref="preview" /></div>
          <p class="shrink-0 pb-2 text-center text-[11px] text-muted-foreground">拖动预览区域可移动 Token，滚轮可缩放</p>
        </section>
      </ResizablePanel>
      <ResizableHandle with-handle />

      <ResizablePanel :default-size="rightDefaultSize" :min-size="panelPercent(layout.rightMinWidth)" :max-size="45" class="min-w-0 border-l border-border">
        <Tabs v-model="rightTab" class="flex h-full min-h-0 flex-col gap-0">
          <div class="token-panel-heading"><p>控制面板</p></div>
          <TabsList class="token-underline-tabs grid grid-cols-2">
            <TabsTrigger value="parameters" class="token-underline-tab"><Layers />参数调整</TabsTrigger>
            <TabsTrigger value="export" class="token-underline-tab"><Download />导出</TabsTrigger>
          </TabsList>
          <TabsContent value="parameters" class="mt-0 min-h-0 flex-1 overflow-auto"><TokenParametersPanel /></TabsContent>
          <TabsContent value="export" class="mt-0 min-h-0 flex-1 overflow-auto"><TokenExportPanel /></TabsContent>
        </Tabs>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
</template>
