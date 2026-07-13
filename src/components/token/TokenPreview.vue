<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { appConfiguration } from '@/lib/configuration'
import { appendDebugLog } from '@/lib/backend'
import { PixiTokenRenderer } from '@/lib/token/preview/PixiTokenRenderer'
import { configurePreview } from '@/lib/token/preview/config'
import { LatestPreviewLoad, loadPreviewImage } from '@/lib/token/preview/imageLoader'
import { AppFrontendRingProvider } from '@/lib/token/rings/RingTextureProvider'
import type { RingDescriptor, TokenParams } from '@/lib/token'
import { useEditorStore } from '@/stores/editor'
import { useTokenStore } from '@/stores/token'

const token = useTokenStore()
const editor = useEditorStore()
const container = ref<HTMLDivElement>()
const loading = ref(false)
const errorMessage = ref('')
const ringWarning = ref('')
const loads = new LatestPreviewLoad()
const ringProvider = new AppFrontendRingProvider(appConfiguration.token, descriptorForRing)
let renderer: PixiTokenRenderer | undefined
let disposed = false
let ringVersion = 0

configurePreview(appConfiguration.token.preview)

const sourcePath = computed(() => {
  const item = token.selectedItem
  if (!item) return ''
  return token.resolvedSources[item.id] || item.sourcePath
})

const params = computed<TokenParams | undefined>(() => {
  const item = token.selectedItem
  const settings = token.document?.exportSettings
  if (!item || !settings) return undefined
  const ringAssetId = item.style.ringStyle.startsWith('asset:')
    ? item.style.ringStyle.slice('asset:'.length)
    : undefined
  const ringAsset = ringAssetId ? editor.resolveAsset(ringAssetId) : undefined
  const ring = ringAsset?.tokenRing
  return {
    size: appConfiguration.token.defaults.designSize,
    ...item.style,
    ...settings,
    ringInnerRadius: ring?.innerRadius ?? item.style.ringInnerRadius,
    ringOuterRadius: ring?.outerRadius ?? item.style.ringOuterRadius,
    ringImageScaleX: ring ? ring.assetScale * 100 : 100,
    ringImageScaleY: ring ? ring.assetScale * 100 : 100,
    ringImageOffsetX: ring?.offsetX ?? 0,
    ringImageOffsetY: ring?.offsetY ?? 0,
    ringAssetPath: ringAsset?.path,
  }
})

function descriptorForRing(id: string): RingDescriptor | undefined {
  if (id.startsWith('asset:')) {
    const asset = editor.resolveAsset(id.slice('asset:'.length))
    if (!asset?.tokenRing) return undefined
    return {
      id,
      label: asset.name,
      kind: 'custom',
      revision: asset.tokenRing.revision,
      assetPath: asset.path,
      customConfig: {
        designSize: asset.tokenRing.designSize,
        innerRadius: asset.tokenRing.innerRadius,
        outerRadius: asset.tokenRing.outerRadius,
        imageScaleX: asset.tokenRing.assetScale * 100,
        imageScaleY: asset.tokenRing.assetScale * 100,
        imageOffsetX: asset.tokenRing.offsetX,
        imageOffsetY: asset.tokenRing.offsetY,
      },
    }
  }
  return { id, label: id, kind: 'builtin', revision: 1 }
}

async function refreshImage(path: string) {
  const generation = loads.begin()
  if (!renderer) return
  if (!path) {
    renderer.setImage(null)
    loading.value = false
    errorMessage.value = '当前项目项缺少可用图片来源'
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const image = await loadPreviewImage(path)
    if (disposed || !loads.isCurrent(generation)) return
    renderer.setImage(image)
    if (params.value) renderer.update(params.value)
  } catch (error) {
    if (loads.isCurrent(generation)) renderer.setImage(null)
    if (loads.isCurrent(generation)) errorMessage.value = `无法加载 Token 图片：${String(error)}`
    void appendDebugLog('token', 'token-preview-image-failed', { path, error: String(error) })
  } finally {
    if (loads.isCurrent(generation)) loading.value = false
  }
}

