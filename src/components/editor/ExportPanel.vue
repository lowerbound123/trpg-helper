<script setup lang="ts">
import { Download } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { appConfiguration } from '@/lib/configuration'

import InspectorNumberSlider from './InspectorNumberSlider.vue'

const exportScale = defineModel<number>('exportScale', { required: true })
const exportFormat = defineModel<'png' | 'jpeg' | 'webp'>('exportFormat', { required: true })
const exportQuality = defineModel<number>('exportQuality', { required: true })

defineProps<{
  isExporting?: boolean
  exportLog?: string
  exportProgress?: number
}>()

defineEmits<{
  exportImage: []
}>()
</script>

<template>
  <div class="panel-stack inspector-panel">
    <InspectorNumberSlider
      label="Export scale"
      :model-value="exportScale"
      :min="appConfiguration.export.minScale"
      :max="8"
      :step="0.25"
      @update:model-value="(value) => (exportScale = value)"
    />
    <label>
      Format
      <Select :model-value="exportFormat" @update:model-value="(value) => (exportFormat = value as 'png' | 'jpeg' | 'webp')">
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="png">PNG</SelectItem>
          <SelectItem value="jpeg">JPG</SelectItem>
          <SelectItem value="webp">WebP</SelectItem>
        </SelectContent>
      </Select>
    </label>
    <InspectorNumberSlider
      v-if="exportFormat !== 'png'"
      label="Quality"
      :model-value="exportQuality"
      :min="1"
      :max="100"
      :step="1"
      unit="%"
      @update:model-value="(value) => (exportQuality = value)"
    />
    <Button variant="outline" :disabled="isExporting" @click="$emit('exportImage')">
      <Download data-icon="inline-start" />
      {{ isExporting ? 'Exporting...' : `Export ${exportFormat.toUpperCase()}` }}
    </Button>
    <div class="export-progress" role="progressbar" :aria-valuenow="exportProgress || 0" aria-valuemin="0" aria-valuemax="100">
      <div class="export-progress-track">
        <span :style="{ width: `${exportProgress || 0}%` }" />
      </div>
      <strong>{{ Math.round(exportProgress || 0) }}%</strong>
    </div>
    <div class="export-log">
      {{ exportLog || 'No export yet.' }}
    </div>
  </div>
</template>
