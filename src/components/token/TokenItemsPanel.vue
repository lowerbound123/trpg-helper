<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, FolderOpen, Plus, Trash2 } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { fileUrl } from '@/lib/backend'
import { useEditorStore } from '@/stores/editor'
import { useTokenStore } from '@/stores/token'

const token = useTokenStore()
const editor = useEditorStore()
const fileInput = ref<HTMLInputElement>()
const folderInput = ref<HTMLInputElement>()
const dragging = ref(false)
const allChecked = computed(() => token.items.length > 0 && token.items.every((item) => token.checkedItemIds.includes(item.id)))

function setChecked(itemId: string, checked: boolean) {
  const ids = new Set(token.checkedItemIds)
  if (checked) ids.add(itemId)
  else ids.delete(itemId)
  token.checkedItemIds = [...ids]
}

async function importFiles(files: File[]) {
  const imported = []
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    imported.push(await editor.importAssetFile(file, '', 'token-tmp'))
  }
  const added = token.addAssets(imported)
  token.status = `已添加 ${added} 张图片`
}

async function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  await importFiles(Array.from(input.files ?? []))
  input.value = ''
}

async function onDrop(event: DragEvent) {
  dragging.value = false
  await importFiles(Array.from(event.dataTransfer?.files ?? []))
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="space-y-2 border-b p-3">
      <div class="flex gap-1">
        <Button size="sm" variant="outline" class="flex-1 text-xs" @click="fileInput?.click()">
          <Plus data-icon="inline-start" />添加图片
        </Button>
        <Button size="sm" variant="outline" class="flex-1 text-xs" @click="folderInput?.click()">
          <FolderOpen data-icon="inline-start" />添加文件夹
        </Button>
      </div>
      <input ref="fileInput" class="hidden" type="file" accept="image/*" multiple @change="onInput" />
      <input ref="folderInput" class="hidden" type="file" accept="image/*" multiple webkitdirectory @change="onInput" />
      <div class="grid grid-cols-2 gap-1">
        <Button size="sm" variant="outline" class="text-xs" :disabled="!token.items.length" @click="token.toggleAllChecked()">
          {{ allChecked ? '取消全选' : '全选' }}
        </Button>
        <Button size="sm" variant="outline" class="text-xs" :disabled="!token.selectedItem || !token.checkedItemIds.length" @click="token.applyCurrentStyleToChecked()">
          <Check data-icon="inline-start" />应用样式 ({{ token.checkedItemIds.length }})
        </Button>
      </div>
      <Button size="sm" variant="ghost" class="w-full text-xs text-muted-foreground" :disabled="!token.items.length" @click="token.clearItems()">
        <Trash2 data-icon="inline-start" />清空全部 ({{ token.items.length }})
      </Button>
    </div>

    <div class="min-h-0 flex-1 overflow-auto">
      <div
        class="m-2 rounded-lg border-2 border-dashed p-4 text-center text-xs text-muted-foreground transition-colors"
        :class="dragging ? 'border-primary bg-primary/5 text-primary' : 'border-border'"
        @dragenter.prevent="dragging = true"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        {{ dragging ? '释放以添加图片' : '拖放图片到此处导入' }}
      </div>
      <div class="space-y-1 p-2 pt-0">
        <button
          v-for="item in token.items"
          :key="item.id"
          type="button"
          class="grid w-full grid-cols-[auto_40px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border p-2 text-left text-xs transition-colors"
          :class="item.id === token.selectedItemId ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border hover:bg-muted'"
          @click="token.selectedItemId = item.id"
        >
          <input class="h-4 w-4 accent-primary" type="checkbox" :checked="token.checkedItemIds.includes(item.id)" :aria-label="`勾选 ${item.name}`" @click.stop @change="setChecked(item.id, ($event.target as HTMLInputElement).checked)" />
          <img class="h-10 w-10 rounded-sm bg-muted object-contain" :src="fileUrl(token.resolvedSources[item.id] || item.sourcePath)" alt="" />
          <span class="truncate">{{ item.name }}</span>
          <Button size="icon" variant="ghost" title="移除" @click.stop="token.removeItem(item.id)"><Trash2 /></Button>
        </button>
        <p v-if="!token.items.length" class="py-8 text-center text-xs text-muted-foreground">暂无图片</p>
      </div>
    </div>
  </div>
</template>
