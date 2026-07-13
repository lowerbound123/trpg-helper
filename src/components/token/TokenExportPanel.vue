<script setup lang="ts">
import { computed } from 'vue'
import { Download, Layers } from '@lucide/vue'

import NumericSliderField from '@/components/controls/NumericSliderField.vue'
import BooleanSettingField from '@/components/controls/BooleanSettingField.vue'
import ParameterLabel from '@/components/controls/ParameterLabel.vue'
import { Button } from '@/components/ui/button'
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
      <NumericSliderField label="导出基础尺寸" description="以原始资源重新渲染的圆环设计尺寸；出框内容会在此基础上向四周扩展。" :model-value="settings.exportSize" :min="appConfiguration.token.export.limits.sizeMin" :max="appConfiguration.token.export.limits.sizeMax" unit="px" @edit-start="token.beginEdit()" @update:model-value="update('exportSize', $event)" @commit="token.commitEdit()" />

      <div class="space-y-2 rounded-md border bg-card p-3">
        <BooleanSettingField id="token-random-background" label="随机背景" description="每张导出图片临时选择高对比背景 RGB，保留原背景透明度且不修改项目样式。" hint="每张图片独立生成高对比背景色" :model-value="settings.randomBackground" @update:model-value="toggle('randomBackground', $event)" />
        <BooleanSettingField id="token-random-ring-color" label="随机环色" description="仅为内置圆环临时选择高对比 RGB；自定义图片环保持原始颜色。" hint="仅作用于内置环" :model-value="settings.randomRingColor" @update:model-value="toggle('randomRingColor', $event)" />
      </div>

      <div class="space-y-1">
        <ParameterLabel label="导出格式" description="选择最终文件编码。PNG、WebP 与 JXL 支持透明度；JPG 会把透明区域合成到背景色。" />
        <div class="grid grid-cols-4 gap-1">
          <button
            v-for="format in appConfiguration.token.files.exportFormats"
            :key="format"
            type="button"
            :data-export-format="format"
            :aria-pressed="settings.exportFormat === format"
            class="h-8 rounded-md border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="settings.exportFormat === format ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'"
            @click="update('exportFormat', format); token.commitEdit()"
          >{{ format.toUpperCase() }}</button>
        </div>
      </div>

      <div v-if="settings.exportFormat === 'png'" class="space-y-2 rounded-md border bg-card p-3">
        <NumericSliderField label="PNG 压缩等级" description="OxiPNG 搜索更优压缩结果的强度。等级越高通常越慢，但不会降低图像质量。" :model-value="settings.pngOptimizationLevel" :min="appConfiguration.token.export.limits.pngOptimizationLevelMin" :max="appConfiguration.token.export.limits.pngOptimizationLevelMax" @edit-start="token.beginEdit()" @update:model-value="update('pngOptimizationLevel', $event)" @commit="token.commitEdit()" />
        <BooleanSettingField id="token-png-alpha" label="Alpha 优化" description="允许 OxiPNG 改写完全透明像素中不可见的 RGB，以提升压缩率；可见像素不变。" :model-value="settings.pngOptimizeAlpha" @update:model-value="toggle('pngOptimizeAlpha', $event)" />
        <BooleanSettingField id="token-png-metadata" label="保留 Metadata" description="保留本次新生成 PNG 中的辅助块；不会复制源图片 Metadata。" :model-value="settings.pngPreserveMetadata" @update:model-value="toggle('pngPreserveMetadata', $event)" />
        <BooleanSettingField id="token-png-zopfli" label="Zopfli" description="使用更慢的 Zopfli DEFLATE，可能进一步减小 PNG，但会显著增加批量导出时间。" :model-value="settings.pngZopfli" @update:model-value="toggle('pngZopfli', $event)" />
      </div>

      <div v-if="settings.exportFormat === 'jpg'" class="space-y-2 rounded-md border bg-card p-3">
        <NumericSliderField label="JPEG 质量" description="MozJPEG 的有损质量等级。较高质量会保留更多细节，同时增大文件。" :model-value="settings.jpegQuality" :min="appConfiguration.token.export.limits.jpegQualityMin" :max="appConfiguration.token.export.limits.jpegQualityMax" unit="%" @edit-start="token.beginEdit()" @update:model-value="update('jpegQuality', $event)" @commit="token.commitEdit()" />
        <BooleanSettingField id="token-jpeg-progressive" label="渐进式 JPEG" description="生成多扫描 JPEG，网络加载时可由粗略图逐步显示到完整图。" :model-value="settings.jpegProgressive" @update:model-value="toggle('jpegProgressive', $event)" />
        <BooleanSettingField id="token-jpeg-deringing" label="平滑处理" description="启用 MozJPEG Overshoot Deringing，减少高反差边缘振铃，不会做高斯模糊。" :model-value="settings.jpegDeringing" @update:model-value="toggle('jpegDeringing', $event)" />
        <div class="space-y-1.5">
          <ParameterLabel label="色度采样" description="4:4:4 保留完整色彩分辨率；4:2:2 与 4:2:0 通过降低色度分辨率获得更小文件。" />
          <div class="grid grid-cols-3 gap-1">
            <button v-for="value in ['444', '422', '420'] as const" :key="value" type="button" :aria-pressed="settings.jpegChromaSubsampling === value" class="h-8 rounded-md border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" :class="settings.jpegChromaSubsampling === value ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-accent'" @click="update('jpegChromaSubsampling', value); token.commitEdit()">{{ value === '444' ? '4:4:4' : value === '422' ? '4:2:2' : '4:2:0' }}</button>
          </div>
        </div>
      </div>

      <div v-if="settings.exportFormat === 'webp'" class="space-y-2 rounded-md border bg-card p-3">
        <BooleanSettingField id="token-webp-lossless" label="无损 WebP" description="无损模式保留像素；编码强度仍会影响编码速度和压缩密度。" :model-value="settings.webpLossless" @update:model-value="toggle('webpLossless', $event)" />
        <NumericSliderField v-if="!settings.webpLossless" label="WebP 质量" description="libwebp 的有损质量等级；无损模式下此参数不参与编码。" :model-value="settings.webpQuality" :min="appConfiguration.token.export.limits.webpQualityMin" :max="appConfiguration.token.export.limits.webpQualityMax" unit="%" @edit-start="token.beginEdit()" @update:model-value="update('webpQuality', $event)" @commit="token.commitEdit()" />
        <div class="space-y-1.5">
          <ParameterLabel label="编码强度" description="控制 libwebp 的 method 与 passes。更高强度会增加编码耗时以换取更小文件。" />
          <div class="grid grid-cols-2 gap-1">
            <button v-for="profile in appConfiguration.token.export.webpStrengthProfiles" :key="profile.id" type="button" :aria-pressed="settings.webpEncodingStrength === profile.id" class="h-8 rounded-md border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" :class="settings.webpEncodingStrength === profile.id ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-accent'" @click="update('webpEncodingStrength', profile.id); token.commitEdit()">{{ profile.label }}</button>
          </div>
        </div>
      </div>

      <div v-if="settings.exportFormat === 'jxl'" class="space-y-2 rounded-md border bg-card p-3">
        <BooleanSettingField id="token-jxl-lossless" label="无损 JPEG XL" description="启用后使用无损编码并保留 Alpha；Distance 保留设置但不参与本次编码。" :model-value="settings.jxlLossless" @update:model-value="toggle('jxlLossless', $event)" />
        <NumericSliderField v-if="!settings.jxlLossless" label="JXL Distance" description="感知距离。0 接近无损，数值增大可减小文件但会损失更多细节。" :model-value="settings.jxlDistance" :min="appConfiguration.token.export.limits.jxlDistanceMin" :max="appConfiguration.token.export.limits.jxlDistanceMax" :step="0.01" @edit-start="token.beginEdit()" @update:model-value="update('jxlDistance', $event)" @commit="token.commitEdit()" />
        <NumericSliderField label="JXL Effort" description="编码器搜索强度。更高值通常压缩更好，但导出耗时更长。" :model-value="settings.jxlEffort" :min="appConfiguration.token.export.limits.jxlEffortMin" :max="appConfiguration.token.export.limits.jxlEffortMax" @edit-start="token.beginEdit()" @update:model-value="update('jxlEffort', $event)" @commit="token.commitEdit()" />
        <NumericSliderField label="JXL Decoding Speed" description="在压缩密度与解码速度之间取舍；较高值优先更快解码。" :model-value="settings.jxlDecodingSpeed" :min="appConfiguration.token.export.limits.jxlDecodingSpeedMin" :max="appConfiguration.token.export.limits.jxlDecodingSpeedMax" @edit-start="token.beginEdit()" @update:model-value="update('jxlDecodingSpeed', $event)" @commit="token.commitEdit()" />
        <BooleanSettingField id="token-jxl-progressive" label="渐进渲染" description="启用 JPEG XL 响应式与 Progressive AC 帧，便于支持的查看器逐步呈现。" :model-value="settings.jxlProgressive" @update:model-value="toggle('jxlProgressive', $event)" />
      </div>

      <Button class="w-full" :disabled="!token.selectedItem" @click="exportScope('current')"><Download data-icon="inline-start" />导出当前</Button>
      <Button variant="outline" class="w-full" :disabled="!token.checkedItemIds.length" @click="exportScope('checked')"><Download data-icon="inline-start" />生成选中 ({{ token.checkedItemIds.length }})</Button>
      <Button variant="outline" class="w-full" :disabled="!token.items.length" @click="exportScope('all')"><Layers data-icon="inline-start" />批量生成 ({{ token.items.length }})</Button>
    </fieldset>

    <div v-if="progress.status !== 'idle'" class="space-y-2 rounded-md border bg-card p-3 text-[11px]">
      <div class="flex justify-between gap-2"><span class="truncate">{{ phaseLabels[progress.phase] || '准备导出' }}<template v-if="currentName">：{{ currentName }}</template></span><span>{{ percentage }}%</span></div>
      <div class="h-2 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full bg-primary transition-[width]" :style="{ width: `${percentage}%` }" /></div>
      <p class="text-muted-foreground">已完成 {{ progress.completed }}/{{ progress.total }}；成功 {{ progress.successCount }}，失败 {{ progress.failureCount }}</p>
      <p v-if="progress.error" class="text-destructive">{{ progress.error }}</p>
    </div>
  </div>
</template>
