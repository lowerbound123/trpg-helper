<script setup lang="ts">
import { Download } from '@lucide/vue'

import NumericSliderField from '@/components/controls/NumericSliderField.vue'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { appConfiguration } from '@/lib/configuration'
import type { HandoutEncodingOptions, HandoutExportFormat } from '@/lib/handout-export'

const exportScale = defineModel<number>('exportScale', { required: true })
const encoding = defineModel<HandoutEncodingOptions>('exportEncoding', { required: true })

defineProps<{ isExporting?: boolean; exportLog?: string; exportProgress?: number }>()
defineEmits<{ exportImage: [] }>()

const desktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

function update<K extends keyof HandoutEncodingOptions>(key: K, value: HandoutEncodingOptions[K]) {
  encoding.value = { ...encoding.value, [key]: value }
}
</script>

<template>
  <div class="panel-stack inspector-panel">
    <NumericSliderField label="导出缩放" :model-value="exportScale" :min="appConfiguration.export.minScale" :max="8" :step="0.25" @update:model-value="exportScale = $event" />

    <div class="space-y-1">
      <label class="text-xs text-muted-foreground">导出格式</label>
      <div class="grid grid-cols-4 gap-1">
        <button
          v-for="format in ['png', 'jpg', 'webp', 'jxl'] as HandoutExportFormat[]"
          :key="format"
          type="button"
          class="h-8 border text-xs font-medium"
          :class="encoding.format === format ? 'border-primary bg-primary/5 text-primary' : 'border-input text-muted-foreground'"
          :disabled="format === 'jxl' && !desktop"
          :title="format === 'jxl' && !desktop ? 'JPEG XL 仅桌面应用支持' : undefined"
          @click="update('format', format)"
        >{{ format.toUpperCase() }}</button>
      </div>
    </div>

    <div v-if="encoding.format === 'png'" class="space-y-2 border p-2">
      <NumericSliderField label="PNG 压缩等级" :model-value="encoding.pngOptimizationLevel" :min="appConfiguration.export.limits.pngOptimizationLevelMin" :max="appConfiguration.export.limits.pngOptimizationLevelMax" @update:model-value="update('pngOptimizationLevel', $event)" />
      <label class="flex items-center justify-between text-xs"><span>Alpha 优化</span><Switch :checked="encoding.pngOptimizeAlpha" @update:checked="update('pngOptimizeAlpha', $event)" /></label>
      <label class="flex items-center justify-between text-xs"><span>保留 Metadata</span><Switch :checked="encoding.pngPreserveMetadata" @update:checked="update('pngPreserveMetadata', $event)" /></label>
      <label class="flex items-center justify-between text-xs"><span>Zopfli</span><Switch :checked="encoding.pngZopfli" @update:checked="update('pngZopfli', $event)" /></label>
    </div>

    <div v-if="encoding.format === 'jpg'" class="space-y-2 border p-2">
      <NumericSliderField label="JPEG 质量" :model-value="encoding.jpegQuality" :min="appConfiguration.export.limits.jpegQualityMin" :max="appConfiguration.export.limits.jpegQualityMax" unit="%" @update:model-value="update('jpegQuality', $event)" />
      <label class="flex items-center justify-between text-xs"><span>渐进式 JPEG</span><Switch :checked="encoding.jpegProgressive" @update:checked="update('jpegProgressive', $event)" /></label>
      <label class="flex items-center justify-between text-xs"><span>Overshoot Deringing</span><Switch :checked="encoding.jpegDeringing" @update:checked="update('jpegDeringing', $event)" /></label>
      <div class="grid grid-cols-3 gap-1"><button v-for="value in ['444', '422', '420'] as const" :key="value" type="button" class="h-8 border text-xs" :class="encoding.jpegChromaSubsampling === value ? 'border-primary bg-primary/5' : 'border-input'" @click="update('jpegChromaSubsampling', value)">{{ value }}</button></div>
    </div>

    <div v-if="encoding.format === 'webp'" class="space-y-2 border p-2">
      <label class="flex items-center justify-between text-xs"><span>无损 WebP</span><Switch :checked="encoding.webpLossless" @update:checked="update('webpLossless', $event)" /></label>
      <NumericSliderField v-if="!encoding.webpLossless" label="WebP 质量" :model-value="encoding.webpQuality" :min="appConfiguration.export.limits.webpQualityMin" :max="appConfiguration.export.limits.webpQualityMax" unit="%" @update:model-value="update('webpQuality', $event)" />
      <div class="grid grid-cols-2 gap-1"><button v-for="profile in appConfiguration.export.webpStrengthProfiles" :key="profile.id" type="button" class="h-8 border text-xs" :class="encoding.webpEncodingStrength === profile.id ? 'border-primary bg-primary/5' : 'border-input'" @click="update('webpEncodingStrength', profile.id)">{{ profile.label }}</button></div>
    </div>

    <div v-if="encoding.format === 'jxl'" class="space-y-2 border p-2">
      <label class="flex items-center justify-between text-xs"><span>无损 JPEG XL</span><Switch :checked="encoding.jxlLossless" @update:checked="update('jxlLossless', $event)" /></label>
      <NumericSliderField v-if="!encoding.jxlLossless" label="JXL Distance" :model-value="encoding.jxlDistance" :min="appConfiguration.export.limits.jxlDistanceMin" :max="appConfiguration.export.limits.jxlDistanceMax" :step="0.01" @update:model-value="update('jxlDistance', $event)" />
      <NumericSliderField label="JXL Effort" :model-value="encoding.jxlEffort" :min="appConfiguration.export.limits.jxlEffortMin" :max="appConfiguration.export.limits.jxlEffortMax" @update:model-value="update('jxlEffort', $event)" />
      <NumericSliderField label="JXL Decoding Speed" :model-value="encoding.jxlDecodingSpeed" :min="appConfiguration.export.limits.jxlDecodingSpeedMin" :max="appConfiguration.export.limits.jxlDecodingSpeedMax" @update:model-value="update('jxlDecodingSpeed', $event)" />
      <label class="flex items-center justify-between text-xs"><span>渐进渲染</span><Switch :checked="encoding.jxlProgressive" @update:checked="update('jxlProgressive', $event)" /></label>
    </div>

    <Button variant="outline" :disabled="isExporting || (encoding.format === 'jxl' && !desktop)" @click="$emit('exportImage')">
      <Download data-icon="inline-start" />{{ isExporting ? '正在导出…' : `导出 ${encoding.format.toUpperCase()}` }}
    </Button>
    <div class="export-progress" role="progressbar" :aria-valuenow="exportProgress || 0" aria-valuemin="0" aria-valuemax="100">
      <div class="export-progress-track"><span :style="{ width: `${exportProgress || 0}%` }" /></div><strong>{{ Math.round(exportProgress || 0) }}%</strong>
    </div>
    <div class="export-log">{{ exportLog || '尚未导出。' }}</div>
  </div>
</template>
