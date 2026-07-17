<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { appConfiguration } from '@/lib/configuration'
import { appendDebugLog } from '@/lib/backend'
import { PixiTokenRenderer } from '@/lib/token/preview/PixiTokenRenderer'
import { configurePreview } from '@/lib/token/preview/config'
import { LatestPreviewLoad, loadPreviewImage } from '@/lib/token/preview/imageLoader'
import { AppFrontendRingProvider } from '@/lib/token/rings/RingTextureProvider'
import { ringProviderKey } from '@/lib/token/rings/providerContext'
import type { RingDescriptor, TokenParams } from '@/lib/token'
import type { PreviewImageSource } from '@/lib/token/preview/imageLoader'
import { useEditorStore } from '@/stores/editor'
import { useTokenStore } from '@/stores/token'
import { useTokenRingStore } from '@/stores/token-rings'
import { useTokenBackgroundStore } from '@/stores/token-backgrounds'
import { translate } from '@/i18n'

const token = useTokenStore()
const editor = useEditorStore()
const rings = useTokenRingStore()
const backgrounds = useTokenBackgroundStore()
const container = ref<HTMLDivElement>()
const loading = ref(false)
const errorMessage = ref('')
const ringWarning = ref('')
const backgroundWarning = ref('')
const viewportZoom = ref(1)
const loads = new LatestPreviewLoad()
const ringProvider = inject(
  ringProviderKey,
  () => new AppFrontendRingProvider(appConfiguration.token, rings.descriptor),
  true,
)
let renderer: PixiTokenRenderer | undefined
let disposed = false
let ringVersion = 0
let backgroundVersion = 0
const backgroundImages = new Map<string, PreviewImageSource>()
let ringRefreshTimer: ReturnType<typeof setTimeout> | undefined

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
  const ring = rings.descriptor(item.style.ringStyle)?.customConfig
  const background = backgrounds.descriptor(item.style.backgroundStyle)?.customConfig
  const backgroundAsset = item.style.backgroundStyle.startsWith('asset:')
    ? editor.resolveAsset(item.style.backgroundStyle.slice('asset:'.length))
    : undefined
  const missingBackground = item.style.backgroundStyle.startsWith('asset:') && !backgroundAsset?.tokenBackground
  return {
    size: appConfiguration.token.defaults.designSize,
    ...item.style,
    ...settings,
    ringInnerRadius: ring?.innerRadius ?? item.style.ringInnerRadius,
    ringOuterRadius: ring?.outerRadius ?? item.style.ringOuterRadius,
    ringImageScaleX: ring?.imageScaleX ?? 100,
    ringImageScaleY: ring?.imageScaleY ?? 100,
    ringImageOffsetX: ring?.imageOffsetX ?? 0,
    ringImageOffsetY: ring?.imageOffsetY ?? 0,
    ringAssetPath: ringAsset?.path,
    backgroundStyle: missingBackground ? 'solid' : item.style.backgroundStyle,
    backgroundImageOffsetX: background?.imageOffsetX ?? 0,
    backgroundImageOffsetY: background?.imageOffsetY ?? 0,
    backgroundAssetPath: backgroundAsset?.path,
  }
})

function descriptorForRing(id: string): RingDescriptor | undefined {
  return rings.descriptor(id)
}

async function refreshBackground(value?: TokenParams) {
  if (!renderer || !value) return
  const version = ++backgroundVersion
  if (!value.backgroundStyle.startsWith('asset:') || !value.backgroundAssetPath) {
    backgroundWarning.value = value.backgroundStyle.startsWith('asset:')
      ? translate('TOKEN_BACKGROUND_UNAVAILABLE')
      : ''
    renderer.setBackgroundImage(null)
    return
  }
  try {
    const revision = backgrounds.descriptor(value.backgroundStyle)?.revision ?? 0
    const cacheKey = `${value.backgroundStyle}:${revision}`
    let image = backgroundImages.get(cacheKey)
    if (!image) {
      image = await loadPreviewImage(value.backgroundAssetPath, false)
      backgroundImages.set(cacheKey, image)
      while (backgroundImages.size > appConfiguration.token.backgrounds.frontendCacheEntries) {
        backgroundImages.delete(backgroundImages.keys().next().value as string)
      }
    }
    if (!disposed && version === backgroundVersion) {
      backgroundWarning.value = ''
      renderer.setBackgroundImage(image)
    }
  } catch (error) {
    if (!disposed && version === backgroundVersion) {
      backgroundWarning.value = translate('TOKEN_BACKGROUND_UNAVAILABLE')
      renderer.setBackgroundImage(null)
    }
    void appendDebugLog('token', 'token-preview-background-failed', {
      backgroundStyle: value.backgroundStyle,
      error: String(error),
    })
  }
}

