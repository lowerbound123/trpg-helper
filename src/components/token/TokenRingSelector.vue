<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { fileUrl } from '@/lib/backend'
import { BUILTIN_RING_SVGS } from '@/lib/token/rings/builtinAssets'
import { useEditorStore } from '@/stores/editor'
import { useTokenStore } from '@/stores/token'

const token = useTokenStore()
const editor = useEditorStore()
const input = ref<HTMLInputElement>()
const deleteMode = ref(false)
const builtinIds = Object.keys(BUILTIN_RING_SVGS)
const customRings = computed(() => editor.library.assets.filter((asset) => asset.tokenRing))

function svgUrl(id: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BUILTIN_RING_SVGS[id]!.replaceAll('currentColor', '#111111'))}`
}

function selectRing(value: string) {
  if (deleteMode.value && value.startsWith('asset:')) {
    void removeRing(value.slice('asset:'.length))
    return
  }
  token.updateVisualStyle('ringStyle', value)
  token.commitEdit()
}

async function importRing(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const asset = await editor.importAssetFile(file, 'token-ring', 'rings')
  selectRing(`asset:${asset.id}`)
  ;(event.target as HTMLInputElement).value = ''
}

async function removeRing(assetId: string) {
  await editor.deleteResourceEntries('asset', { ids: [assetId], folders: [] })
  await editor.refreshLibrary()
  const available = new Set([
    ...builtinIds,
    ...editor.library.assets.filter((asset) => asset.tokenRing).map((asset) => `asset:${asset.id}`),
  ])
  token.replaceMissingRingReferences(available)
}
</script>

<template>
  <div class="space-y-2">
    <label class="text-xs text-muted-foreground">圆环样式</label>
    <div class="flex flex-wrap gap-1">
      <button
        v-for="id in builtinIds"
        :key="id"
        type="button"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border-2 bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :class="token.selectedItem?.style.ringStyle === id ? 'border-primary bg-primary/10' : 'border-border hover:border-foreground/40 hover:bg-muted'"
        :aria-pressed="token.selectedItem?.style.ringStyle === id"
        :title="id"
        @click="selectRing(id)"
      ><img class="h-9 w-9 object-contain" :src="svgUrl(id)" alt="" /></button>
      <button
        v-for="ring in customRings"
        :key="ring.id"
        type="button"
        class="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md border-2 bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :class="token.selectedItem?.style.ringStyle === `asset:${ring.id}` ? 'border-primary bg-primary/10' : 'border-border hover:border-foreground/40 hover:bg-muted'"
        :aria-pressed="token.selectedItem?.style.ringStyle === `asset:${ring.id}`"
        :title="ring.name"
        @click="selectRing(`asset:${ring.id}`)"
      >
        <img class="h-9 w-9 object-contain" :src="fileUrl(ring.thumbnailPath || ring.path)" alt="" />
        <span v-if="deleteMode" class="absolute inset-0 rounded-sm bg-destructive/20" />
      </button>
      <Button size="icon" variant="outline" class="h-11 w-11 border-dashed" title="导入自定义圆环" @click="input?.click()"><Plus /></Button>
      <Button size="icon" variant="outline" class="h-11 w-11" :class="deleteMode ? 'border-destructive text-destructive' : ''" title="删除自定义圆环" @click="deleteMode = !deleteMode"><Trash2 /></Button>
      <input ref="input" type="file" accept="image/*" class="hidden" @change="importRing" />
    </div>
  </div>
</template>
