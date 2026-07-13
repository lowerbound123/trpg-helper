import { computed, type Ref } from 'vue'
import { contextMenuItems as defaultContextMenuItems, type DirEntry, type Driver, type FsData, type Item } from 'vuefinder'

import {
  fileUrl,
  copyTokenProject,
  moveTokenProject,
  renameTokenProject,
  renameTokenProjectFolder,
  type LibraryRecord,
  type ProjectSummary,
} from '@/lib/backend'
import type { TokenProjectSummary } from '@/lib/token'
import { useEditorStore } from '@/stores/editor'
import { useTokenStore } from '@/stores/token'

export type FinderKind = 'handout' | 'token' | 'background' | 'asset' | 'font'

export const finderFeatures = {
  archive: false,
  copy: false,
  delete: true,
  download: false,
  edit: false,
  fullscreen: false,
  history: false,
  language: false,
  move: true,
  newfile: false,
  newfolder: true,
  pinned: false,
  preview: true,
  rename: true,
  search: true,
  theme: false,
  unarchive: false,
  upload: false,
}

export function finderFeaturesForKind(kind: FinderKind) {
  return {
    ...finderFeatures,
    upload: kind !== 'handout' && kind !== 'token',
  }
}

type UseFinderOptions = {
  addAssetToCanvas: (asset: LibraryRecord) => void | Promise<void>
  createHandoutFromImageRecord: (kind: 'background' | 'asset', record: LibraryRecord) => void | Promise<void>
  cloneHandoutProject: (project: ProjectSummary) => void | Promise<void>
  exportHandoutProject: (project: ProjectSummary) => void | Promise<void>
  uploadFiles: (kind: 'background' | 'asset' | 'font', files: File[], folder: string) => unknown | Promise<unknown>
  previewUrl: (record: LibraryRecord) => string
  selectedFolders: {
    handout: Ref<string>
    token: Ref<string>
    background: Ref<string>
    asset: Ref<string>
    font: Ref<string>
  }
}

const finderStorages: Record<FinderKind, string> = {
  handout: 'handouts',
  token: 'tokens',
  background: 'backgrounds',
  asset: 'assets',
  font: 'fonts',
}

export function folderMatches(recordFolder: string | undefined, selectedFolder: string) {
  return (recordFolder || '') === selectedFolder
}

export function filterRecords(records: LibraryRecord[], queryText: string, selectedFolder: string) {
  const query = queryText.trim().toLowerCase()
  const scoped = records.filter((record) => folderMatches(record.folder, selectedFolder))
  if (!query) return scoped
  return scoped.filter((record) =>
    [record.name, ...record.tags].some((part) => part.toLowerCase().includes(query)),
  )
}

export function isImageFinderEntry(entry?: DirEntry | null) {
  return entry?.type === 'file' && Boolean(entry.mime_type?.startsWith('image/'))
}