async function refreshRing(value?: TokenParams) {
  if (!renderer || !value) return
  const version = ++ringVersion
  try {
    if (value.ringStyle.startsWith('asset:')) {
      const descriptor = descriptorForRing(value.ringStyle)
      if (!descriptor?.assetPath) throw new Error('Custom ring asset is missing')
      const image = await loadPreviewImage(descriptor.assetPath)
      if (!disposed && version === ringVersion) {
        ringWarning.value = ''
        renderer.setCustomRingImage(image)
      }
      return
    }
    const targetSize = Math.max(256, Math.round(appConfiguration.token.preview.displayTokenSize))
    const image = await ringProvider.renderBuiltin({
      id: value.ringStyle,
      designSize: value.size,
      targetSize,
      innerRadius: value.ringInnerRadius,
      outerRadius: value.ringOuterRadius,
    })
    if (!disposed && version === ringVersion) {
      ringWarning.value = ''
      renderer.setBuiltinRingImage(image)
    }
  } catch (error) {
    try {
      const fallback = await ringProvider.renderBuiltin({
        id: 'solid',
        designSize: value.size,
        targetSize: Math.max(256, Math.round(appConfiguration.token.preview.displayTokenSize)),
        innerRadius: value.ringInnerRadius,
        outerRadius: value.ringOuterRadius,
      })
      if (!disposed && version === ringVersion) {
        ringWarning.value = `圆环 ${value.ringStyle} 不可用，已回退为 solid`
        renderer.setBuiltinRingImage(fallback)
      }
    } catch {
      renderer.clearRingImage()
    }
    void appendDebugLog('token', 'token-preview-ring-failed', {
      ringStyle: value.ringStyle,
      error: String(error),
    })
  }
}

watch(sourcePath, (path) => void refreshImage(path))
watch(params, (value) => {
  if (!value) return
  renderer?.update(value)
}, { deep: true })
watch(() => [params.value?.ringStyle, params.value?.ringInnerRadius, params.value?.ringOuterRadius], () => {
  void refreshRing(params.value)
})

onMounted(async () => {
  await nextTick()
  if (!container.value || disposed) return
  const instance = new PixiTokenRenderer({
    onOffsetChange(offsetX, offsetY) {
      token.updateVisualStyle('offsetX', offsetX)
      token.updateVisualStyle('offsetY', offsetY)
    },
    onOffsetCommit() {
      token.commitEdit()
    },
    onScaleChange(scale) {
      token.updateVisualStyle('scale', scale)
      token.commitEdit()
    },
  }, appConfiguration.token.preview.renderer)
  renderer = instance
  try {
    await instance.mount(container.value)
    if (disposed) return instance.destroy()
    if (params.value) instance.update(params.value)
    await Promise.all([refreshImage(sourcePath.value), refreshRing(params.value)])
  } catch (error) {
    errorMessage.value = `Token 预览初始化失败：${String(error)}`
    void appendDebugLog('token', 'token-preview-init-failed', { error: String(error) })
    instance.destroy()
  }
})

onUnmounted(() => {
  disposed = true
  loads.invalidate()
  ringVersion += 1
  renderer?.destroy()
  ringProvider.destroy()
})

defineExpose({
  capturePreview: () => renderer?.snapshot('image/webp', 0.82),
})
</script>

<template>
  <div class="relative h-full min-h-0 min-w-0 bg-neutral-950">
    <div ref="container" class="h-full min-h-0 min-w-0" />
    <div v-if="loading" class="pointer-events-none absolute inset-x-0 top-3 text-center text-xs text-neutral-300">
      正在加载 Token 图片…
    </div>
    <div v-if="errorMessage" class="absolute inset-x-4 top-4 border border-destructive/40 bg-background/95 p-3 text-xs text-destructive shadow-sm">
      {{ errorMessage }}
    </div>
    <div v-else-if="ringWarning" class="absolute inset-x-4 top-4 border border-border bg-background/95 p-3 text-xs text-muted-foreground shadow-sm">
      {{ ringWarning }}
    </div>
  </div>
</template>
