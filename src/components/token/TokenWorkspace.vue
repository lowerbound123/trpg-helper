<script setup lang="ts">
import { ref } from 'vue'
import { ArrowLeft, Redo2, Save, Undo2 } from '@lucide/vue'

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

    <ResizablePanelGroup direction="horizontal" class="min-h-0 flex-1">
      <ResizablePanel :default-size="appConfiguration.token.layout.leftWidth / 15.2" :min-size="14" :max-size="32" class="min-w-0">
        <Tabs v-model="leftTab" class="flex h-full min-h-0 flex-col">
          <TabsList class="m-2 mb-0 grid grid-cols-2"><TabsTrigger value="items">Items</TabsTrigger><TabsTrigger value="assets">Assets</TabsTrigger></TabsList>
          <TabsContent value="items" class="min-h-0 flex-1 overflow-hidden"><TokenItemsPanel /></TabsContent>
          <TabsContent value="assets" class="min-h-0 flex-1 overflow-hidden"><TokenAssetFinder /></TabsContent>
        </Tabs>
      </ResizablePanel>

      <ResizableHandle with-handle />
      <ResizablePanel :default-size="54" :min-size="30" class="min-w-0"><TokenPreview ref="preview" /></ResizablePanel>
      <ResizableHandle with-handle />

      <ResizablePanel :default-size="appConfiguration.token.layout.rightWidth / 15.2" :min-size="20" :max-size="40" class="min-w-0">
        <Tabs v-model="rightTab" class="flex h-full min-h-0 flex-col">
          <div class="border-b p-3 pb-0">
            <p class="mb-2 text-sm font-semibold">控制面板</p>
            <TabsList class="grid grid-cols-2"><TabsTrigger value="parameters">参数调整</TabsTrigger><TabsTrigger value="export">导出</TabsTrigger></TabsList>
          </div>
          <TabsContent value="parameters" class="min-h-0 flex-1 overflow-auto"><TokenParametersPanel /></TabsContent>
          <TabsContent value="export" class="min-h-0 flex-1 overflow-auto"><TokenExportPanel /></TabsContent>
        </Tabs>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
</template>
