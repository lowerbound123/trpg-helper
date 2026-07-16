<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import { Input } from '@/components/ui/input'

const props = defineProps<{ title: string; disabled?: boolean }>()
const emit = defineEmits<{ commit: [title: string] }>()
const editing = ref(false)
const draft = ref(props.title)
const input = ref<InstanceType<typeof Input>>()

watch(() => props.title, (title) => {
  if (!editing.value) draft.value = title
})

async function beginEditing() {
  if (props.disabled) return
  draft.value = props.title
  editing.value = true
  await nextTick()
  const element = input.value?.$el as HTMLInputElement | undefined
  element?.focus()
  element?.select()
}

function cancel() {
  draft.value = props.title
  editing.value = false
}

function commit() {
  if (!editing.value) return
  const title = draft.value.trim()
  editing.value = false
  if (!title || title === props.title) {
    draft.value = props.title
    return
  }
  emit('commit', title)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    commit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancel()
  }
}
</script>

<template>
  <Input v-if="editing" ref="input" v-model="draft" class="project-title-input" :aria-label="$t('PROJECT_NAME')" @blur="commit" @keydown="handleKeydown" />
  <button v-else type="button" class="project-title-button" :disabled="disabled" :title="$t('RENAME_PROJECT')" @click="beginEditing">
    {{ title }}
  </button>
</template>
