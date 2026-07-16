import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultTokenExportSettings, createDefaultTokenVisualStyle } from '@/lib/token'
import { useTokenStore } from './token'

const backend = vi.hoisted(() => ({
  createTokenProject: vi.fn(),
  listTokenProjects: vi.fn(async () => []),
  listTokenProjectFolders: vi.fn(async () => []),
  createTokenProjectFolder: vi.fn(async () => []),
  openTokenProject: vi.fn(),
  saveTokenProject: vi.fn(),
  renameTokenProject: vi.fn(),
  deleteTokenProjectEntries: vi.fn(async () => []),
}))

vi.mock('@/lib/backend', () => backend)

const asset = (id: string, name = `${id}.png`) => ({
  id,
  name,
  fileName: name,
  path: `/assets/${name}`,
  tags: [],
  folder: '',
  mediaType: 'image/png',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
})

describe('token project store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    backend.listTokenProjects.mockResolvedValue([])
    backend.listTokenProjectFolders.mockResolvedValue([])
  })

  it('creates one batch project from all selected image assets', async () => {
    backend.createTokenProject.mockImplementation(async (document) => ({
      document: { ...document, id: 'project-1' },
      metadata: { id: 'project-1' },
      resolvedSources: Object.fromEntries(document.items.map((item: { id: string; sourcePath: string }) => [item.id, item.sourcePath])),
    }))
    const store = useTokenStore()

    await store.createFromAssets([asset('a'), asset('b'), { ...asset('text'), mediaType: 'text/plain' }])

    expect(backend.createTokenProject).toHaveBeenCalledTimes(1)
    expect(store.document?.items.map((item) => item.assetId)).toEqual(['a', 'b'])
    expect(store.document?.title).toMatch(/^未命名项目-\d{8}-\d{6}$/)
  })

  it('keeps item styles isolated and groups a continuous slider edit into history', () => {
    const store = useTokenStore()
    const first = { ...asset('a'), style: undefined }
    const now = new Date().toISOString()
    store.document = {
      schemaVersion: 1,
      id: 'project',
      title: 'Token',
      items: [
        { id: 'one', assetId: first.id, name: first.name, mediaType: first.mediaType, sourcePath: first.path, style: { scale: 100, offsetX: 0, offsetY: 0, background: '#000000FF', ringInnerRadius: 225, ringOuterRadius: 250, ringColor: '#FFFFFFFF', ringStyle: 'solid', ringStretchX: 1, ringStretchY: 1, splitRing: false, splitAngle: 0, splitHeight: 0 } },
        { id: 'two', assetId: 'b', name: 'b.png', mediaType: 'image/png', sourcePath: '/assets/b.png', style: { scale: 100, offsetX: 0, offsetY: 0, background: '#000000FF', ringInnerRadius: 225, ringOuterRadius: 250, ringColor: '#FFFFFFFF', ringStyle: 'solid', ringStretchX: 1, ringStretchY: 1, splitRing: false, splitAngle: 0, splitHeight: 0 } },
      ],
      exportSettings: createDefaultTokenExportSettings(),
      createdAt: now,
      updatedAt: now,
    }
    store.selectedItemId = 'one'

    store.beginEdit()
    store.updateVisualStyle('scale', 120)
    store.updateVisualStyle('scale', 140)
    store.commitEdit()

    expect(store.items[0]?.style.scale).toBe(140)
    expect(store.items[1]?.style.scale).toBe(100)
    expect(store.canUndo).toBe(true)
  })

  it('preserves the current item and checked selection after saving', async () => {
    const store = useTokenStore()
    const now = new Date().toISOString()
    const document = {
      schemaVersion: 1 as const,
      id: 'project',
      title: 'Token',
      items: [
        { id: 'one', assetId: 'a', name: 'a.png', mediaType: 'image/png', sourcePath: '/assets/a.png', style: { scale: 100, offsetX: 0, offsetY: 0, background: '#000000FF', ringInnerRadius: 225, ringOuterRadius: 250, ringColor: '#FFFFFFFF', ringStyle: 'solid', ringStretchX: 1, ringStretchY: 1, splitRing: false, splitAngle: 0, splitHeight: 0 } },
        { id: 'two', assetId: 'b', name: 'b.png', mediaType: 'image/png', sourcePath: '/assets/b.png', style: { scale: 100, offsetX: 0, offsetY: 0, background: '#000000FF', ringInnerRadius: 225, ringOuterRadius: 250, ringColor: '#FFFFFFFF', ringStyle: 'solid', ringStretchX: 1, ringStretchY: 1, splitRing: false, splitAngle: 0, splitHeight: 0 } },
      ],
      exportSettings: createDefaultTokenExportSettings(),
      createdAt: now,
      updatedAt: now,
    }
    store.document = document
    store.selectedItemId = 'two'
    store.checkedItemIds = ['two']
    backend.saveTokenProject.mockResolvedValue({
      document,
      metadata: { id: 'project' },
      resolvedSources: { one: '/assets/a.png', two: '/assets/b.png' },
    })

    await store.save()

    expect(store.selectedItemId).toBe('two')
    expect(store.checkedItemIds).toEqual(['two'])
  })

  it('preserves undo history after saving', async () => {
    const store = useTokenStore()
    const now = new Date().toISOString()
    const document = {
      schemaVersion: 1 as const,
      id: 'project', title: 'Token',
      items: [{ id: 'one', name: 'a.png', mediaType: 'image/png', sourcePath: '/a.png', style: createDefaultTokenVisualStyle() }],
      exportSettings: createDefaultTokenExportSettings(), createdAt: now, updatedAt: now,
    }
    store.document = document
    store.selectedItemId = 'one'
    store.beginEdit()
    store.updateVisualStyle('scale', 150)
    store.commitEdit()
    backend.saveTokenProject.mockResolvedValue({ document, metadata: {}, resolvedSources: { one: '/a.png' } })

    await store.save()
    store.undo()

    expect(store.selectedItem?.style.scale).toBe(100)
  })

  it('restores structural selection and runtime sources on undo', () => {
    const store = useTokenStore()
    const now = new Date().toISOString()
    store.document = {
      schemaVersion: 1, id: 'project', title: 'Token', items: [],
      exportSettings: createDefaultTokenExportSettings(), createdAt: now, updatedAt: now,
    }
    store.addAssets([asset('a')])
    const addedId = store.items[0]!.id
    expect(store.resolvedSources[addedId]).toBe('/assets/a.png')

    store.undo()
    expect(store.items).toEqual([])
    expect(store.selectedItemId).toBeUndefined()
    expect(store.checkedItemIds).toEqual([])
    expect(store.resolvedSources).toEqual({})
  })

  it('renames the current project without replacing unsaved item edits', async () => {
    const store = useTokenStore()
    const now = new Date().toISOString()
    store.document = {
      schemaVersion: 1, id: 'project', title: 'Old', items: [{
        id: 'one', name: 'a.png', mediaType: 'image/png', sourcePath: '/a.png',
        style: { ...createDefaultTokenVisualStyle(), scale: 177 },
      }], exportSettings: createDefaultTokenExportSettings(), createdAt: now, updatedAt: now,
    }
    backend.renameTokenProject.mockResolvedValue({ document: { ...store.document, title: 'New' }, metadata: {}, resolvedSources: {} })

    await store.renameCurrentProject(' New ')

    expect(store.document.title).toBe('New')
    expect(store.document.items[0].style.scale).toBe(177)
  })

  it('groups select-all, clear, reset style and missing-ring repair as store operations', () => {
    const store = useTokenStore()
    const now = new Date().toISOString()
    store.document = {
      schemaVersion: 1,
      id: 'project',
      title: 'Token',
      items: [
        { id: 'one', assetId: 'a', name: 'a.png', mediaType: 'image/png', sourcePath: '/assets/a.png', style: { scale: 180, offsetX: 10, offsetY: 0, background: '#000000FF', ringInnerRadius: 225, ringOuterRadius: 250, ringColor: '#FFFFFFFF', ringStyle: 'asset:missing', ringStretchX: 1, ringStretchY: 1, splitRing: false, splitAngle: 0, splitHeight: 0 } },
        { id: 'two', assetId: 'b', name: 'b.png', mediaType: 'image/png', sourcePath: '/assets/b.png', style: { scale: 100, offsetX: 0, offsetY: 0, background: '#000000FF', ringInnerRadius: 225, ringOuterRadius: 250, ringColor: '#FFFFFFFF', ringStyle: 'solid', ringStretchX: 1, ringStretchY: 1, splitRing: false, splitAngle: 0, splitHeight: 0 } },
      ],
      exportSettings: createDefaultTokenExportSettings(),
      createdAt: now,
      updatedAt: now,
    }
    store.selectedItemId = 'one'

    store.toggleAllChecked()
    expect(store.checkedItemIds).toEqual(['one', 'two'])
    store.toggleAllChecked()
    expect(store.checkedItemIds).toEqual([])

    expect(store.replaceMissingRingReferences(new Set(['solid']))).toBe(1)
    expect(store.items[0]?.style.ringStyle).toBe('solid')

    store.resetSelectedStyle()
    expect(store.items[0]?.style.scale).toBe(100)
    expect(store.canUndo).toBe(true)

    store.clearItems()
    expect(store.items).toEqual([])
    expect(store.selectedItemId).toBeUndefined()
  })
})
