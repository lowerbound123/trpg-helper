import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useEditorStore } from '@/stores/editor'
import { appConfiguration } from '@/lib/configuration'
import { useTokenBackgroundStore } from './token-backgrounds'

const backend = vi.hoisted(() => ({ updateTokenBackgroundConfig: vi.fn() }))

vi.mock('@/lib/backend', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/backend')>(),
  updateTokenBackgroundConfig: backend.updateTokenBackgroundConfig,
}))

describe('token background store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('previews shared offsets and commits against the asset revision', async () => {
    const editor = useEditorStore()
    editor.library.assets = [{
      id: 'background', name: 'forest.png', fileName: 'forest.png', path: '/forest.png', mediaType: 'image/png',
      tags: [], folder: 'token-backgrounds', createdAt: '', updatedAt: '', tokenBackground: {
        revision: 4, designSize: 512, imageOffsetX: 0, imageOffsetY: 0,
      },
    }]
    backend.updateTokenBackgroundConfig.mockResolvedValue({
      ...editor.library,
      assets: [{ ...editor.library.assets[0], tokenBackground: { ...editor.library.assets[0]!.tokenBackground!, revision: 5, imageOffsetX: 16 } }],
    })
    const backgrounds = useTokenBackgroundStore()
    const next = { ...backgrounds.descriptor('asset:background')!.customConfig!, imageOffsetX: 16 }

    backgrounds.previewConfig('asset:background', next)
    expect(backgrounds.descriptor('asset:background')?.customConfig?.imageOffsetX).toBe(16)
    await backgrounds.commitConfig('asset:background', next)

    expect(backend.updateTokenBackgroundConfig).toHaveBeenCalledWith('background', 4, expect.objectContaining({ imageOffsetX: 16 }))
    expect(backgrounds.descriptor('asset:background')?.revision).toBe(5)
  })

  it('rejects backgrounds larger than the configured upload limit before importing', async () => {
    const editor = useEditorStore()
    const importSpy = vi.spyOn(editor, 'importAssetFile')
    const backgrounds = useTokenBackgroundStore()

    await expect(backgrounds.importBackground({
      size: appConfiguration.token.backgrounds.maxUploadBytes + 1,
    } as File)).rejects.toThrow('upload limit')

    expect(importSpy).not.toHaveBeenCalled()
  })
})
