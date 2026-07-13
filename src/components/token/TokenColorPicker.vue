<script setup lang="ts">
import { computed } from 'vue'

import NumericSliderField from '@/components/controls/NumericSliderField.vue'

const props = defineProps<{ modelValue: string; label: string; disabled?: boolean }>()
const emit = defineEmits<{ 'edit-start': []; 'update:modelValue': [string]; commit: [] }>()

const normalized = computed(() => /^#[0-9a-f]{8}$/i.test(props.modelValue) ? props.modelValue.toUpperCase() : '#000000FF')
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
  <div class="grid gap-2 border p-2">
    <div class="flex items-center gap-2">
      <label class="relative h-7 w-7 overflow-hidden border border-input" :style="{ backgroundColor: rgb }">
        <input type="color" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" :value="rgb" :disabled="disabled" :aria-label="`${label}颜色`" @change="setColor" />
      </label>
      <span class="text-xs text-muted-foreground">{{ label }}颜色</span>
      <span class="ml-auto text-[11px] tabular-nums text-muted-foreground">{{ rgb }}</span>
    </div>
    <NumericSliderField
      :label="`${label}透明度`"
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
