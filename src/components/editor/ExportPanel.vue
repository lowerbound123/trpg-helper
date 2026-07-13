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
    <NumericSliderField label="导出缩放" :model-value="exportScale" :min="appConfiguration.export.minScale" :max="8" :step="0.25" @update:model-value="exportScale = $event" />

    <div class="space-y-1">
      <ParameterLabel label="导出格式" description="选择最终文件编码。JPEG XL 仅桌面应用支持。" />
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
          :title="format === 'jxl' && !desktop ? 'JPEG XL 仅桌面应用支持' : undefined"
          @click="update('format', format)"
        >{{ format.toUpperCase() }}</button>
      </div>
    </div>

    <div v-if="encoding.format === 'png'" class="space-y-2 rounded-md border bg-card p-3">
      <NumericSliderField label="PNG 压缩等级" :model-value="encoding.pngOptimizationLevel" :min="appConfiguration.export.limits.pngOptimizationLevelMin" :max="appConfiguration.export.limits.pngOptimizationLevelMax" @update:model-value="update('pngOptimizationLevel', $event)" />
      <BooleanSettingField id="handout-png-alpha" label="Alpha 优化" description="允许 OxiPNG 改写完全透明像素中不可见的 RGB，以提升压缩率；可见像素不变。" :model-value="encoding.pngOptimizeAlpha" @update:model-value="update('pngOptimizeAlpha', $event)" />
      <BooleanSettingField id="handout-png-metadata" label="保留 Metadata" description="保留本次新生成 PNG 中的辅助块；不会复制源图片 Metadata。" :model-value="encoding.pngPreserveMetadata" @update:model-value="update('pngPreserveMetadata', $event)" />
      <BooleanSettingField id="handout-png-zopfli" label="Zopfli" description="使用更慢的 Zopfli DEFLATE，可能进一步减小 PNG，但会显著增加导出时间。" :model-value="encoding.pngZopfli" @update:model-value="update('pngZopfli', $event)" />
    </div>

    <div v-if="encoding.format === 'jpg'" class="space-y-2 rounded-md border bg-card p-3">
      <NumericSliderField label="JPEG 质量" :model-value="encoding.jpegQuality" :min="appConfiguration.export.limits.jpegQualityMin" :max="appConfiguration.export.limits.jpegQualityMax" unit="%" @update:model-value="update('jpegQuality', $event)" />
      <BooleanSettingField id="handout-jpeg-progressive" label="渐进式 JPEG" description="生成多扫描 JPEG，加载时可由粗略图逐步显示到完整图。" :model-value="encoding.jpegProgressive" @update:model-value="update('jpegProgressive', $event)" />
      <BooleanSettingField id="handout-jpeg-deringing" label="平滑处理" description="启用 MozJPEG Overshoot Deringing，减少高反差边缘振铃。" :model-value="encoding.jpegDeringing" @update:model-value="update('jpegDeringing', $event)" />
      <div class="space-y-1.5">
        <ParameterLabel label="色度采样" description="4:4:4 保留完整色彩分辨率；4:2:2 与 4:2:0 可获得更小文件。" />
        <div class="grid grid-cols-3 gap-1"><button v-for="value in ['444', '422', '420'] as const" :key="value" type="button" :aria-pressed="encoding.jpegChromaSubsampling === value" class="h-8 rounded-md border text-xs font-medium transition-colors" :class="encoding.jpegChromaSubsampling === value ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-accent'" @click="update('jpegChromaSubsampling', value)">{{ value === '444' ? '4:4:4' : value === '422' ? '4:2:2' : '4:2:0' }}</button></div>
      </div>
    </div>

    <div v-if="encoding.format === 'webp'" class="space-y-2 rounded-md border bg-card p-3">
      <BooleanSettingField id="handout-webp-lossless" label="无损 WebP" description="无损模式保留像素；编码强度仍会影响编码速度和压缩密度。" :model-value="encoding.webpLossless" @update:model-value="update('webpLossless', $event)" />
      <NumericSliderField v-if="!encoding.webpLossless" label="WebP 质量" :model-value="encoding.webpQuality" :min="appConfiguration.export.limits.webpQualityMin" :max="appConfiguration.export.limits.webpQualityMax" unit="%" @update:model-value="update('webpQuality', $event)" />
      <div class="space-y-1.5">
        <ParameterLabel label="编码强度" description="控制 libwebp 的编码搜索强度。更高强度通常更慢，但可能生成更小文件。" />
        <div class="grid grid-cols-2 gap-1"><button v-for="profile in appConfiguration.export.webpStrengthProfiles" :key="profile.id" type="button" :aria-pressed="encoding.webpEncodingStrength === profile.id" class="h-8 rounded-md border text-xs font-medium transition-colors" :class="encoding.webpEncodingStrength === profile.id ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-accent'" @click="update('webpEncodingStrength', profile.id)">{{ profile.label }}</button></div>
      </div>
    </div>

    <div v-if="encoding.format === 'jxl'" class="space-y-2 rounded-md border bg-card p-3">
      <BooleanSettingField id="handout-jxl-lossless" label="无损 JPEG XL" description="启用后使用无损编码并保留 Alpha；Distance 不参与本次编码。" :model-value="encoding.jxlLossless" @update:model-value="update('jxlLossless', $event)" />
      <NumericSliderField v-if="!encoding.jxlLossless" label="JXL Distance" :model-value="encoding.jxlDistance" :min="appConfiguration.export.limits.jxlDistanceMin" :max="appConfiguration.export.limits.jxlDistanceMax" :step="0.01" @update:model-value="update('jxlDistance', $event)" />
      <NumericSliderField label="JXL Effort" :model-value="encoding.jxlEffort" :min="appConfiguration.export.limits.jxlEffortMin" :max="appConfiguration.export.limits.jxlEffortMax" @update:model-value="update('jxlEffort', $event)" />
      <NumericSliderField label="JXL Decoding Speed" :model-value="encoding.jxlDecodingSpeed" :min="appConfiguration.export.limits.jxlDecodingSpeedMin" :max="appConfiguration.export.limits.jxlDecodingSpeedMax" @update:model-value="update('jxlDecodingSpeed', $event)" />
      <BooleanSettingField id="handout-jxl-progressive" label="渐进渲染" description="启用 JPEG XL 响应式与 Progressive AC 帧。" :model-value="encoding.jxlProgressive" @update:model-value="update('jxlProgressive', $event)" />
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
