<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, RotateCcw } from '@lucide/vue'

import NumericSliderField from '@/components/controls/NumericSliderField.vue'
import BooleanSettingField from '@/components/controls/BooleanSettingField.vue'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { appConfiguration } from '@/lib/configuration'
import type { CustomBackgroundConfig, CustomRingConfig, TokenVisualStyle } from '@/lib/token'
import { useTokenStore } from '@/stores/token'
import { useTokenRingStore } from '@/stores/token-rings'
import { useTokenBackgroundStore } from '@/stores/token-backgrounds'
import TokenColorPicker from './TokenColorPicker.vue'
import TokenRingSelector from './TokenRingSelector.vue'
import TokenBackgroundSelector from './TokenBackgroundSelector.vue'
import { translate } from '@/i18n'

const token = useTokenStore()
const rings = useTokenRingStore()
const backgrounds = useTokenBackgroundStore()
const style = computed(() => token.selectedItem?.style)
const ringDraft = ref<CustomRingConfig>()
const geometryOpen = ref(false)
const backgroundGeometryOpen = ref(false)
const selectedRingId = computed(() => style.value?.ringStyle.startsWith('asset:') ? style.value.ringStyle : undefined)
const selectedCustomRing = computed(() => selectedRingId.value ? rings.descriptor(selectedRingId.value) : undefined)
let ringEditBefore: CustomRingConfig | undefined
const selectedBackgroundId = computed(() => style.value?.backgroundStyle.startsWith('asset:') ? style.value.backgroundStyle : undefined)
const selectedCustomBackground = computed(() => selectedBackgroundId.value ? backgrounds.descriptor(selectedBackgroundId.value) : undefined)
const backgroundDraft = ref<CustomBackgroundConfig>()
let backgroundEditBefore: CustomBackgroundConfig | undefined

function update<K extends keyof TokenVisualStyle>(key: K, value: TokenVisualStyle[K]) {
  token.updateVisualStyle(key, value)
}

function beginRingEdit() {
  if (ringEditBefore || !selectedCustomRing.value?.customConfig) return
  ringEditBefore = { ...selectedCustomRing.value.customConfig }
}

function previewRing<K extends keyof CustomRingConfig>(key: K, value: CustomRingConfig[K]) {
  if (!ringDraft.value || !selectedRingId.value) return
  beginRingEdit()
  ringDraft.value[key] = value
  rings.previewConfig(selectedRingId.value, ringDraft.value)
}

async function commitRingGeometry() {
  if (!ringEditBefore || !ringDraft.value || !selectedRingId.value) return
  const before = ringEditBefore
  const after = { ...ringDraft.value }
  ringEditBefore = undefined
  try {
    const committed = await rings.commitConfig(selectedRingId.value, after)
    ringDraft.value = { ...committed }
    token.recordRingConfig(selectedRingId.value, before, after)
  } catch (error) {
    ringDraft.value = { ...before }
    token.status = translate('TOKEN_CUSTOM_RING_UPDATE_FAILED')
  }
}

function beginBackgroundEdit() {
  if (backgroundEditBefore || !selectedCustomBackground.value?.customConfig) return
  backgroundEditBefore = { ...selectedCustomBackground.value.customConfig }
}

function previewBackground<K extends keyof CustomBackgroundConfig>(key: K, value: CustomBackgroundConfig[K]) {
  if (!backgroundDraft.value || !selectedBackgroundId.value) return
  beginBackgroundEdit()
  backgroundDraft.value[key] = value
  backgrounds.previewConfig(selectedBackgroundId.value, backgroundDraft.value)
}

async function commitBackgroundGeometry() {
  if (!backgroundEditBefore || !backgroundDraft.value || !selectedBackgroundId.value) return
  const before = backgroundEditBefore
  const after = { ...backgroundDraft.value }
  backgroundEditBefore = undefined
  try {
    const committed = await backgrounds.commitConfig(selectedBackgroundId.value, after)
    backgroundDraft.value = { ...committed }
    token.recordBackgroundConfig(selectedBackgroundId.value, before, after)
  } catch {
    backgroundDraft.value = { ...before }
  }
}

watch(() => [selectedRingId.value, selectedCustomRing.value?.revision] as const, () => {
  const asset = selectedCustomRing.value
  ringEditBefore = undefined
  ringDraft.value = asset?.customConfig ? { ...asset.customConfig } : undefined
}, { immediate: true })
watch(() => [selectedBackgroundId.value, selectedCustomBackground.value?.revision] as const, () => {
  backgroundEditBefore = undefined
  backgroundDraft.value = selectedCustomBackground.value?.customConfig
    ? { ...selectedCustomBackground.value.customConfig }
    : undefined
}, { immediate: true })
</script>

