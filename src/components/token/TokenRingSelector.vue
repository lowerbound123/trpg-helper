<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ChevronDown, Plus, Trash2 } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { appConfiguration } from '@/lib/configuration'
import { ringProviderKey } from '@/lib/token/rings/providerContext'
import { useTokenStore } from '@/stores/token'
import { useTokenRingStore } from '@/stores/token-rings'

const token = useTokenStore()
const rings = useTokenRingStore()
const provider = inject(ringProviderKey)
const input = ref<HTMLInputElement>()
const deleteMode = ref(false)
const open = ref(false)
const thumbnails = reactive<Record<string, string>>({})
const elements = new Map<string, HTMLElement>()
let observer: IntersectionObserver | undefined
const selectedRing = computed(() => rings.descriptor(token.selectedItem?.style.ringStyle || 'solid'))

function imageUrl(source: CanvasImageSource, size: number) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.getContext('2d')?.drawImage(source, 0, 0, size, size)
  return canvas.toDataURL('image/png')
}

async function loadThumbnail(id: string) {
  if (!provider) return
  try {
    const size = appConfiguration.token.rings.thumbnailSize
    const image = await provider.loadThumbnail(id, size)
    thumbnails[id] = imageUrl(image.source, size)
  } catch {
    thumbnails[id] = ''
  }
}

function registerElement(id: string, kind: string, value: unknown) {
  if (!(value instanceof HTMLElement)) return
  value.dataset.ringId = id
  elements.set(id, value)
  if (kind === 'custom') observer?.observe(value)
}

function selectRing(value: string) {
  if (deleteMode.value && value.startsWith('asset:')) return void removeRing(value.slice('asset:'.length))
  token.updateVisualStyle('ringStyle', value)
  token.commitEdit()
}

async function importRing(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const ring = await rings.importRing(file)
  if (ring) {
    provider?.evict(ring.id)
    selectRing(ring.id)
  }
  ;(event.target as HTMLInputElement).value = ''
}

async function removeRing(assetId: string) {
  const id = `asset:${assetId}`
  await rings.deleteRing(id)
  provider?.evict(id)
  delete thumbnails[id]
  token.replaceMissingRingReferences(new Set(rings.descriptors.map((ring) => ring.id)))
}

onMounted(async () => {
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const id = (entry.target as HTMLElement).dataset.ringId
        if (id) void loadThumbnail(id)
        observer?.unobserve(entry.target)
      }
    })
  }
  for (const ring of rings.builtinRings) void loadThumbnail(ring.id)
  if (!observer) for (const ring of rings.customRings) void loadThumbnail(ring.id)
})
onUnmounted(() => observer?.disconnect())
watch(
  () => rings.descriptors.map((ring) => `${ring.id}:${ring.revision}`).join('|'),
  async () => {
    await nextTick()
    for (const ring of rings.descriptors) {
      delete thumbnails[ring.id]
      if (ring.kind === 'builtin' || !observer) void loadThumbnail(ring.id)
      else {
        const element = elements.get(ring.id)
        if (element) observer.observe(element)
      }
    }
  },
)
</script>

<template>
  <Collapsible v-model:open="open" class="rounded-md border border-border">
    <CollapsibleTrigger
      data-testid="ring-selector-trigger"
      class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-muted/60"
    >
      <span class="flex min-w-0 items-center gap-2">
        <img v-if="selectedRing && thumbnails[selectedRing.id]" :src="thumbnails[selectedRing.id]" alt="" class="size-7 shrink-0 object-contain" />
        <span class="truncate">{{ $t('TOKEN_RING_STYLE', { name: selectedRing?.label || 'solid' }) }}</span>
      </span>
      <ChevronDown class="size-4 shrink-0 transition-transform" :class="open ? 'rotate-180' : ''" />
    </CollapsibleTrigger>
    <CollapsibleContent data-testid="ring-selector-content" class="space-y-2 border-t border-border p-2">
      <div class="flex flex-wrap gap-1 pb-1">
      <button
        v-for="ring in rings.descriptors"
        :key="ring.id"
        :ref="(value) => registerElement(ring.id, ring.kind, value)"
        type="button"
        class="relative flex h-11 w-11 shrink-0 items-center justify-center rounded border-2 bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :class="token.selectedItem?.style.ringStyle === ring.id ? 'border-primary bg-primary/10' : 'border-border hover:border-foreground/40 hover:bg-muted'"
        :aria-pressed="token.selectedItem?.style.ringStyle === ring.id"
        :title="ring.label"
        @click="selectRing(ring.id)"
      >
        <img v-if="thumbnails[ring.id]" class="h-9 w-9 object-contain" :src="thumbnails[ring.id]" alt="" />
        <span v-else class="text-[9px] text-muted-foreground">{{ ring.label.slice(0, 2) }}</span>
        <span v-if="deleteMode && ring.kind === 'custom'" class="absolute inset-0 rounded-sm bg-destructive/20" />
      </button>
      <Button size="icon" variant="outline" class="h-11 w-11 border-dashed" :title="$t('TOKEN_CUSTOM_RING_IMPORT')" @click="input?.click()"><Plus /></Button>
      <Button size="icon" variant="outline" class="h-11 w-11" :class="deleteMode ? 'border-destructive text-destructive' : ''" :title="$t('TOKEN_CUSTOM_RING_DELETE')" @click="deleteMode = !deleteMode"><Trash2 /></Button>
      <input ref="input" type="file" accept="image/*" class="hidden" @change="importRing" />
      </div>
      <p v-if="rings.error" class="text-[11px] text-destructive">{{ rings.error }}</p>
    </CollapsibleContent>
  </Collapsible>
</template>
