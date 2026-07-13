<script setup lang="ts">
import { computed } from 'vue'
import { Download, Layers } from '@lucide/vue'

import NumericSliderField from '@/components/controls/NumericSliderField.vue'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useTokenExport } from '@/composables/useTokenExport'
import { appConfiguration } from '@/lib/configuration'
import type { TokenExportSettings } from '@/lib/token'
import { useTokenStore } from '@/stores/token'

const token = useTokenStore()
const { progress, percentage, exportScope } = useTokenExport()
const settings = computed(() => token.document?.exportSettings)
const currentName = computed(() => progress.currentInput.split(/[/\\]/).pop() || progress.currentInput)
const phaseLabels: Record<string, string> = {
  preparing: '准备参数', decoding: '读取图片', rendering: '渲染头像与圆环',
  compositing: '合成与裁剪', encoding: '编码文件',
}

function update<K extends keyof TokenExportSettings>(key: K, value: TokenExportSettings[K]) {
  token.updateExportSetting(key, value)
}

function toggle(key: keyof TokenExportSettings, value: boolean) {
  update(key, value as never)
  token.commitEdit()
}
</script>

<template>
  <div v-if="settings" class="space-y-3 p-3">
    <fieldset :disabled="progress.running" class="space-y-3 disabled:opacity-70">
      <p class="text-xs text-muted-foreground">基础尺寸从原图重新渲染；出框内容会对称扩展，圆环中心保持在图片中心。</p>
      <NumericSliderField label="导出基础尺寸" :model-value="settings.exportSize" :min="appConfiguration.token.export.limits.sizeMin" :max="appConfiguration.token.export.limits.sizeMax" unit="px" @edit-start="token.beginEdit()" @update:model-value="update('exportSize', $event)" @commit="token.commitEdit()" />

      <div class="space-y-2 border p-2">
        <div class="flex items-center justify-between gap-2"><span class="text-xs">随机背景</span><Switch :checked="settings.randomBackground" @update:checked="toggle('randomBackground', $event)" /></div>
        <div class="flex items-center justify-between gap-2"><span class="text-xs">随机环色（仅内置环）</span><Switch :checked="settings.randomRingColor" @update:checked="toggle('randomRingColor', $event)" /></div>
      </div>

      <div class="space-y-1">
        <label class="text-xs text-muted-foreground">导出格式</label>
        <div class="grid grid-cols-4 gap-1">
          <button v-for="format in appConfiguration.token.files.exportFormats" :key="format" type="button" class="h-8 border text-xs font-medium" :class="settings.exportFormat === format ? 'border-primary bg-primary/5 text-primary' : 'border-input text-muted-foreground'" @click="update('exportFormat', format); token.commitEdit()">{{ format.toUpperCase() }}</button>
        </div>
      </div>

      <div v-if="settings.exportFormat === 'png'" class="space-y-2 border p-2">
        <NumericSliderField label="PNG 压缩等级" :model-value="settings.pngOptimizationLevel" :min="appConfiguration.token.export.limits.pngOptimizationLevelMin" :max="appConfiguration.token.export.limits.pngOptimizationLevelMax" @edit-start="token.beginEdit()" @update:model-value="update('pngOptimizationLevel', $event)" @commit="token.commitEdit()" />
        <div class="flex items-center justify-between"><span class="text-xs">Alpha 优化</span><Switch :checked="settings.pngOptimizeAlpha" @update:checked="toggle('pngOptimizeAlpha', $event)" /></div>
        <div class="flex items-center justify-between"><span class="text-xs">保留 Metadata</span><Switch :checked="settings.pngPreserveMetadata" @update:checked="toggle('pngPreserveMetadata', $event)" /></div>
        <div class="flex items-center justify-between"><span class="text-xs">Zopfli</span><Switch :checked="settings.pngZopfli" @update:checked="toggle('pngZopfli', $event)" /></div>
      </div>

      <div v-if="settings.exportFormat === 'jpg'" class="space-y-2 border p-2">
        <NumericSliderField label="JPEG 质量" :model-value="settings.jpegQuality" :min="appConfiguration.token.export.limits.jpegQualityMin" :max="appConfiguration.token.export.limits.jpegQualityMax" unit="%" @edit-start="token.beginEdit()" @update:model-value="update('jpegQuality', $event)" @commit="token.commitEdit()" />
        <div class="flex items-center justify-between"><span class="text-xs">渐进式 JPEG</span><Switch :checked="settings.jpegProgressive" @update:checked="toggle('jpegProgressive', $event)" /></div>
        <div class="flex items-center justify-between"><span class="text-xs">Overshoot Deringing</span><Switch :checked="settings.jpegDeringing" @update:checked="toggle('jpegDeringing', $event)" /></div>
        <div class="grid grid-cols-3 gap-1"><button v-for="value in ['444', '422', '420'] as const" :key="value" type="button" class="h-8 border text-xs" :class="settings.jpegChromaSubsampling === value ? 'border-primary bg-primary/5' : 'border-input'" @click="update('jpegChromaSubsampling', value); token.commitEdit()">{{ value }}</button></div>
      </div>

      <div v-if="settings.exportFormat === 'webp'" class="space-y-2 border p-2">
        <div class="flex items-center justify-between"><span class="text-xs">无损 WebP</span><Switch :checked="settings.webpLossless" @update:checked="toggle('webpLossless', $event)" /></div>
        <NumericSliderField v-if="!settings.webpLossless" label="WebP 质量" :model-value="settings.webpQuality" :min="appConfiguration.token.export.limits.webpQualityMin" :max="appConfiguration.token.export.limits.webpQualityMax" unit="%" @edit-start="token.beginEdit()" @update:model-value="update('webpQuality', $event)" @commit="token.commitEdit()" />
        <div class="grid grid-cols-2 gap-1"><button v-for="profile in appConfiguration.token.export.webpStrengthProfiles" :key="profile.id" type="button" class="h-8 border text-xs" :class="settings.webpEncodingStrength === profile.id ? 'border-primary bg-primary/5' : 'border-input'" @click="update('webpEncodingStrength', profile.id); token.commitEdit()">{{ profile.label }}</button></div>
      </div>

      <div v-if="settings.exportFormat === 'jxl'" class="space-y-2 border p-2">
        <div class="flex items-center justify-between"><span class="text-xs">无损 JPEG XL</span><Switch :checked="settings.jxlLossless" @update:checked="toggle('jxlLossless', $event)" /></div>
        <NumericSliderField v-if="!settings.jxlLossless" label="JXL Distance" :model-value="settings.jxlDistance" :min="appConfiguration.token.export.limits.jxlDistanceMin" :max="appConfiguration.token.export.limits.jxlDistanceMax" :step="0.01" @edit-start="token.beginEdit()" @update:model-value="update('jxlDistance', $event)" @commit="token.commitEdit()" />
        <NumericSliderField label="JXL Effort" :model-value="settings.jxlEffort" :min="appConfiguration.token.export.limits.jxlEffortMin" :max="appConfiguration.token.export.limits.jxlEffortMax" @edit-start="token.beginEdit()" @update:model-value="update('jxlEffort', $event)" @commit="token.commitEdit()" />
        <NumericSliderField label="JXL Decoding Speed" :model-value="settings.jxlDecodingSpeed" :min="appConfiguration.token.export.limits.jxlDecodingSpeedMin" :max="appConfiguration.token.export.limits.jxlDecodingSpeedMax" @edit-start="token.beginEdit()" @update:model-value="update('jxlDecodingSpeed', $event)" @commit="token.commitEdit()" />
        <div class="flex items-center justify-between"><span class="text-xs">渐进渲染</span><Switch :checked="settings.jxlProgressive" @update:checked="toggle('jxlProgressive', $event)" /></div>
      </div>

      <Button class="w-full" :disabled="!token.selectedItem" @click="exportScope('current')"><Download data-icon="inline-start" />导出当前</Button>
      <Button variant="outline" class="w-full" :disabled="!token.checkedItemIds.length" @click="exportScope('checked')"><Download data-icon="inline-start" />生成选中 ({{ token.checkedItemIds.length }})</Button>
      <Button variant="outline" class="w-full" :disabled="!token.items.length" @click="exportScope('all')"><Layers data-icon="inline-start" />批量生成 ({{ token.items.length }})</Button>
    </fieldset>

    <div v-if="progress.status !== 'idle'" class="space-y-2 border p-2 text-[11px]">
      <div class="flex justify-between gap-2"><span class="truncate">{{ phaseLabels[progress.phase] || '准备导出' }}<template v-if="currentName">：{{ currentName }}</template></span><span>{{ percentage }}%</span></div>
      <div class="h-2 overflow-hidden bg-muted"><div class="h-full bg-primary transition-[width]" :style="{ width: `${percentage}%` }" /></div>
      <p class="text-muted-foreground">已完成 {{ progress.completed }}/{{ progress.total }}；成功 {{ progress.successCount }}，失败 {{ progress.failureCount }}</p>
      <p v-if="progress.error" class="text-destructive">{{ progress.error }}</p>
    </div>
  </div>
</template>
