<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'

import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import ParameterLabel from './ParameterLabel.vue'

const props = withDefaults(defineProps<{
  label: string
  modelValue?: number
  min?: number
  max?: number
  step?: number
  unit?: string
  disabled?: boolean
  description?: string
  placeholder?: string
}>(), {
  min: 0,
  max: 100,
  step: 1,
  unit: '',
  disabled: false,
  placeholder: 'Mixed',
})

const emit = defineEmits<{
  'edit-start': []
  'update:modelValue': [value: number]
  commit: [value: number]
}>()

const editing = ref(false)
const draft = ref('')
const interactionActive = ref(false)
const numericInput = useTemplateRef<InstanceType<typeof Input>>('numericInput')
const sliderDisabled = computed(() => props.disabled || props.modelValue === undefined)
const precision = computed(() => decimalPlaces(props.step))
const normalizedValue = computed(() => props.modelValue === undefined ? undefined : normalize(props.modelValue))
const sliderValue = computed(() => [normalizedValue.value ?? props.min])
const displayValue = computed(() => normalizedValue.value === undefined ? props.placeholder : format(normalizedValue.value))

function decimalPlaces(value: number) {
  const text = String(value).toLowerCase()
  if (text.includes('e-')) return Number(text.split('e-')[1]) || 0
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0
}

function normalize(value: number) {
  if (!Number.isFinite(value)) return props.min
  const clamped = Math.max(props.min, Math.min(props.max, value))
  const steps = Math.round((clamped - props.min) / props.step)
  const snapped = props.min + steps * props.step
  return Number(Math.max(props.min, Math.min(props.max, snapped)).toFixed(precision.value))
}

function format(value: number) {
  return precision.value === 0 ? String(Math.round(value)) : value.toFixed(precision.value)
}

function beginInteraction() {
  if (interactionActive.value || props.disabled) return
  interactionActive.value = true
  emit('edit-start')
}

function updateFromSlider(values: number[] | undefined) {
  const value = values?.[0]
  if (value === undefined) return
  beginInteraction()
  emit('update:modelValue', normalize(value))
}

function commitSlider(values: number[] | undefined) {
  const value = normalize(values?.[0] ?? props.modelValue ?? props.min)
  if (!interactionActive.value) emit('edit-start')
  interactionActive.value = false
  emit('update:modelValue', value)
  emit('commit', value)
}

async function startNumberEdit() {
  if (props.disabled) return
  draft.value = normalizedValue.value === undefined ? '' : format(normalizedValue.value)
  editing.value = true
  await nextTick()
  numericInput.value?.inputRef?.select()
}

function commitNumberEdit() {
  if (!editing.value) return
  const parsed = Number(draft.value.trim())
  editing.value = false
  if (draft.value.trim() === '' || !Number.isFinite(parsed)) return
  const value = normalize(parsed)
  emit('edit-start')
  emit('update:modelValue', value)
  emit('commit', value)
}

function cancelNumberEdit() {
  editing.value = false
  draft.value = normalizedValue.value === undefined ? '' : format(normalizedValue.value)
}

watch(() => props.modelValue, () => {
  if (!editing.value) draft.value = normalizedValue.value === undefined ? '' : format(normalizedValue.value)
}, { immediate: true })
</script>

<template>
  <div class="grid gap-2 py-0.5" :data-disabled="disabled || undefined">
    <div class="flex min-w-0 items-center justify-between gap-3 text-xs">
      <ParameterLabel class="truncate" :label="label" :description="description" />
      <div class="flex shrink-0 items-center tabular-nums text-foreground">
        <Input
          v-if="editing"
          ref="numericInput"
          v-model="draft"
          type="text"
          inputmode="decimal"
          :aria-label="`Edit ${label} value`"
          class="h-7 w-20 px-1.5 text-right text-xs tabular-nums"
          @blur="commitNumberEdit"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          @keydown.escape.prevent="cancelNumberEdit"
        />
        <button
          v-else
          type="button"
          :disabled="disabled"
          :aria-label="`Edit ${label} value`"
          class="rounded-sm px-1 py-0.5 text-right tabular-nums transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          @click="startNumberEdit"
        >
          {{ displayValue }}
        </button>
        <span v-if="unit" data-unit="true" class="select-none">{{ unit }}</span>
      </div>
    </div>

    <Slider
      :model-value="sliderValue"
      :min="min"
      :max="max"
      :step="step"
      :disabled="sliderDisabled"
      :thumb-aria-label="label"
      class="py-1"
      @pointerdown="beginInteraction"
      @keydown="beginInteraction"
      @update:model-value="updateFromSlider"
      @value-commit="commitSlider"
    />
  </div>
</template>
