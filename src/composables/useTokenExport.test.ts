import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultTokenExportSettings, createDefaultTokenVisualStyle } from '@/lib/token'
import { translate } from '@/i18n'
import { useTokenStore } from '@/stores/token'
import { useTokenExport } from './useTokenExport'

const tauri = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauri.invoke,
  Channel: class<T> { onmessage?: (message: T) => void },
}))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(async () => '/output') }))
vi.mock('vue-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function setup(paths = ['/a.png']) {
  const token = useTokenStore()
  const now = new Date(0).toISOString()
  token.document = {
    schemaVersion: 1, id: 'project', title: 'Token',
    items: paths.map((sourcePath, index) => ({
      id: `item-${index}`, name: `item-${index}.png`, mediaType: 'image/png', sourcePath,
      style: createDefaultTokenVisualStyle(),
    })),
    exportSettings: createDefaultTokenExportSettings(), createdAt: now, updatedAt: now,
  }
  token.selectedItemId = 'item-0'
  token.checkedItemIds = token.items.map((item) => item.id)
  return token
}

describe('useTokenExport', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('calibrates final progress from command results without a finished event', async () => {
    setup()
    tauri.invoke.mockResolvedValue([{ success: true, outputPath: '/output/a.png', error: null }])
    const subject = useTokenExport()

    const results = await subject.exportScope('all')

    expect(results).toHaveLength(1)
    expect(subject.progress).toMatchObject({ completed: 1, total: 1, successCount: 1, failureCount: 0, status: 'finished' })
  })

  it('reports a missing source as an explicit failed item', async () => {
    setup([''])
    const subject = useTokenExport()

    const results = await subject.exportScope('all')

    expect(tauri.invoke).not.toHaveBeenCalled()
    expect(results).toEqual([expect.objectContaining({
      success: false,
      error: translate('TOKEN_EXPORT_MISSING_SOURCE', { name: 'item-0.png' }),
    })])
    expect(subject.progress.failureCount).toBe(1)
  })

  it('keeps command errors inside observable state instead of rejecting the click handler', async () => {
    setup()
    tauri.invoke.mockRejectedValue(new Error('backend unavailable'))
    const subject = useTokenExport()

    await expect(subject.exportScope('all')).resolves.toEqual([
      expect.objectContaining({ success: false, error: expect.stringContaining('backend unavailable') }),
    ])
    expect(subject.progress.status).toBe('failed')
  })
})