function changeViewportZoom(factor: number) {
  viewportZoom.value = renderer?.setViewportZoom(viewportZoom.value * factor) ?? viewportZoom.value
}

function fitViewport() {
  viewportZoom.value = 1
  renderer?.fitViewport()
}

async function refreshImage(path: string) {
  const generation = loads.begin()
  if (!renderer) return
  if (!path) {
    renderer.setImage(null)
    loading.value = false
    errorMessage.value = translate('TOKEN_IMAGE_SOURCE_MISSING')
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
    if (loads.isCurrent(generation)) errorMessage.value = translate('TOKEN_IMAGE_LOAD_FAILED')
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
      const image = await ringProvider.loadCustomAsset(value.ringStyle)
      if (!disposed && version === ringVersion) {
        ringWarning.value = ''
        renderer.setCustomRingImage(image)
      }
      return
    }
    const dpr = Math.min(globalThis.devicePixelRatio || 1, appConfiguration.token.preview.devicePixelRatioMax)
    const targetSize = Math.max(256, Math.round(appConfiguration.token.preview.displayTokenSize * dpr))
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
        ringWarning.value = translate('TOKEN_RING_UNAVAILABLE', { name: value.ringStyle })
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

function scheduleRingRefresh() {
  clearTimeout(ringRefreshTimer)
  ringRefreshTimer = setTimeout(() => void refreshRing(params.value), appConfiguration.token.rings.requestDebounceMs)
}

watch(sourcePath, (path) => void refreshImage(path))
watch(params, (value) => {
  if (!value) return
  renderer?.update(value)
}, { deep: true })
watch(() => [params.value?.ringStyle, params.value?.ringInnerRadius, params.value?.ringOuterRadius,
  rings.descriptor(params.value?.ringStyle || '')?.revision], scheduleRingRefresh)
watch(() => [params.value?.backgroundStyle,
  backgrounds.descriptor(params.value?.backgroundStyle || '')?.revision], () => void refreshBackground(params.value))

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
    await Promise.all([refreshImage(sourcePath.value), refreshRing(params.value), refreshBackground(params.value)])
  } catch (error) {
    errorMessage.value = translate('TOKEN_PREVIEW_INITIALIZATION_FAILED')
    void appendDebugLog('token', 'token-preview-init-failed', { error: String(error) })
    instance.destroy()
  }
})

onUnmounted(() => {
  disposed = true
  loads.invalidate()
  ringVersion += 1
  backgroundVersion += 1
  clearTimeout(ringRefreshTimer)
  renderer?.destroy()
})

defineExpose({
  capturePreview: () => renderer?.snapshot('image/webp', 0.82),
  changeViewportZoom,
  fitViewport,
  viewportZoom,
})
</script>

<template>
  <div class="relative h-full min-h-0 min-w-0 overflow-hidden bg-background">
    <div ref="container" class="h-full min-h-0 min-w-0" />
    <div v-if="loading" class="pointer-events-none absolute inset-x-0 top-3 text-center text-xs text-muted-foreground">
      {{ $t('TOKEN_PREVIEW_LOADING') }}
    </div>
    <div v-if="errorMessage" class="absolute inset-x-4 top-4 rounded-md border border-destructive/40 bg-background/95 p-3 text-xs text-destructive shadow-sm">
      {{ errorMessage }}
    </div>
    <div v-else-if="ringWarning || backgroundWarning" class="absolute inset-x-4 top-4 rounded-md border border-border bg-background/95 p-3 text-xs text-muted-foreground shadow-sm">
      {{ ringWarning || backgroundWarning }}
    </div>
  </div>
</template>
