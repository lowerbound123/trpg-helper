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
import { translate } from '@/i18n'

const token = useTokenStore()
const { progress, percentage, exportScope } = useTokenExport()
const settings = computed(() => token.document?.exportSettings)
const currentName = computed(() => progress.currentInput.split(/[/\\]/).pop() || progress.currentInput)
const phaseLabels: Record<string, string> = {
  preparing: translate('TOKEN_EXPORT_STAGE_PREPARING'),
  decoding: translate('TOKEN_EXPORT_STAGE_DECODING'),
  rendering: translate('TOKEN_EXPORT_STAGE_RENDERING'),
  compositing: translate('TOKEN_EXPORT_STAGE_COMPOSITING'),
  encoding: translate('TOKEN_EXPORT_STAGE_ENCODING'),
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
      <p class="text-xs text-muted-foreground">{{ $t('TOKEN_EXPORT_SUMMARY') }}</p>
      <NumericSliderField :label="$t('TOKEN_EXPORT_BASE_SIZE')" :description="$t('TOKEN_EXPORT_BASE_SIZE_HELP')" :model-value="settings.exportSize" :min="appConfiguration.token.export.limits.sizeMin" :max="appConfiguration.token.export.limits.sizeMax" unit="px" @edit-start="token.beginEdit()" @update:model-value="update('exportSize', $event)" @commit="token.commitEdit()" />

      <div class="space-y-2 rounded-md border bg-card p-3">
        <BooleanSettingField id="token-random-background" :label="$t('TOKEN_EXPORT_RANDOM_BACKGROUND')" :description="$t('TOKEN_EXPORT_RANDOM_BACKGROUND_HELP')" :hint="$t('TOKEN_EXPORT_RANDOM_BACKGROUND_HINT')" :model-value="settings.randomBackground" @update:model-value="toggle('randomBackground', $event)" />
        <BooleanSettingField id="token-random-ring-color" :label="$t('TOKEN_EXPORT_RANDOM_RING')" :description="$t('TOKEN_EXPORT_RANDOM_RING_HELP')" :hint="$t('TOKEN_EXPORT_RANDOM_RING_HINT')" :model-value="settings.randomRingColor" @update:model-value="toggle('randomRingColor', $event)" />
      </div>

      <div class="space-y-1">
        <ParameterLabel :label="$t('EXPORT_FORMAT')" :description="$t('TOKEN_EXPORT_FORMAT_HELP')" />
        <div class="grid grid-cols-4 gap-1">
          <button
            v-for="format in appConfiguration.token.files.exportFormats"
            :key="format"
            type="button"
            :data-export-format="format"
            :aria-pressed="settings.exportFormat === format"
            class="h-8 rounded-md border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="settings.exportFormat === format ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'"
            @click="update('exportFormat', format); token.commitEdit()"
          >{{ format.toUpperCase() }}</button>
        </div>
      </div>

      <div v-if="settings.exportFormat === 'png'" class="space-y-2 rounded-md border bg-card p-3">
        <NumericSliderField :label="$t('EXPORT_PNG_OPTIMIZATION')" :description="$t('TOKEN_EXPORT_PNG_OPTIMIZATION_HELP')" :model-value="settings.pngOptimizationLevel" :min="appConfiguration.token.export.limits.pngOptimizationLevelMin" :max="appConfiguration.token.export.limits.pngOptimizationLevelMax" @edit-start="token.beginEdit()" @update:model-value="update('pngOptimizationLevel', $event)" @commit="token.commitEdit()" />
        <BooleanSettingField id="token-png-alpha" :label="$t('EXPORT_PNG_ALPHA')" :description="$t('EXPORT_PNG_ALPHA_HELP')" :model-value="settings.pngOptimizeAlpha" @update:model-value="toggle('pngOptimizeAlpha', $event)" />
        <BooleanSettingField id="token-png-metadata" :label="$t('EXPORT_PNG_METADATA')" :description="$t('EXPORT_PNG_METADATA_HELP')" :model-value="settings.pngPreserveMetadata" @update:model-value="toggle('pngPreserveMetadata', $event)" />
        <BooleanSettingField id="token-png-zopfli" :label="$t('ZOPFLI')" :description="$t('TOKEN_EXPORT_PNG_ZOPFLI_HELP')" :model-value="settings.pngZopfli" @update:model-value="toggle('pngZopfli', $event)" />
      </div>

      <div v-if="settings.exportFormat === 'jpg'" class="space-y-2 rounded-md border bg-card p-3">
        <NumericSliderField :label="$t('EXPORT_JPEG_QUALITY')" :description="$t('TOKEN_EXPORT_JPEG_QUALITY_HELP')" :model-value="settings.jpegQuality" :min="appConfiguration.token.export.limits.jpegQualityMin" :max="appConfiguration.token.export.limits.jpegQualityMax" unit="%" @edit-start="token.beginEdit()" @update:model-value="update('jpegQuality', $event)" @commit="token.commitEdit()" />
        <BooleanSettingField id="token-jpeg-progressive" :label="$t('EXPORT_JPEG_PROGRESSIVE')" :description="$t('EXPORT_JPEG_PROGRESSIVE_HELP')" :model-value="settings.jpegProgressive" @update:model-value="toggle('jpegProgressive', $event)" />
        <BooleanSettingField id="token-jpeg-deringing" :label="$t('EXPORT_JPEG_DERINGING')" :description="$t('TOKEN_EXPORT_JPEG_DERINGING_HELP')" :model-value="settings.jpegDeringing" @update:model-value="toggle('jpegDeringing', $event)" />
        <div class="space-y-1.5">
          <ParameterLabel :label="$t('EXPORT_JPEG_CHROMA')" :description="$t('TOKEN_EXPORT_CHROMA_HELP')" />
          <div class="grid grid-cols-3 gap-1">
            <button v-for="value in ['444', '422', '420'] as const" :key="value" type="button" :aria-pressed="settings.jpegChromaSubsampling === value" class="h-8 rounded-md border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" :class="settings.jpegChromaSubsampling === value ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background hover:bg-accent'" @click="update('jpegChromaSubsampling', value); token.commitEdit()">{{ value === '444' ? '4:4:4' : value === '422' ? '4:2:2' : '4:2:0' }}</button>
          </div>
        </div>
      </div>

      <div v-if="settings.exportFormat === 'webp'" class="space-y-2 rounded-md border bg-card p-3">
        <BooleanSettingField id="token-webp-lossless" :label="$t('EXPORT_WEBP_LOSSLESS')" :description="$t('EXPORT_WEBP_LOSSLESS_HELP')" :model-value="settings.webpLossless" @update:model-value="toggle('webpLossless', $event)" />
        <NumericSliderField v-if="!settings.webpLossless" :label="$t('EXPORT_WEBP_QUALITY')" :description="$t('TOKEN_EXPORT_WEBP_QUALITY_HELP')" :model-value="settings.webpQuality" :min="appConfiguration.token.export.limits.webpQualityMin" :max="appConfiguration.token.export.limits.webpQualityMax" unit="%" @edit-start="token.beginEdit()" @update:model-value="update('webpQuality', $event)" @commit="token.commitEdit()" />
        <div class="space-y-1.5">
          <ParameterLabel :label="$t('EXPORT_ENCODING_STRENGTH')" :description="$t('TOKEN_EXPORT_WEBP_STRENGTH_HELP')" />
          <div class="grid grid-cols-2 gap-1">
            <button v-for="profile in appConfiguration.token.export.webpStrengthProfiles" :key="profile.id" type="button" :aria-pressed="settings.webpEncodingStrength === profile.id" class="h-8 rounded-md border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" :class="settings.webpEncodingStrength === profile.id ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background hover:bg-accent'" @click="update('webpEncodingStrength', profile.id); token.commitEdit()">{{ $t(`WEBP_PROFILE_${profile.id.toUpperCase()}`) }}</button>
          </div>
        </div>
      </div>

      <div v-if="settings.exportFormat === 'jxl'" class="space-y-2 rounded-md border bg-card p-3">
        <BooleanSettingField id="token-jxl-lossless" :label="$t('EXPORT_JXL_LOSSLESS')" :description="$t('TOKEN_EXPORT_JXL_LOSSLESS_HELP')" :model-value="settings.jxlLossless" @update:model-value="toggle('jxlLossless', $event)" />
        <NumericSliderField v-if="!settings.jxlLossless" :label="$t('EXPORT_JXL_DISTANCE')" :description="$t('TOKEN_EXPORT_JXL_DISTANCE_HELP')" :model-value="settings.jxlDistance" :min="appConfiguration.token.export.limits.jxlDistanceMin" :max="appConfiguration.token.export.limits.jxlDistanceMax" :step="0.01" @edit-start="token.beginEdit()" @update:model-value="update('jxlDistance', $event)" @commit="token.commitEdit()" />
        <NumericSliderField :label="$t('EXPORT_JXL_EFFORT')" :description="$t('TOKEN_EXPORT_JXL_EFFORT_HELP')" :model-value="settings.jxlEffort" :min="appConfiguration.token.export.limits.jxlEffortMin" :max="appConfiguration.token.export.limits.jxlEffortMax" @edit-start="token.beginEdit()" @update:model-value="update('jxlEffort', $event)" @commit="token.commitEdit()" />
        <NumericSliderField :label="$t('EXPORT_JXL_DECODING_SPEED')" :description="$t('TOKEN_EXPORT_JXL_DECODING_SPEED_HELP')" :model-value="settings.jxlDecodingSpeed" :min="appConfiguration.token.export.limits.jxlDecodingSpeedMin" :max="appConfiguration.token.export.limits.jxlDecodingSpeedMax" @edit-start="token.beginEdit()" @update:model-value="update('jxlDecodingSpeed', $event)" @commit="token.commitEdit()" />
        <BooleanSettingField id="token-jxl-progressive" :label="$t('EXPORT_JXL_PROGRESSIVE')" :description="$t('TOKEN_EXPORT_JXL_PROGRESSIVE_HELP')" :model-value="settings.jxlProgressive" @update:model-value="toggle('jxlProgressive', $event)" />
      </div>

      <Button class="w-full" :disabled="!token.selectedItem" @click="exportScope('current')"><Download data-icon="inline-start" />{{ $t('TOKEN_EXPORT_CURRENT') }}</Button>
      <Button variant="outline" class="w-full" :disabled="!token.checkedItemIds.length" @click="exportScope('checked')"><Download data-icon="inline-start" />{{ $t('TOKEN_EXPORT_CHECKED', { count: token.checkedItemIds.length }) }}</Button>
      <Button variant="outline" class="w-full" :disabled="!token.items.length" @click="exportScope('all')"><Layers data-icon="inline-start" />{{ $t('TOKEN_EXPORT_ALL', { count: token.items.length }) }}</Button>
    </fieldset>

    <div v-if="progress.status !== 'idle'" class="space-y-2 rounded-md border bg-card p-3 text-[11px]">
      <div class="flex justify-between gap-2"><span class="truncate">{{ phaseLabels[progress.phase] || $t('TOKEN_EXPORT_STAGE_PREPARING') }}<template v-if="currentName">: {{ currentName }}</template></span><span>{{ percentage }}%</span></div>
      <div class="h-2 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full bg-primary transition-[width]" :style="{ width: `${percentage}%` }" /></div>
      <p class="text-muted-foreground">{{ $t('TOKEN_EXPORT_PROGRESS', { completed: progress.completed, total: progress.total, success: progress.successCount, failure: progress.failureCount }) }}</p>
      <p v-if="progress.error" class="text-destructive">{{ progress.error }}</p>
    </div>
  </div>
</template>
