<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RotateCcw } from '@lucide/vue'

import NumericSliderField from '@/components/controls/NumericSliderField.vue'
import BooleanSettingField from '@/components/controls/BooleanSettingField.vue'
import { Button } from '@/components/ui/button'
import { updateTokenRingConfig, type LibraryRecord } from '@/lib/backend'
import { appConfiguration } from '@/lib/configuration'
import type { TokenRingConfig, TokenVisualStyle } from '@/lib/token'
import { useEditorStore } from '@/stores/editor'
import { useTokenStore } from '@/stores/token'
import TokenColorPicker from './TokenColorPicker.vue'
import TokenRingSelector from './TokenRingSelector.vue'

const token = useTokenStore()
const editor = useEditorStore()
const style = computed(() => token.selectedItem?.style)
const ringDraft = ref<TokenRingConfig>()
const selectedCustomRing = computed<LibraryRecord | undefined>(() => {
  const value = style.value?.ringStyle
  return value?.startsWith('asset:') ? editor.resolveAsset(value.slice('asset:'.length)) : undefined
})

function update<K extends keyof TokenVisualStyle>(key: K, value: TokenVisualStyle[K]) {
  token.updateVisualStyle(key, value)
}

async function saveRingGeometry() {
  const asset = selectedCustomRing.value
  if (!asset?.tokenRing || !ringDraft.value) return
  await updateTokenRingConfig(asset.id, asset.tokenRing.revision, ringDraft.value)
  await editor.refreshLibrary()
}

watch(selectedCustomRing, (asset) => {
  ringDraft.value = asset?.tokenRing ? structuredClone(asset.tokenRing) : undefined
}, { immediate: true })
</script>

<template>
  <div class="space-y-3 p-3">
    <fieldset :disabled="!style" class="space-y-3 disabled:opacity-60">
      <template v-if="style">
        <div v-if="!style.ringStyle.startsWith('asset:')" class="grid gap-2">
          <NumericSliderField label="圆环内径" :model-value="style.ringInnerRadius" :min="0" :max="Math.max(0, style.ringOuterRadius - 1)" unit="px" @edit-start="token.beginEdit()" @update:model-value="update('ringInnerRadius', $event)" @commit="token.commitEdit()" />
          <NumericSliderField label="圆环外径" :model-value="style.ringOuterRadius" :min="style.ringInnerRadius + 1" :max="appConfiguration.token.defaults.designSize / 2" unit="px" @edit-start="token.beginEdit()" @update:model-value="update('ringOuterRadius', $event)" @commit="token.commitEdit()" />
          <NumericSliderField label="圆环横向拉伸" :model-value="style.ringStretchX" :min="appConfiguration.token.limits.ringStretchMin" :max="appConfiguration.token.limits.ringStretchMax" :step="0.01" @edit-start="token.beginEdit()" @update:model-value="update('ringStretchX', $event)" @commit="token.commitEdit()" />
          <NumericSliderField label="圆环纵向拉伸" :model-value="style.ringStretchY" :min="appConfiguration.token.limits.ringStretchMin" :max="appConfiguration.token.limits.ringStretchMax" :step="0.01" @edit-start="token.beginEdit()" @update:model-value="update('ringStretchY', $event)" @commit="token.commitEdit()" />
        </div>

        <div v-if="ringDraft && selectedCustomRing" class="space-y-2 rounded-md border border-border p-2">
          <p class="text-[11px] font-medium text-muted-foreground">自定义圆环几何</p>
          <NumericSliderField label="设计尺寸" :model-value="ringDraft.designSize" :min="64" :max="4096" unit="px" @update:model-value="ringDraft!.designSize = $event" />
          <NumericSliderField label="环内径" :model-value="ringDraft.innerRadius" :min="0" :max="Math.max(0, ringDraft.outerRadius - 1)" unit="px" @update:model-value="ringDraft!.innerRadius = $event" />
          <NumericSliderField label="环外径" :model-value="ringDraft.outerRadius" :min="ringDraft.innerRadius + 1" :max="ringDraft.designSize / 2" unit="px" @update:model-value="ringDraft!.outerRadius = $event" />
          <NumericSliderField label="素材缩放" :model-value="ringDraft.assetScale" :min="0.1" :max="5" :step="0.01" @update:model-value="ringDraft!.assetScale = $event" />
          <NumericSliderField label="素材 X 偏移" :model-value="ringDraft.offsetX" :min="-ringDraft.designSize" :max="ringDraft.designSize" unit="px" @update:model-value="ringDraft!.offsetX = $event" />
          <NumericSliderField label="素材 Y 偏移" :model-value="ringDraft.offsetY" :min="-ringDraft.designSize" :max="ringDraft.designSize" unit="px" @update:model-value="ringDraft!.offsetY = $event" />
          <Button size="sm" class="w-full" @click="saveRingGeometry">更新圆环几何</Button>
        </div>

        <TokenColorPicker label="圆环" :model-value="style.ringColor" @edit-start="token.beginEdit()" @update:model-value="update('ringColor', $event)" @commit="token.commitEdit()" />
        <TokenColorPicker label="背景" :model-value="style.background" @edit-start="token.beginEdit()" @update:model-value="update('background', $event)" @commit="token.commitEdit()" />
        <TokenRingSelector />

        <div class="space-y-2 rounded-md border border-border p-3">
          <BooleanSettingField
            id="token-split-ring"
            label="出框模式"
            description="允许头像在分割线指定的一侧越过圆环；另一侧仍限制在圆形内部。"
            :model-value="style.splitRing"
            @update:model-value="update('splitRing', $event); token.commitEdit()"
          />
          <template v-if="style.splitRing">
            <NumericSliderField label="分割线角度" :model-value="style.splitAngle" :min="appConfiguration.token.limits.splitAngleMin" :max="appConfiguration.token.limits.splitAngleMax" unit="°" @edit-start="token.beginEdit()" @update:model-value="update('splitAngle', $event)" @commit="token.commitEdit()" />
            <NumericSliderField label="分割线高度" :model-value="style.splitHeight" :min="appConfiguration.token.limits.splitHeightMin" :max="appConfiguration.token.limits.splitHeightMax" unit="%" @edit-start="token.beginEdit()" @update:model-value="update('splitHeight', $event)" @commit="token.commitEdit()" />
          </template>
        </div>

        <div class="space-y-2">
          <p class="text-[11px] font-medium text-muted-foreground">微调</p>
          <NumericSliderField label="缩放" :model-value="style.scale" :min="appConfiguration.token.limits.scaleMin" :max="appConfiguration.token.limits.scaleMax" :step="appConfiguration.token.limits.scaleStep" unit="%" @edit-start="token.beginEdit()" @update:model-value="update('scale', $event)" @commit="token.commitEdit()" />
          <NumericSliderField label="水平偏移" :model-value="style.offsetX" :min="appConfiguration.token.limits.offsetMin" :max="appConfiguration.token.limits.offsetMax" unit="%" @edit-start="token.beginEdit()" @update:model-value="update('offsetX', $event)" @commit="token.commitEdit()" />
          <NumericSliderField label="垂直偏移" :model-value="style.offsetY" :min="appConfiguration.token.limits.offsetMin" :max="appConfiguration.token.limits.offsetMax" unit="%" @edit-start="token.beginEdit()" @update:model-value="update('offsetY', $event)" @commit="token.commitEdit()" />
          <Button size="sm" variant="outline" class="w-full" @click="token.resetSelectedStyle()"><RotateCcw data-icon="inline-start" />重置当前</Button>
        </div>
      </template>
    </fieldset>
  </div>
</template>