<template>
  <div class="space-y-3 p-3">
    <fieldset :disabled="!style" class="space-y-3 disabled:opacity-60">
      <template v-if="style">
        <div v-if="!style.ringStyle.startsWith('asset:')" class="grid gap-2">
          <NumericSliderField :label="$t('TOKEN_RING_INNER_RADIUS')" :model-value="style.ringInnerRadius" :min="0" :max="Math.max(0, style.ringOuterRadius - 1)" unit="px" @edit-start="token.beginEdit()" @update:model-value="update('ringInnerRadius', $event)" @commit="token.commitEdit()" />
          <NumericSliderField :label="$t('TOKEN_RING_OUTER_RADIUS')" :model-value="style.ringOuterRadius" :min="style.ringInnerRadius + 1" :max="appConfiguration.token.defaults.designSize / 2" unit="px" @edit-start="token.beginEdit()" @update:model-value="update('ringOuterRadius', $event)" @commit="token.commitEdit()" />
        </div>

        <Collapsible v-if="ringDraft && selectedCustomRing" v-model:open="geometryOpen" class="rounded-md border border-border">
          <CollapsibleTrigger
            data-testid="custom-ring-geometry-trigger"
            class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-muted/60"
          >
            <span>{{ $t('TOKEN_CUSTOM_RING_GEOMETRY') }} <span class="text-muted-foreground">v{{ selectedCustomRing.revision }}</span></span>
            <ChevronDown class="size-4 transition-transform" :class="geometryOpen ? 'rotate-180' : ''" />
          </CollapsibleTrigger>
          <CollapsibleContent class="space-y-2 border-t border-border p-2">
            <NumericSliderField :label="$t('TOKEN_RING_INNER_RADIUS')" :model-value="ringDraft.innerRadius" :min="0" :max="Math.max(0, ringDraft.outerRadius - 1)" unit="px" @edit-start="beginRingEdit" @update:model-value="previewRing('innerRadius', $event)" @commit="commitRingGeometry" />
            <NumericSliderField :label="$t('TOKEN_RING_OUTER_RADIUS')" :model-value="ringDraft.outerRadius" :min="ringDraft.innerRadius + 1" :max="ringDraft.designSize / 2" unit="px" @edit-start="beginRingEdit" @update:model-value="previewRing('outerRadius', $event)" @commit="commitRingGeometry" />
            <NumericSliderField :label="$t('TOKEN_RING_SCALE_X')" :model-value="ringDraft.imageScaleX" :min="appConfiguration.token.rings.customScaleMin" :max="appConfiguration.token.rings.customScaleMax" unit="%" @edit-start="beginRingEdit" @update:model-value="previewRing('imageScaleX', $event)" @commit="commitRingGeometry" />
            <NumericSliderField :label="$t('TOKEN_RING_SCALE_Y')" :model-value="ringDraft.imageScaleY" :min="appConfiguration.token.rings.customScaleMin" :max="appConfiguration.token.rings.customScaleMax" unit="%" @edit-start="beginRingEdit" @update:model-value="previewRing('imageScaleY', $event)" @commit="commitRingGeometry" />
            <NumericSliderField :label="$t('TOKEN_RING_OFFSET_X')" :model-value="ringDraft.imageOffsetX" :min="-ringDraft.designSize" :max="ringDraft.designSize" unit="px" @edit-start="beginRingEdit" @update:model-value="previewRing('imageOffsetX', $event)" @commit="commitRingGeometry" />
            <NumericSliderField :label="$t('TOKEN_RING_OFFSET_Y')" :model-value="ringDraft.imageOffsetY" :min="-ringDraft.designSize" :max="ringDraft.designSize" unit="px" @edit-start="beginRingEdit" @update:model-value="previewRing('imageOffsetY', $event)" @commit="commitRingGeometry" />
          </CollapsibleContent>
        </Collapsible>

        <TokenColorPicker :label="$t('TOKEN_RING')" :model-value="style.ringColor" @edit-start="token.beginEdit()" @update:model-value="update('ringColor', $event)" @commit="token.commitEdit()" />
        <NumericSliderField :label="$t('TOKEN_AVATAR_RADIUS')" :model-value="style.avatarRadius" :min="0" :max="appConfiguration.token.defaults.designSize / 2" unit="px" @edit-start="token.beginEdit()" @update:model-value="update('avatarRadius', $event)" @commit="token.commitEdit()" />
        <TokenColorPicker v-if="style.backgroundStyle === 'solid'" :label="$t('TOKEN_BACKGROUND')" :model-value="style.background" @edit-start="token.beginEdit()" @update:model-value="update('background', $event)" @commit="token.commitEdit()" />
        <TokenBackgroundSelector />
        <Collapsible v-if="backgroundDraft && selectedCustomBackground" v-model:open="backgroundGeometryOpen" class="rounded-md border border-border">
          <CollapsibleTrigger data-testid="custom-background-geometry-trigger" class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-muted/60">
            <span>{{ $t('TOKEN_CUSTOM_BACKGROUND_POSITION') }} <span class="text-muted-foreground">v{{ selectedCustomBackground.revision }}</span></span>
            <ChevronDown class="size-4 transition-transform" :class="backgroundGeometryOpen ? 'rotate-180' : ''" />
          </CollapsibleTrigger>
          <CollapsibleContent class="space-y-2 border-t border-border p-2">
            <NumericSliderField :label="$t('TOKEN_BACKGROUND_OFFSET_X')" :model-value="backgroundDraft.imageOffsetX" :min="appConfiguration.token.backgrounds.offsetMin" :max="appConfiguration.token.backgrounds.offsetMax" unit="px" @edit-start="beginBackgroundEdit" @update:model-value="previewBackground('imageOffsetX', $event)" @commit="commitBackgroundGeometry" />
            <NumericSliderField :label="$t('TOKEN_BACKGROUND_OFFSET_Y')" :model-value="backgroundDraft.imageOffsetY" :min="appConfiguration.token.backgrounds.offsetMin" :max="appConfiguration.token.backgrounds.offsetMax" unit="px" @edit-start="beginBackgroundEdit" @update:model-value="previewBackground('imageOffsetY', $event)" @commit="commitBackgroundGeometry" />
          </CollapsibleContent>
        </Collapsible>
        <TokenRingSelector />

        <div class="space-y-2 rounded-md border border-border p-3">
          <BooleanSettingField
            id="token-split-ring"
            :label="$t('TOKEN_OUT_OF_FRAME')"
            :description="$t('TOKEN_OUT_OF_FRAME_HELP')"
            :model-value="style.splitRing"
            @update:model-value="update('splitRing', $event); token.commitEdit()"
          />
          <template v-if="style.splitRing">
            <NumericSliderField :label="$t('TOKEN_SPLIT_ANGLE')" :model-value="style.splitAngle" :min="appConfiguration.token.limits.splitAngleMin" :max="appConfiguration.token.limits.splitAngleMax" unit="°" @edit-start="token.beginEdit()" @update:model-value="update('splitAngle', $event)" @commit="token.commitEdit()" />
            <NumericSliderField :label="$t('TOKEN_SPLIT_HEIGHT')" :model-value="style.splitHeight" :min="appConfiguration.token.limits.splitHeightMin" :max="appConfiguration.token.limits.splitHeightMax" unit="%" @edit-start="token.beginEdit()" @update:model-value="update('splitHeight', $event)" @commit="token.commitEdit()" />
          </template>
        </div>

        <div class="space-y-2">
          <p class="text-[11px] font-medium text-muted-foreground">{{ $t('TOKEN_FINE_TUNE') }}</p>
          <NumericSliderField :label="$t('TOKEN_SCALE')" :model-value="style.scale" :min="appConfiguration.token.limits.scaleMin" :max="appConfiguration.token.limits.scaleMax" :step="appConfiguration.token.limits.scaleStep" unit="%" @edit-start="token.beginEdit()" @update:model-value="update('scale', $event)" @commit="token.commitEdit()" />
          <NumericSliderField :label="$t('TOKEN_OFFSET_X')" :model-value="style.offsetX" :min="appConfiguration.token.limits.offsetMin" :max="appConfiguration.token.limits.offsetMax" unit="%" @edit-start="token.beginEdit()" @update:model-value="update('offsetX', $event)" @commit="token.commitEdit()" />
          <NumericSliderField :label="$t('TOKEN_OFFSET_Y')" :model-value="style.offsetY" :min="appConfiguration.token.limits.offsetMin" :max="appConfiguration.token.limits.offsetMax" unit="%" @edit-start="token.beginEdit()" @update:model-value="update('offsetY', $event)" @commit="token.commitEdit()" />
          <Button size="sm" variant="outline" class="w-full" @click="token.resetSelectedStyle()"><RotateCcw data-icon="inline-start" />{{ $t('TOKEN_RESET_CURRENT') }}</Button>
        </div>
      </template>
    </fieldset>
  </div>
</template>
