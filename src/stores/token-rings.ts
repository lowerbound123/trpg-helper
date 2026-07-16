import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { updateTokenRingConfig, type LibraryRecord } from '@/lib/backend'
import { appConfiguration } from '@/lib/configuration'
import { migrateTokenRingConfig, normalizeTokenRingConfig } from '@/lib/token/ring-config'
import type { CustomRingConfig, RingDescriptor } from '@/lib/token'
import { useEditorStore } from './editor'

const BUILTIN_RING_IDS = [
  'solid', 'double', 'dashed', 'gradient_inner', 'bevel', 'dots',
  'segmented', 'circuit', 'arcane', 'notched', 'braided',
]

function descriptorFromAsset(asset: LibraryRecord, override?: CustomRingConfig): RingDescriptor | undefined {
  if (!asset.tokenRing) return undefined
  const config = override ?? normalizeTokenRingConfig(asset.tokenRing)
  return {
    id: `asset:${asset.id}`,
    label: asset.name,
    kind: 'custom',
    revision: asset.tokenRing.revision,
    assetPath: asset.path,
    customConfig: { ...config },
  }
}

export const useTokenRingStore = defineStore('token-rings', () => {
  const editor = useEditorStore()
  const previewOverrides = ref<Record<string, CustomRingConfig>>({})
  const loading = ref(false)
  const error = ref('')

  const descriptors = computed<RingDescriptor[]>(() => [
    ...BUILTIN_RING_IDS.map((id) => ({ id, label: id, kind: 'builtin' as const, revision: 1 })),
    ...editor.library.assets.flatMap((asset) => {
      const descriptor = descriptorFromAsset(asset, previewOverrides.value[`asset:${asset.id}`])
      return descriptor ? [descriptor] : []
    }),
  ])
  const builtinRings = computed(() => descriptors.value.filter((ring) => ring.kind === 'builtin'))
  const customRings = computed(() => descriptors.value.filter((ring) => ring.kind === 'custom'))

  function descriptor(id: string) {
    return descriptors.value.find((ring) => ring.id === id)
  }

  function previewConfig(id: string, config: CustomRingConfig) {
    if (descriptor(id)?.kind !== 'custom') return
    previewOverrides.value = { ...previewOverrides.value, [id]: { ...config } }
  }

  async function commitConfig(id: string, config: CustomRingConfig) {
    const assetId = id.startsWith('asset:') ? id.slice('asset:'.length) : ''
    const asset = editor.resolveAsset(assetId)
    if (!asset?.tokenRing) throw new Error('自定义圆环不存在')
    const expectedRevision = asset.tokenRing.revision
    try {
      editor.library = await updateTokenRingConfig(assetId, expectedRevision, {
        ...config,
        revision: expectedRevision,
      })
      const next = editor.resolveAsset(assetId)?.tokenRing
      delete previewOverrides.value[id]
      return next ? normalizeTokenRingConfig(next) : { ...config, revision: expectedRevision + 1 }
    } catch (reason) {
      delete previewOverrides.value[id]
      error.value = String(reason)
      throw reason
    }
  }

  async function ensureMigrations() {
    loading.value = true
    try {
      for (const asset of [...editor.library.assets]) {
        if (!asset.tokenRing) continue
        const migrated = migrateTokenRingConfig(asset.tokenRing, appConfiguration.token.defaults.designSize)
        if (!migrated.migrated) continue
        const { revision: _revision, ...config } = migrated.config
        await commitConfig(`asset:${asset.id}`, config)
      }
      error.value = ''
    } catch (reason) {
      error.value = String(reason)
    } finally {
      loading.value = false
    }
  }

  async function importRing(file: File) {
    const asset = await editor.importAssetFile(file, 'token-ring', 'rings')
    return descriptor(`asset:${asset.id}`)
  }

  async function deleteRing(id: string) {
    const assetId = id.startsWith('asset:') ? id.slice('asset:'.length) : ''
    if (!assetId) return
    await editor.deleteResourceEntries('asset', { ids: [assetId], folders: [] })
    await editor.refreshLibrary()
    evictPreview(id)
  }

  function resolveGeometry(id: string) {
    const ring = descriptor(id)
    if (ring?.kind !== 'custom' || !ring.customConfig) return null
    return {
      ringInnerRadius: ring.customConfig.innerRadius,
      ringOuterRadius: ring.customConfig.outerRadius,
      ringStretchX: 1,
      ringStretchY: 1,
      ringImageScaleX: ring.customConfig.imageScaleX,
      ringImageScaleY: ring.customConfig.imageScaleY,
      ringImageOffsetX: ring.customConfig.imageOffsetX,
      ringImageOffsetY: ring.customConfig.imageOffsetY,
      revision: ring.revision,
    }
  }

  function evictPreview(id?: string) {
    if (!id) previewOverrides.value = {}
    else delete previewOverrides.value[id]
  }

  return {
    descriptors, builtinRings, customRings, loading, error,
    descriptor, previewConfig, commitConfig, ensureMigrations, importRing, deleteRing,
    resolveGeometry, evictPreview,
  }
})
