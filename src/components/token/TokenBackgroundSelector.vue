<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, Plus, Trash2 } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { fileUrl } from '@/lib/backend'
import type { TokenBackgroundStyle } from '@/lib/token'
import { useEditorStore } from '@/stores/editor'
import { useTokenStore } from '@/stores/token'
import { useTokenBackgroundStore } from '@/stores/token-backgrounds'

const editor = useEditorStore()
const token = useTokenStore()
const backgrounds = useTokenBackgroundStore()
const open = ref(false)
const deleteMode = ref(false)
const input = ref<HTMLInputElement>()
const selected = computed(() => backgrounds.descriptor(token.selectedItem?.style.backgroundStyle || 'solid'))

function preview(id: string) {
  if (id === 'solid') return ''
  const asset = editor.resolveAsset(id.slice('asset:'.length))
  return asset ? fileUrl(asset.thumbnailPath || asset.path) : ''
}

function select(value: TokenBackgroundStyle) {
  if (deleteMode.value && value.startsWith('asset:')) return void remove(value)
  token.updateVisualStyle('backgroundStyle', value)
  token.commitEdit()
}

async function importBackground(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  const descriptor = await backgrounds.importBackground(file)
  if (descriptor) select(descriptor.id)
  target.value = ''
}

async function remove(id: string) {
  await backgrounds.deleteBackground(id)
  token.replaceMissingBackgroundReferences(new Set(backgrounds.descriptors.map((item) => item.id)))
}
</script>

<template>
  <Collapsible v-model:open="open" class="rounded-md border border-border">
    <CollapsibleTrigger class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-muted/60">
      <span class="flex min-w-0 items-center gap-2">
        <span v-if="selected?.kind === 'solid'" class="size-7 shrink-0 rounded-sm border" :style="{ backgroundColor: token.selectedItem?.style.background }" />
        <img v-else-if="selected" :src="preview(selected.id)" alt="" class="size-7 shrink-0 rounded-sm object-cover" />
        <span class="truncate">{{ $t('TOKEN_BACKGROUND_STYLE', { name: selected?.label || 'solid' }) }}</span>
      </span>
      <ChevronDown class="size-4 shrink-0 transition-transform" :class="open ? 'rotate-180' : ''" />
    </CollapsibleTrigger>
    <CollapsibleContent class="space-y-2 border-t border-border p-2">
      <div class="flex flex-wrap gap-1">
        <button
          v-for="item in backgrounds.descriptors"
          :key="item.id"
          type="button"
          class="relative flex h-11 w-11 items-center justify-center rounded border-2 transition-colors"
          :class="token.selectedItem?.style.backgroundStyle === item.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'"
          :title="item.label"
          @click="select(item.id)"
        >
          <span v-if="item.kind === 'solid'" class="h-9 w-9 rounded-sm border" :style="{ backgroundColor: token.selectedItem?.style.background }" />
          <img v-else :src="preview(item.id)" alt="" class="h-9 w-9 rounded-sm object-cover" />
          <span v-if="deleteMode && item.kind === 'custom'" class="absolute inset-0 rounded-sm bg-destructive/20" />
        </button>
        <Button size="icon" variant="outline" class="h-11 w-11 border-dashed" :title="$t('TOKEN_CUSTOM_BACKGROUND_IMPORT')" @click="input?.click()"><Plus /></Button>
        <Button size="icon" variant="outline" class="h-11 w-11" :class="deleteMode ? 'border-destructive text-destructive' : ''" :title="$t('TOKEN_CUSTOM_BACKGROUND_DELETE')" @click="deleteMode = !deleteMode"><Trash2 /></Button>
        <input ref="input" type="file" accept="image/*" class="hidden" @change="importBackground" />
      </div>
      <p v-if="backgrounds.error" class="text-[11px] text-destructive">{{ backgrounds.error }}</p>
    </CollapsibleContent>
  </Collapsible>
</template>
