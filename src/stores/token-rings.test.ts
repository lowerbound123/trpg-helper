import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useEditorStore } from '@/stores/editor'
import { useTokenRingStore } from './token-rings'

const backend = vi.hoisted(() => ({
  updateTokenRingConfig: vi.fn(),
}))

vi.mock('@/lib/backend', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/backend')>(),
  updateTokenRingConfig: backend.updateTokenRingConfig,
}))

describe('token ring store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('previews geometry locally and commits against the current revision', async () => {
    const editor = useEditorStore()
    editor.library.assets = [{
      id: 'ring', name: 'ring.png', fileName: 'ring.png', path: '/ring.png', mediaType: 'image/png',
      tags: [], folder: 'rings', createdAt: '', updatedAt: '', tokenRing: {
        revision: 2, designSize: 512, innerRadius: 225, outerRadius: 250,
        imageScaleX: 100, imageScaleY: 100, imageOffsetX: 0, imageOffsetY: 0,
      },
    }]
    backend.updateTokenRingConfig.mockResolvedValue({
      ...editor.library,
      assets: [{ ...editor.library.assets[0], tokenRing: { ...editor.library.assets[0]!.tokenRing!, revision: 3, imageOffsetX: 12 } }],
    })
    const rings = useTokenRingStore()
    const next = { ...rings.descriptor('asset:ring')!.customConfig!, imageOffsetX: 12 }

    rings.previewConfig('asset:ring', next)
    expect(rings.descriptor('asset:ring')?.customConfig?.imageOffsetX).toBe(12)
    await rings.commitConfig('asset:ring', next)

    expect(backend.updateTokenRingConfig).toHaveBeenCalledWith('ring', 2, expect.objectContaining({ imageOffsetX: 12 }))
    expect(rings.descriptor('asset:ring')?.revision).toBe(3)
  })
})