export function normalizeFinderFolder(value?: string) {
  if (!value) return ''
  return value.replace(/^[^:]+:\/\//, '').replace(/^\/+|\/+$/g, '')
}

export function collectImageAssetsForFinderEntries(entries: DirEntry[], records: LibraryRecord[]) {
  const ids = new Set<string>()
  const folders: string[] = []
  for (const entry of entries) {
    if (entry.type === 'dir') {
      folders.push(normalizeFinderFolder(entry.path))
      continue
    }
    const id = normalizeFinderFolder(entry.path).split('/').at(-1)?.replace('__asset-', '')
    if (id) ids.add(id)
  }
  return records.filter((record) => {
    if (!record.mediaType.startsWith('image/')) return false
    if (ids.has(record.id)) return true
    const folder = normalizeFinderFolder(record.folder)
    return folders.some((candidate) => folder === candidate || folder.startsWith(`${candidate}/`))
  })
}

export function useFinderManagement(editor: ReturnType<typeof useEditorStore>, options: UseFinderOptions) {
  const tokenStore = useTokenStore()
  function foldersForKind(kind: 'background' | 'asset' | 'font') {
    if (kind === 'background') return editor.library.backgroundFolders
    if (kind === 'asset') return editor.library.assetFolders
    return editor.library.fontFolders
  }

  function projectPreviewUrl(project: { id?: string; title?: string; backgroundAssetId?: string | null; previewPath?: string | null }) {
    if (project.previewPath) {
      return fileUrl(project.previewPath)
    }
    const image = editor.resolveBackground(project.backgroundAssetId || undefined)
      || editor.resolveAsset(project.backgroundAssetId || undefined)
    return image ? options.previewUrl(image) : ''
  }

  function allFoldersForKind(kind: FinderKind) {
    if (kind === 'handout') return editor.projectFolders
    if (kind === 'token') return tokenStore.folders
    return foldersForKind(kind)
  }

  function selectedFolderForFinder(kind: FinderKind) {
    return options.selectedFolders[kind].value
  }

  function setSelectedFolderForFinder(kind: FinderKind, folder: string) {
    options.selectedFolders[kind].value = folder
  }

  function finderRoot(kind: FinderKind) {
    return `${finderStorages[kind]}://`
  }

  function finderPath(kind: FinderKind, folder = '', id?: string) {
    const root = finderRoot(kind)
    const normalized = normalizeFinderFolder(folder)
    const parts = normalized ? [normalized] : []
    if (id) parts.push(`__${kind}-${id}`)
    return `${root}${parts.join('/')}`
  }

  function finderParentPath(kind: FinderKind, folder = '') {
    const normalized = normalizeFinderFolder(folder)
    return normalized ? `${finderRoot(kind)}${normalized}` : finderRoot(kind)
  }

  function entryBase(path: string) {
    return normalizeFinderFolder(path).split('/').filter(Boolean).at(-1) || ''
  }

  function entryFolder(path: string) {
    const folder = normalizeFinderFolder(path)
    if (!folder) return ''
    return folder.split('/').slice(0, -1).join('/')
  }

  function extensionForName(name: string) {
    const extension = name.split('.').at(-1) || ''
    return extension === name ? '' : extension
  }

  function makeDirEntry(kind: FinderKind, parent: string, folderPath: string, basename: string): DirEntry {
    return {
      dir: finderParentPath(kind, parent),
      basename,
      extension: '',
      path: finderParentPath(kind, folderPath),
      storage: finderStorages[kind],
      type: 'dir',
      file_size: null,
      last_modified: null,
      mime_type: null,
      visibility: 'public',
    }
  }

  function makeFileEntry(
    kind: FinderKind,
    folder: string,
    id: string,
    name: string,
    mediaType: string,
    updatedAt: string,
    preview?: string,
  ): DirEntry {
    return {
      dir: finderParentPath(kind, folder),
      basename: name,
      extension: extensionForName(name),
      path: finderPath(kind, folder, id),
      storage: finderStorages[kind],
      type: 'file',
      file_size: null,
      last_modified: Date.parse(updatedAt) || null,
      mime_type: mediaType,
      visibility: 'public',
      previewUrl: preview,
    }
  }

  function finderFoldersAt(kind: FinderKind, currentFolder: string) {
    const seen = new Set<string>()
    return allFoldersForKind(kind)
      .map(normalizeFinderFolder)
      .filter(Boolean)
      .flatMap((folder) => {
        const parent = entryFolder(folder)
        if (parent !== currentFolder) return []
        const basename = entryBase(folder)
        if (seen.has(basename)) return []
        seen.add(basename)
        return [makeDirEntry(kind, currentFolder, folder, basename)]
      })
  }

  function recordsForKindWithoutSearch(kind: 'background' | 'asset' | 'font') {
    if (kind === 'background') return editor.library.backgrounds
    if (kind === 'asset') return editor.library.assets
    return editor.library.fonts
  }

  function finderFilesAt(kind: FinderKind, currentFolder: string) {
    if (kind === 'handout' || kind === 'token') {
      const projects = kind === 'handout' ? editor.latestProjects : tokenStore.projects
      return projects
        .filter((project: ProjectSummary | TokenProjectSummary) => folderMatches(project.folder, currentFolder))
        .map((project: ProjectSummary | TokenProjectSummary) =>
          makeFileEntry(
            kind,
            project.folder,
            project.id,
            project.title,
            'image/png',
            project.updatedAt,
            kind === 'handout' ? projectPreviewUrl(project) : fileUrl(project.previewPath),
          ),
        )
    }

    return recordsForKindWithoutSearch(kind)
      .filter((record) => folderMatches(record.folder, currentFolder))
      .map((record) =>
        makeFileEntry(
          kind,
          record.folder,
          record.id,
          record.name,
          kind === 'font' && record.thumbnailPath ? 'image/webp' : record.mediaType,
          record.updatedAt,
          options.previewUrl(record),
        ),
      )
  }

  function finderData(kind: FinderKind, path?: string): FsData {
    const folder = normalizeFinderFolder(path)
    return {
      storages: [finderStorages[kind]],
      dirname: finderParentPath(kind, folder),
      read_only: false,
      files: [...finderFoldersAt(kind, folder), ...finderFilesAt(kind, folder)],
    }
  }

  function finderResult(kind: FinderKind, path?: string) {
    const data = finderData(kind, path)
    return {
      ...data,
      read_only: Boolean(data.read_only),
    }
  }

  function idFromFinderPath(kind: FinderKind, path: string) {
    return entryBase(path).replace(`__${kind}-`, '')
  }

  function kindFromFinderPath(path: string): FinderKind | undefined {
    const storage = path.split('://')[0]
    return (Object.entries(finderStorages).find(([, value]) => value === storage)?.[0] as FinderKind | undefined)
  }

  function idFromFinderEntry(kind: FinderKind, entry: DirEntry) {
    return idFromFinderPath(kind, entry.path)
  }

  function recordFromFinderEntry(kind: 'background' | 'asset' | 'font', entry?: DirEntry | null) {
    if (!entry || entry.type !== 'file') return undefined
    const id = idFromFinderEntry(kind, entry)
    return recordsForKindWithoutSearch(kind).find((record) => record.id === id)
  }

  function assetRecordFromDragPath(path: string) {
    if (kindFromFinderPath(path) !== 'asset') return undefined
    const id = idFromFinderPath('asset', path)
    return editor.resolveAsset(id)
  }

  function fontRecordFromDragPath(path: string) {
    if (kindFromFinderPath(path) !== 'font') return undefined
    const id = idFromFinderPath('font', path)
    return editor.resolveFont(id)
  }

  function imageRecordFromFinderEntry(kind: 'background' | 'asset', entry?: DirEntry | null) {
    const record = recordFromFinderEntry(kind, entry)
    if (!record || !record.mediaType.startsWith('image/')) return undefined
    return record
  }

  function projectFromFinderEntry(entry?: DirEntry | null) {
    if (!entry || entry.type !== 'file') return undefined
    const id = idFromFinderEntry('handout', entry)
    return editor.projects.find((project) => project.id === id)
  }

  async function createFolderFromFinder(kind: FinderKind, parentPath: string, name: string) {
    const parent = normalizeFinderFolder(parentPath)
    const folder = [parent, name.trim()].filter(Boolean).join('/')
    if (kind === 'handout') await editor.addProjectFolder(folder)
    else if (kind === 'token') await tokenStore.addFolder(folder)
    else await editor.createResourceFolder(kind, folder)
  }

  async function renameFromFinder(kind: FinderKind, params: { path: string; item: string; name: string }) {
    const itemPath = params.item.includes('://')
      ? params.item
      : `${finderParentPath(kind, normalizeFinderFolder(params.path)).replace(/\/$/, '')}/${params.item}`
    const basename = entryBase(itemPath)
    if (basename.startsWith(`__${kind}-`)) {
      const id = idFromFinderPath(kind, itemPath)
      if (kind === 'handout') await editor.renameProject(id, params.name)
      else if (kind === 'token') {
        await renameTokenProject(id, params.name)
        await tokenStore.refreshProjects()
      }
      else await editor.renameResource(kind, id, params.name)
      return
    }

    const oldFolder = normalizeFinderFolder(itemPath)
    const newFolder = [entryFolder(oldFolder), params.name.trim()].filter(Boolean).join('/')
    if (kind === 'handout') await editor.renameProjectFolderPath(oldFolder, newFolder)
    else if (kind === 'token') {
      await renameTokenProjectFolder(oldFolder, newFolder)
      await tokenStore.refreshProjects()
    }
    else await editor.renameResourceFolder(kind, oldFolder, newFolder)
    if (selectedFolderForFinder(kind) === oldFolder) setSelectedFolderForFinder(kind, newFolder)
  }

  async function moveFromFinder(kind: FinderKind, params: { sources: string[]; destination: string }) {
    const destination = normalizeFinderFolder(params.destination)
    for (const source of params.sources) {
      const basename = entryBase(source)
      if (basename.startsWith(`__${kind}-`)) {
        const id = idFromFinderPath(kind, source)
        if (kind === 'handout') await editor.moveProjectToFolder(id, destination)
        else if (kind === 'token') {
          await moveTokenProject(id, destination)
          await tokenStore.refreshProjects()
        }
        else await editor.moveResourceToFolder(kind, id, destination)
        continue
      }

      const oldFolder = normalizeFinderFolder(source)
      const nextFolder = [destination, entryBase(oldFolder)].filter(Boolean).join('/')
      if (kind === 'handout') await editor.renameProjectFolderPath(oldFolder, nextFolder)
      else if (kind === 'token') {
        await renameTokenProjectFolder(oldFolder, nextFolder)
        await tokenStore.refreshProjects()
      }
      else await editor.renameResourceFolder(kind, oldFolder, nextFolder)
      if (selectedFolderForFinder(kind) === oldFolder) setSelectedFolderForFinder(kind, nextFolder)
    }
  }

  async function deleteFromFinder(kind: FinderKind, params: { items: { path: string; type: string }[] }) {
    const ids: string[] = []
    const folders: string[] = []
    for (const item of params.items) {
      const basename = entryBase(item.path)
      if (item.type === 'file' || basename.startsWith(`__${kind}-`)) {
        ids.push(idFromFinderPath(kind, item.path))
      } else {
        folders.push(normalizeFinderFolder(item.path))
      }
    }

    if (kind === 'handout') await editor.deleteProjectEntriesFromLibrary({ ids, folders })
    else if (kind === 'token') await tokenStore.deleteEntries({ ids, folders })
    else await editor.deleteResourceEntries(kind, { ids, folders })
    if (folders.some((folder) => folderIsOrDescendant(selectedFolderForFinder(kind), folder))) {
      setSelectedFolderForFinder(kind, '')
    }
  }

  function folderIsOrDescendant(value: string, folder: string) {
    return value === folder || value.startsWith(`${folder}/`)
  }

  function createFinderDriver(kind: FinderKind): Driver {
    const unsupported = async () => {
      throw new Error('This file operation is not supported in the handout library yet.')
    }

    return {
      configureUploader(uppy, context) {
        if (kind === 'handout' || kind === 'token') return
        uppy.addUploader(async (fileIDs: string[]) => {
          const files = fileIDs
            .map((id) => uppy.getFile(id))
            .filter(Boolean)
          const folder = normalizeFinderFolder(context.getTargetPath())
          await options.uploadFiles(kind, files.map((file) => file.data as File), folder)
          for (const file of files) {
            uppy.emit('upload-success', file, { status: 200, body: {} })
          }
          return {
            successful: fileIDs,
            failed: [],
          }
        })
      },
      async list(params) {
        return finderData(kind, params?.path)
      },
      async createFolder(params) {
        await createFolderFromFinder(kind, params.path, params.name)
        return finderResult(kind, params.path)
      },
      async rename(params) {
        await renameFromFinder(kind, params)
        return finderResult(kind, params.path)
      },
      async delete(params) {
        await deleteFromFinder(kind, params)
        return {
          ...finderResult(kind, params.path),
          deleted: params.items as DirEntry[],
        }
      },
      async copy() {
        return unsupported()
      },
      async move(params) {
        await moveFromFinder(kind, params)
        return finderResult(kind, params.destination || params.path)
      },
      async archive() {
        return unsupported()
      },
      async unarchive() {
        return unsupported()
      },
      async createFile() {
        return unsupported()
      },
      async getContent() {
        return { content: '' }
      },
      getPreviewUrl(params) {
        const id = idFromFinderPath(kind, params.path)
        if (kind === 'handout') {
          const project = editor.projects.find((item) => item.id === id)
          return project ? projectPreviewUrl(project) : ''
        }
        if (kind === 'token') {
          const project = tokenStore.projects.find((item) => item.id === id)
          return project ? fileUrl(project.previewPath) : ''
        }
        const record = recordsForKindWithoutSearch(kind).find((item) => item.id === id)
        return record ? options.previewUrl(record) : ''
      },
      getDownloadUrl() {
        return ''
      },
      async search(params) {
        const query = params.filter.trim().toLowerCase()
        return finderData(kind, params.path).files.filter((file) => file.basename.toLowerCase().includes(query))
      },
      async save() {
        return ''
      },
    }
  }

  const finderDrivers = computed<Record<FinderKind, Driver>>(() => ({
    handout: createFinderDriver('handout'),
    token: createFinderDriver('token'),
    background: createFinderDriver('background'),
    asset: createFinderDriver('asset'),
    font: createFinderDriver('font'),
  }))

  function createImageHandoutContextMenu(kind: 'background' | 'asset'): Item[] {
    let contextTarget: DirEntry | null = null
    const createItem: Item = {
      id: `create_${kind}_handout`,
      title: () => 'Create handout',
      order: 45,
      show(_app, context) {
        contextTarget = context.target
        return Boolean(contextTarget && isImageFinderEntry(contextTarget) && imageRecordFromFinderEntry(kind, contextTarget))
      },
      action(_app, selectedItems) {
        const entry = selectedItems.find((item) => isImageFinderEntry(item)) || contextTarget
        const record = imageRecordFromFinderEntry(kind, entry)
        if (record) void options.createHandoutFromImageRecord(kind, record)
      },
    }
    return [...defaultContextMenuItems, createItem]
  }

  const imageHandoutContextMenuItems = computed<Record<'background' | 'asset', Item[]>>(() => ({
    background: createImageHandoutContextMenu('background'),
    asset: createImageHandoutContextMenu('asset'),
  }))

  function createTokenAssetContextMenu(): Item[] {
    let contextTarget: DirEntry | null = null
    const addItem: Item = {
      id: 'add_assets_to_token_project',
      title: () => '添加到当前 Token 项目',
      order: 44,
      show(_app, context) {
        contextTarget = context.target
        return Boolean(tokenStore.document && contextTarget && (contextTarget.type === 'dir' || isImageFinderEntry(contextTarget)))
      },
      action(_app, selectedItems) {
        if (!contextTarget) return
        const targets = selectedItems.some((entry) => entry.path === contextTarget?.path)
          ? selectedItems
          : [contextTarget]
        const assets = collectImageAssetsForFinderEntries(targets, editor.library.assets)
        const added = tokenStore.addAssets(assets)
        tokenStore.status = `已添加 ${added} 个 Asset，跳过 ${Math.max(0, assets.length - added)} 个重复项`
      },
    }
    return [...defaultContextMenuItems, addItem]
  }

  const tokenAssetContextMenuItems = computed(() => createTokenAssetContextMenu())

  function createHandoutContextMenu(): Item[] {
    let contextTarget: DirEntry | null = null
    const exportItem: Item = {
      id: 'export_handout_png',
      title: () => 'Export PNG',
      order: 46,
      show(_app, context) {
        contextTarget = context.target
        return Boolean(projectFromFinderEntry(contextTarget))
      },
      action(_app, selectedItems) {
        const project = projectFromFinderEntry(selectedItems.find((item) => item.type === 'file')) || projectFromFinderEntry(contextTarget)
        if (project) void options.exportHandoutProject(project)
      },
    }
    const cloneItem: Item = {
      id: 'clone_handout',
      title: () => 'Clone handout',
      order: 45,
      show(_app, context) {
        contextTarget = context.target
        return Boolean(projectFromFinderEntry(contextTarget))
      },
      action(_app, selectedItems) {
        const project = projectFromFinderEntry(selectedItems.find((item) => item.type === 'file')) || projectFromFinderEntry(contextTarget)
        if (project) void options.cloneHandoutProject(project)
      },
    }
    return [...defaultContextMenuItems, cloneItem, exportItem]
  }

  const handoutContextMenuItems = computed(() => createHandoutContextMenu())

  function createTokenContextMenu(): Item[] {
    let contextTarget: DirEntry | null = null
    const cloneItem: Item = {
      id: 'clone_token_project',
      title: () => 'Clone token project',
      order: 45,
      show(_app, context) {
        contextTarget = context.target
        return Boolean(contextTarget?.type === 'file')
      },
      action(_app, selectedItems) {
        const entry = selectedItems.find((item) => item.type === 'file') || contextTarget
        if (!entry) return
        const id = idFromFinderEntry('token', entry)
        void copyTokenProject(id).then(() => tokenStore.refreshProjects())
      },
    }
    return [...defaultContextMenuItems, cloneItem]
  }

  const tokenContextMenuItems = computed(() => createTokenContextMenu())

  function handleFinderPathChange(kind: FinderKind, path: string) {
    setSelectedFolderForFinder(kind, normalizeFinderFolder(path))
  }

  function handleFinderFileDoubleClick(kind: FinderKind, event: { item: DirEntry; preventDefault: () => void }) {
    if (event.item.type !== 'file') return
    event.preventDefault()
    const id = idFromFinderPath(kind, event.item.path)
    if (kind === 'handout') void editor.openManagedHandout(id)
    if (kind === 'token') void tokenStore.open(id)
    if (kind === 'asset') {
      const asset = editor.resolveAsset(id)
      if (asset) void options.addAssetToCanvas(asset)
    }
  }

  return {
    finderDrivers,
    assetRecordFromDragPath,
    fontRecordFromDragPath,
    foldersForKind,
    handleFinderFileDoubleClick,
    handleFinderPathChange,
    handoutContextMenuItems,
    tokenContextMenuItems,
    tokenAssetContextMenuItems,
    imageHandoutContextMenuItems,
    imageRecordFromFinderEntry,
    projectPreviewUrl,
    projectFromFinderEntry,
    recordFromFinderEntry,
  }
}
