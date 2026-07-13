<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'

import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'

const props = withDefaults(defineProps<{
  label: string
  modelValue?: number
  min?: number
  max?: number
  step?: number
  unit?: string
  placeholder?: string
  disabled?: boolean
}>(), {
  min: 0,
  max: 100,
  step: 1,
  unit: '',
  placeholder: 'Mixed',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
  'value-commit': [value: number]
}>()

const inputId = useId()
const draftValue = ref<string | number>(formatValue(props.modelValue))
const editing = ref(false)
const inputDirty = ref(false)
const skipNextBlur = ref(false)
const sliderDisabled = computed(() => props.disabled || props.modelValue === undefined)
const sliderValue = computed(() => [props.modelValue ?? props.min])

watch(() => props.modelValue, (value) => {
  if (!editing.value) {
    draftValue.value = formatValue(value)
    inputDirty.value = false
  }
})

function formatValue(value: number | undefined) {
  return value === undefined ? '' : String(value)
}

function decimalPlaces(value: number) {
  const text = String(value).toLowerCase()
  if (text.includes('e-')) return Number(text.split('e-')[1]) || 0
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0
}

function normalizeValue(value: number) {
  const clamped = Math.min(props.max, Math.max(props.min, value))
  const steps = Math.round((clamped - props.min) / props.step)
  const stepped = props.min + steps * props.step
  const precision = Math.max(decimalPlaces(props.min), decimalPlaces(props.step))
  return Number(Math.min(props.max, Math.max(props.min, stepped)).toFixed(precision))
}

function restoreValue() {
  draftValue.value = formatValue(props.modelValue)
  editing.value = false
  inputDirty.value = false
}

function commitInput() {
  if (!inputDirty.value) {
    editing.value = false
    return
  }

  const rawValue = String(draftValue.value)
  const value = Number(rawValue)
  if (rawValue.trim() === '' || !Number.isFinite(value)) {
    restoreValue()
    return
  }

  const normalized = normalizeValue(value)
  draftValue.value = formatValue(normalized)
  editing.value = false
  inputDirty.value = false
  emit('update:modelValue', normalized)
  emit('value-commit', normalized)
}

function handleInputFocus() {
  editing.value = true
  inputDirty.value = false
  skipNextBlur.value = false
}

function handleDraftUpdate(value: string | number) {
  draftValue.value = value
  editing.value = true
  inputDirty.value = true
  skipNextBlur.value = false
}

function handleInputBlur() {
  if (skipNextBlur.value) {
    skipNextBlur.value = false
    return
  }
  commitInput()
}

function handleInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    commitInput()
    skipNextBlur.value = true
    return
  }
  if (event.key === 'Escape') {
    restoreValue()
    skipNextBlur.value = true
  }
}

function handleSliderUpdate(value: number[] | undefined) {
  const nextValue = value?.[0]
  if (nextValue === undefined) return
  draftValue.value = formatValue(nextValue)
  inputDirty.value = false
  emit('update:modelValue', nextValue)
}

function handleSliderCommit(value: number[] | undefined) {
  const nextValue = value?.[0]
  if (nextValue === undefined) return
  emit('value-commit', nextValue)
}
</script>

<template>
  <div class="inspector-number-slider" :data-disabled="disabled || undefined">
    <div class="inspector-number-slider-header">
      <label :for="inputId" data-slot="inspector-number-label">{{ label }}</label>
      <div class="inspector-number-slider-input-wrap" :data-has-unit="Boolean(unit) || undefined">
        <Input
          :id="inputId"
          :model-value="draftValue"
          class="inspector-number-slider-input"
          type="number"
          inputmode="decimal"
          :min="min"
          :max="max"
          :step="step"
          :placeholder="placeholder"
          :disabled="disabled"
          :aria-label="label"
          @update:model-value="handleDraftUpdate"
          @focus="handleInputFocus"
          @blur="handleInputBlur"
          @keydown="handleInputKeydown"
        />
        <span v-if="unit" data-slot="inspector-number-unit">{{ unit }}</span>
      </div>
    </div>
    <Slider
      :model-value="sliderValue"
      :min="min"
      :max="max"
      :step="step"
      :disabled="sliderDisabled"
      :thumb-aria-label="label"
      @update:model-value="handleSliderUpdate"
      @value-commit="handleSliderCommit"
    />
  </div>
</template>
