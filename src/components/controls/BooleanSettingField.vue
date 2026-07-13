<script setup lang="ts">
import ParameterLabel from '@/components/controls/ParameterLabel.vue'
import { Switch } from '@/components/ui/switch'

defineProps<{
  id: string
  label: string
  modelValue: boolean
  description?: string
  hint?: string
  disabled?: boolean
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <div class="boolean-setting-field flex min-h-8 items-center justify-between gap-3">
    <div class="min-w-0">
      <ParameterLabel :label="label" :description="description" :for-id="id" />
      <p v-if="hint" class="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{{ hint }}</p>
    </div>
    <Switch
      :id="id"
      :model-value="modelValue"
      :disabled="disabled"
      :aria-label="label"
      @update:model-value="$emit('update:modelValue', $event)"
    />
  </div>
</template>
