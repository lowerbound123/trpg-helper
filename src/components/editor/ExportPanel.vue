<script setup lang="ts">
import { Download } from '@lucide/vue'

import NumericSliderField from '@/components/controls/NumericSliderField.vue'
import BooleanSettingField from '@/components/controls/BooleanSettingField.vue'
import ParameterLabel from '@/components/controls/ParameterLabel.vue'
import { Button } from '@/components/ui/button'
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
    <NumericSliderField :label="$t('EXPORT_SCALE')" :model-value="exportScale" :min="appConfiguration.export.minScale" :max="8" :step="0.25" @update:model-value="exportScale = $event" />

    <div class="space-y-1">
      <ParameterLabel :label="$t('EXPORT_FORMAT')" :description="$t('EXPORT_FORMAT_HELP')" />
      <div class="grid grid-cols-4 gap-1">
        <button
          v-for="format in ['png', 'jpg', 'webp', 'jxl'] as HandoutExportFormat[]"
          :key="format"
          type="button"
          :data-export-format="format"
          :aria-pressed="encoding.format === format"
          class="h-8 rounded-md border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :class="encoding.format === format ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'"
          :disabled="format === 'jxl' && !desktop"
          :title="format === 'jxl' && !desktop ? $t('JPEG_XL_DESKTOP_ONLY') : undefined"
          @click="update('format', format)"
        >{{ format.toUpperCase() }}</button>
      </div>
    </div>

    <div v-if="encoding.format === 'png'" class="space-y-2 rounded-md border bg-card p-3">
      <NumericSliderField :label="$t('EXPORT_PNG_OPTIMIZATION')" :model-value="encoding.pngOptimizationLevel" :min="appConfiguration.export.limits.pngOptimizationLevelMin" :max="appConfiguration.export.limits.pngOptimizationLevelMax" @update:model-value="update('pngOptimizationLevel', $event)" />
      <BooleanSettingField id="handout-png-alpha" :label="$t('EXPORT_PNG_ALPHA')" :description="$t('EXPORT_PNG_ALPHA_HELP')" :model-value="encoding.pngOptimizeAlpha" @update:model-value="update('pngOptimizeAlpha', $event)" />
      <BooleanSettingField id="handout-png-metadata" :label="$t('EXPORT_PNG_METADATA')" :description="$t('EXPORT_PNG_METADATA_HELP')" :model-value="encoding.pngPreserveMetadata" @update:model-value="update('pngPreserveMetadata', $event)" />
      <BooleanSettingField id="handout-png-zopfli" :label="$t('ZOPFLI')" :description="$t('EXPORT_PNG_ZOPFLI_HELP')" :model-value="encoding.pngZopfli" @update:model-value="update('pngZopfli', $event)" />
    </div>

    <div v-if="encoding.format === 'jpg'" class="space-y-2 rounded-md border bg-card p-3">
      <NumericSliderField :label="$t('EXPORT_JPEG_QUALITY')" :model-value="encoding.jpegQuality" :min="appConfiguration.export.limits.jpegQualityMin" :max="appConfiguration.export.limits.jpegQualityMax" unit="%" @update:model-value="update('jpegQuality', $event)" />
      <BooleanSettingField id="handout-jpeg-progressive" :label="$t('EXPORT_JPEG_PROGRESSIVE')" :description="$t('EXPORT_JPEG_PROGRESSIVE_HELP')" :model-value="encoding.jpegProgressive" @update:model-value="update('jpegProgressive', $event)" />
      <BooleanSettingField id="handout-jpeg-deringing" :label="$t('EXPORT_JPEG_DERINGING')" :description="$t('EXPORT_JPEG_DERINGING_HELP')" :model-value="encoding.jpegDeringing" @update:model-value="update('jpegDeringing', $event)" />
      <div class="space-y-1.5">
        <ParameterLabel :label="$t('EXPORT_JPEG_CHROMA')" :description="$t('EXPORT_JPEG_CHROMA_HELP')" />
        <div class="grid grid-cols-3 gap-1"><button v-for="value in ['444', '422', '420'] as const" :key="value" type="button" :aria-pressed="encoding.jpegChromaSubsampling === value" class="h-8 rounded-md border text-xs font-medium transition-colors" :class="encoding.jpegChromaSubsampling === value ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-accent'" @click="update('jpegChromaSubsampling', value)">{{ value === '444' ? '4:4:4' : value === '422' ? '4:2:2' : '4:2:0' }}</button></div>
      </div>
    </div>

    <div v-if="encoding.format === 'webp'" class="space-y-2 rounded-md border bg-card p-3">
      <BooleanSettingField id="handout-webp-lossless" :label="$t('EXPORT_WEBP_LOSSLESS')" :description="$t('EXPORT_WEBP_LOSSLESS_HELP')" :model-value="encoding.webpLossless" @update:model-value="update('webpLossless', $event)" />
      <NumericSliderField v-if="!encoding.webpLossless" :label="$t('EXPORT_WEBP_QUALITY')" :model-value="encoding.webpQuality" :min="appConfiguration.export.limits.webpQualityMin" :max="appConfiguration.export.limits.webpQualityMax" unit="%" @update:model-value="update('webpQuality', $event)" />
      <div class="space-y-1.5">
        <ParameterLabel :label="$t('EXPORT_ENCODING_STRENGTH')" :description="$t('EXPORT_ENCODING_STRENGTH_HELP')" />
        <div class="grid grid-cols-2 gap-1"><button v-for="profile in appConfiguration.export.webpStrengthProfiles" :key="profile.id" type="button" :aria-pressed="encoding.webpEncodingStrength === profile.id" class="h-8 rounded-md border text-xs font-medium transition-colors" :class="encoding.webpEncodingStrength === profile.id ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-accent'" @click="update('webpEncodingStrength', profile.id)">{{ $t(`WEBP_PROFILE_${profile.id.toUpperCase()}`) }}</button></div>
      </div>
    </div>

    <div v-if="encoding.format === 'jxl'" class="space-y-2 rounded-md border bg-card p-3">
      <BooleanSettingField id="handout-jxl-lossless" :label="$t('EXPORT_JXL_LOSSLESS')" :description="$t('EXPORT_JXL_LOSSLESS_HELP')" :model-value="encoding.jxlLossless" @update:model-value="update('jxlLossless', $event)" />
      <NumericSliderField v-if="!encoding.jxlLossless" :label="$t('EXPORT_JXL_DISTANCE')" :model-value="encoding.jxlDistance" :min="appConfiguration.export.limits.jxlDistanceMin" :max="appConfiguration.export.limits.jxlDistanceMax" :step="0.01" @update:model-value="update('jxlDistance', $event)" />
      <NumericSliderField :label="$t('EXPORT_JXL_EFFORT')" :model-value="encoding.jxlEffort" :min="appConfiguration.export.limits.jxlEffortMin" :max="appConfiguration.export.limits.jxlEffortMax" @update:model-value="update('jxlEffort', $event)" />
      <NumericSliderField :label="$t('EXPORT_JXL_DECODING_SPEED')" :model-value="encoding.jxlDecodingSpeed" :min="appConfiguration.export.limits.jxlDecodingSpeedMin" :max="appConfiguration.export.limits.jxlDecodingSpeedMax" @update:model-value="update('jxlDecodingSpeed', $event)" />
      <BooleanSettingField id="handout-jxl-progressive" :label="$t('EXPORT_JXL_PROGRESSIVE')" :description="$t('EXPORT_JXL_PROGRESSIVE_HELP')" :model-value="encoding.jxlProgressive" @update:model-value="update('jxlProgressive', $event)" />
    </div>

    <Button variant="outline" :disabled="isExporting || (encoding.format === 'jxl' && !desktop)" @click="$emit('exportImage')">
      <Download data-icon="inline-start" />{{ isExporting ? $t('EXPORT_RUNNING') : $t('EXPORT_ACTION', { format: encoding.format.toUpperCase() }) }}
    </Button>
    <div class="export-progress" role="progressbar" :aria-valuenow="exportProgress || 0" aria-valuemin="0" aria-valuemax="100">
      <div class="export-progress-track"><span :style="{ width: `${exportProgress || 0}%` }" /></div><strong>{{ Math.round(exportProgress || 0) }}%</strong>
    </div>
    <div class="export-log">{{ exportLog || $t('EXPORT_LOG_EMPTY') }}</div>
  </div>
</template>
