import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { updateTokenBackgroundConfig, type LibraryRecord } from '@/lib/backend'
import { appConfiguration } from '@/lib/configuration'
import type { BackgroundDescriptor, CustomBackgroundConfig } from '@/lib/token'
import { useEditorStore } from './editor'

function descriptorFromAsset(asset: LibraryRecord, override?: CustomBackgroundConfig): BackgroundDescriptor | undefined {
  if (!asset.tokenBackground) return undefined
  const config = override ?? asset.tokenBackground
  return {
    id: `asset:${asset.id}`,
    label: asset.name,
    kind: 'custom',
    revision: asset.tokenBackground.revision,
    assetPath: asset.path,
    customConfig: {
      designSize: config.designSize,
      imageOffsetX: config.imageOffsetX,
      imageOffsetY: config.imageOffsetY,
    },
  }
}

export const useTokenBackgroundStore = defineStore('token-backgrounds', () => {
  const editor = useEditorStore()
  const previewOverrides = ref<Record<string, CustomBackgroundConfig>>({})
  const error = ref('')

  const descriptors = computed<BackgroundDescriptor[]>(() => [
    { id: 'solid', label: 'solid', kind: 'solid', revision: 1 },
    ...editor.library.assets.flatMap((asset) => {
      const descriptor = descriptorFromAsset(asset, previewOverrides.value[`asset:${asset.id}`])
      return descriptor ? [descriptor] : []
    }),
  ])
  const customBackgrounds = computed(() => descriptors.value.filter((item) => item.kind === 'custom'))

  function descriptor(id: string) {
    return descriptors.value.find((item) => item.id === id)
  }

  function previewConfig(id: string, config: CustomBackgroundConfig) {
    if (descriptor(id)?.kind !== 'custom') return
    previewOverrides.value = { ...previewOverrides.value, [id]: { ...config } }
  }

  async function commitConfig(id: string, config: CustomBackgroundConfig) {
    const assetId = id.startsWith('asset:') ? id.slice('asset:'.length) : ''
    const asset = editor.resolveAsset(assetId)
    if (!asset?.tokenBackground) throw new Error('Custom token background does not exist')
    const expectedRevision = asset.tokenBackground.revision
    try {
      editor.library = await updateTokenBackgroundConfig(assetId, expectedRevision, {
        ...config,
        revision: expectedRevision,
      })
      delete previewOverrides.value[id]
      const next = editor.resolveAsset(assetId)?.tokenBackground
      return next ? { ...next } : { ...config, revision: expectedRevision + 1 }
    } catch (reason) {
      delete previewOverrides.value[id]
      error.value = String(reason)
      throw reason
    }
  }

  async function importBackground(file: File) {
    const limits = appConfiguration.token.backgrounds
    if (file.size > limits.maxUploadBytes) {
      throw new Error(`Custom token background exceeds the ${limits.maxUploadBytes} byte upload limit`)
    }
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file)
      try {
        if (Math.max(bitmap.width, bitmap.height) > limits.maxSourceDimension) {
          throw new Error(`Custom token background exceeds the ${limits.maxSourceDimension}px dimension limit`)
        }
      } finally {
        bitmap.close()
      }
    }
    const asset = await editor.importAssetFile(file, 'token-background', 'token-backgrounds')
    return descriptor(`asset:${asset.id}`)
  }

  async function deleteBackground(id: string) {
    const assetId = id.startsWith('asset:') ? id.slice('asset:'.length) : ''
    if (!assetId) return
    await editor.deleteResourceEntries('asset', { ids: [assetId], folders: [] })
    await editor.refreshLibrary()
    delete previewOverrides.value[id]
  }

  function evictPreview(id?: string) {
    if (!id) previewOverrides.value = {}
    else delete previewOverrides.value[id]
  }

  return {
    descriptors, customBackgrounds, error,
    descriptor, previewConfig, commitConfig, importBackground, deleteBackground, evictPreview,
  }
})
