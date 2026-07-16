<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Check, FolderOpen, Plus, Trash2 } from '@lucide/vue'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { UnlistenFn } from '@tauri-apps/api/event'

import { Button } from '@/components/ui/button'
import { importLibraryPaths } from '@/lib/backend'
import { useEditorStore } from '@/stores/editor'
import { useTokenStore } from '@/stores/token'
import TokenItemThumbnail from './TokenItemThumbnail.vue'
import { translate } from '@/i18n'

const token = useTokenStore()
const editor = useEditorStore()
const fileInput = ref<HTMLInputElement>()
const folderInput = ref<HTMLInputElement>()
const dragging = ref(false)
const allChecked = computed(() => token.items.length > 0 && token.items.every((item) => token.checkedItemIds.includes(item.id)))
let unlistenDrop: UnlistenFn | undefined

function setChecked(itemId: string, checked: boolean) {
  const ids = new Set(token.checkedItemIds)
  if (checked) ids.add(itemId)
  else ids.delete(itemId)
  token.checkedItemIds = [...ids]
}

async function importFiles(files: File[]) {
  const images = files.filter((file) => file.type.startsWith('image/'))
  const result = await editor.importFiles('asset', images, 'token-tmp')
  const imported = result.results.flatMap((item) => item.record ? [item.record] : [])
  const added = token.addAssets(imported)
  const failed = result.results.filter((item) => item.error).length
  token.status = failed
    ? translate('TOKEN_IMAGES_ADDED_WITH_FAILURES', { added, failed })
    : translate('TOKEN_IMAGES_ADDED', { added })
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

async function importPaths(paths: string[]) {
  if (!paths.length) return
  const result = await importLibraryPaths('asset', paths, 'token-tmp')
  editor.library = result.library
  const records = result.results.flatMap((item) => item.record ? [item.record] : [])
  const added = token.addAssets(records)
  const failed = result.results.filter((item) => item.error).length
  token.status = failed
    ? translate('TOKEN_PATHS_ADDED_WITH_FAILURES', { added, failed })
    : translate('TOKEN_IMAGES_ADDED', { added })
}

onMounted(async () => {
  if (!('__TAURI_INTERNALS__' in window)) return
  unlistenDrop = await getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === 'drop') void importPaths(event.payload.paths)
  })
})
onUnmounted(() => unlistenDrop?.())
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="space-y-2 border-b p-3">
      <div class="flex gap-1">
        <Button size="sm" variant="outline" class="flex-1 text-xs" @click="fileInput?.click()">
          <Plus data-icon="inline-start" />{{ $t('ADD_IMAGES') }}
        </Button>
        <Button size="sm" variant="outline" class="flex-1 text-xs" @click="folderInput?.click()">
          <FolderOpen data-icon="inline-start" />{{ $t('ADD_FOLDER') }}
        </Button>
      </div>
      <input ref="fileInput" class="hidden" type="file" accept="image/*" multiple @change="onInput" />
      <input ref="folderInput" class="hidden" type="file" accept="image/*" multiple webkitdirectory @change="onInput" />
      <div class="grid grid-cols-2 gap-1">
        <Button size="sm" variant="outline" class="text-xs" :disabled="!token.items.length" @click="token.toggleAllChecked()">
          {{ allChecked ? $t('TOKEN_ITEMS_UNSELECT_ALL') : $t('TOKEN_ITEMS_SELECT_ALL') }}
        </Button>
        <Button size="sm" variant="outline" class="text-xs" :disabled="!token.selectedItem || !token.checkedItemIds.length" @click="token.applyCurrentStyleToChecked()">
          <Check data-icon="inline-start" />{{ $t('TOKEN_ITEMS_APPLY_STYLE', { count: token.checkedItemIds.length }) }}
        </Button>
      </div>
      <Button size="sm" variant="ghost" class="w-full text-xs text-muted-foreground" :disabled="!token.items.length" @click="token.clearItems()">
        <Trash2 data-icon="inline-start" />{{ $t('TOKEN_CLEAR_ALL', { count: token.items.length }) }}
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
        {{ dragging ? $t('TOKEN_DROP_IMAGES') : $t('TOKEN_DRAG_IMAGES') }}
      </div>
      <div class="space-y-1 p-2 pt-0">
        <div
          v-for="item in token.items"
          :key="item.id"
          role="button"
          tabindex="0"
          class="grid w-full grid-cols-[auto_40px_minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors"
          :class="item.id === token.selectedItemId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'"
          @click="token.selectedItemId = item.id"
          @keydown.enter="token.selectedItemId = item.id"
          @keydown.space.prevent="token.selectedItemId = item.id"
        >
          <input class="h-4 w-4 accent-primary" type="checkbox" :checked="token.checkedItemIds.includes(item.id)" :aria-label="$t('TOKEN_CHECK_ITEM', { name: item.name })" @click.stop @change="setChecked(item.id, ($event.target as HTMLInputElement).checked)" />
          <TokenItemThumbnail
            :path="token.resolvedSources[item.id] || item.sourcePath"
            :thumbnail-path="editor.resolveAsset(item.assetId)?.thumbnailPath"
          />
          <span class="truncate">{{ item.name }}</span>
          <Button size="icon" variant="ghost" :title="$t('TOKEN_REMOVE_ITEM')" @click.stop="token.removeItem(item.id)"><Trash2 /></Button>
        </div>
        <p v-if="!token.items.length" class="py-8 text-center text-xs text-muted-foreground">{{ $t('NO_IMAGES') }}</p>
      </div>
    </div>
  </div>
</template>
