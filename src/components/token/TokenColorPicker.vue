<script setup lang="ts">
import { computed } from 'vue'

import NumericSliderField from '@/components/controls/NumericSliderField.vue'

const props = defineProps<{ modelValue: string; label: string; disabled?: boolean }>()
const emit = defineEmits<{ 'edit-start': []; 'update:modelValue': [string]; commit: [] }>()

const normalized = computed(() => {
  if (/^#[0-9a-f]{8}$/i.test(props.modelValue)) return props.modelValue.toUpperCase()
  if (/^#[0-9a-f]{6}$/i.test(props.modelValue)) return `${props.modelValue.toUpperCase()}FF`
  return '#000000FF'
})
const rgb = computed(() => normalized.value.slice(0, 7))
const alpha = computed(() => Math.round(Number.parseInt(normalized.value.slice(7), 16) / 255 * 100))

function alphaHex(value: number) {
  return Math.round(Math.max(0, Math.min(100, value)) * 2.55).toString(16).padStart(2, '0').toUpperCase()
}

function setColor(event: Event) {
  emit('edit-start')
  emit('update:modelValue', `${(event.target as HTMLInputElement).value}${normalized.value.slice(7)}`.toUpperCase())
  emit('commit')
}
</script>

<template>
  <div class="grid gap-2 rounded-md border border-border p-2">
    <div class="flex items-center gap-2">
      <label
        class="relative h-7 w-7 overflow-hidden rounded border border-input"
        style="background-image: conic-gradient(#ccc 25%, #fff 0deg 50%, #ccc 0deg 75%, #fff 0deg); background-size: 50% 50%"
      >
        <span class="absolute inset-0" :style="{ backgroundColor: rgb, opacity: alpha / 100 }" />
        <input type="color" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" :value="rgb" :disabled="disabled" :aria-label="$t('COLOR_FIELD', { label })" @change="setColor" />
      </label>
      <span class="text-xs text-muted-foreground">{{ $t('COLOR_FIELD', { label }) }}</span>
      <span class="ml-auto text-[11px] tabular-nums text-muted-foreground">{{ rgb }}</span>
    </div>
    <NumericSliderField
      :label="$t('COLOR_OPACITY_FIELD', { label })"
      :model-value="alpha"
      :min="0"
      :max="100"
      unit="%"
      :disabled="disabled"
      @edit-start="emit('edit-start')"
      @update:model-value="emit('update:modelValue', `${rgb}${alphaHex($event)}`)"
      @commit="emit('commit')"
    />
  </div>
</template>
