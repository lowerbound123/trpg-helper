<script setup lang="ts">
import { ref, watch } from 'vue'

import { fileUrl } from '@/lib/backend'
import { loadTokenItemThumbnail } from '@/lib/token/item-thumbnail-cache'

const props = defineProps<{ path: string; thumbnailPath?: string | null }>()
const source = ref('')
let generation = 0

watch(() => [props.path, props.thumbnailPath] as const, async ([path, thumbnailPath]) => {
  const current = ++generation
  if (thumbnailPath) {
    source.value = fileUrl(thumbnailPath)
    return
  }
  source.value = ''
  try {
    const result = await loadTokenItemThumbnail(path)
    if (current === generation) source.value = result
  } catch {
    if (current === generation) source.value = fileUrl(path)
  }
}, { immediate: true })
</script>

<template><img class="h-10 w-10 rounded-sm bg-muted object-contain" :src="source" alt="" /></template>
