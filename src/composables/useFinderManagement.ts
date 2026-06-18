import { computed, type Ref } from 'vue'
import type { DirEntry, Driver, FsData } from 'vuefinder'

import type { LibraryRecord, ProjectSummary } from '@/lib/backend'
import { useEditorStore } from '@/stores/editor'

export type FinderKind = 'handout' | 'background' | 'asset' | 'font'

export const finderFeatures = {
  archive: false,
  copy: false,
  delete: false,
  download: false,
  edit: false,
  fullscreen: false,
  history: false,
  language: false,
  move: false,
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

type UseFinderOptions = {
  addAssetToCanvas: (asset: LibraryRecord) => void | Promise<void>
  previewUrl: (record: LibraryRecord) => string
  selectedFolders: {
    handout: Ref<string>
    background: Ref<string>
    asset: Ref<string>
    font: Ref<string>
  }
}

const finderStorages: Record<FinderKind, string> = {
  handout: 'handouts',
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

export function useFinderManagement(editor: ReturnType<typeof useEditorStore>, options: UseFinderOptions) {
  function foldersForKind(kind: 'background' | 'asset' | 'font') {
    if (kind === 'background') return editor.library.backgroundFolders
    if (kind === 'asset') return editor.library.assetFolders
    return editor.library.fontFolders
  }

  function projectPreviewUrl(project: { backgroundAssetId?: string | null }) {
    const background = editor.resolveBackground(project.backgroundAssetId || undefined)
    return background ? options.previewUrl(background) : ''
  }

  function allFoldersForKind(kind: FinderKind) {
    if (kind === 'handout') return editor.projectFolders
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

  function normalizeFinderFolder(value?: string) {
    if (!value) return ''
    return value.replace(/^[^:]+:\/\//, '').replace(/^\/+|\/+$/g, '')
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

  function recordsForKindWithoutSearch(kind: Exclude<FinderKind, 'handout'>) {
    if (kind === 'background') return editor.library.backgrounds
    if (kind === 'asset') return editor.library.assets
    return editor.library.fonts
  }

  function finderFilesAt(kind: FinderKind, currentFolder: string) {
    if (kind === 'handout') {
      return editor.latestProjects
        .filter((project: ProjectSummary) => folderMatches(project.folder, currentFolder))
        .map((project: ProjectSummary) =>
          makeFileEntry(
            kind,
            project.folder,
            project.id,
            project.title,
            'application/x-handout-project',
            project.updatedAt,
            projectPreviewUrl(project),
          ),
        )
    }

    return recordsForKindWithoutSearch(kind)
      .filter((record) => folderMatches(record.folder, currentFolder))
      .map((record) =>
        makeFileEntry(kind, record.folder, record.id, record.name, record.mediaType, record.updatedAt, options.previewUrl(record)),
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

  async function createFolderFromFinder(kind: FinderKind, parentPath: string, name: string) {
    const parent = normalizeFinderFolder(parentPath)
    const folder = [parent, name.trim()].filter(Boolean).join('/')
    if (kind === 'handout') await editor.addProjectFolder(folder)
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
      else await editor.renameResource(kind, id, params.name)
      return
    }

    const oldFolder = normalizeFinderFolder(itemPath)
    const newFolder = [entryFolder(oldFolder), params.name.trim()].filter(Boolean).join('/')
    if (kind === 'handout') await editor.renameProjectFolderPath(oldFolder, newFolder)
    else await editor.renameResourceFolder(kind, oldFolder, newFolder)
    if (selectedFolderForFinder(kind) === oldFolder) setSelectedFolderForFinder(kind, newFolder)
  }

  function createFinderDriver(kind: FinderKind): Driver {
    const unsupported = async () => {
      throw new Error('This file operation is not supported in the handout library yet.')
    }

    return {
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
      async delete() {
        return unsupported()
      },
      async copy() {
        return unsupported()
      },
      async move() {
        return unsupported()
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
          return projectPreviewUrl({ backgroundAssetId: editor.projects.find((project) => project.id === id)?.backgroundAssetId })
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
    background: createFinderDriver('background'),
    asset: createFinderDriver('asset'),
    font: createFinderDriver('font'),
  }))

  function handleFinderPathChange(kind: FinderKind, path: string) {
    setSelectedFolderForFinder(kind, normalizeFinderFolder(path))
  }

  function handleFinderFileDoubleClick(kind: FinderKind, event: { item: DirEntry; preventDefault: () => void }) {
    if (event.item.type !== 'file') return
    event.preventDefault()
    const id = idFromFinderPath(kind, event.item.path)
    if (kind === 'handout') void editor.openManagedHandout(id)
    if (kind === 'asset') {
      const asset = editor.resolveAsset(id)
      if (asset) void options.addAssetToCanvas(asset)
    }
  }

  return {
    finderDrivers,
    foldersForKind,
    handleFinderFileDoubleClick,
    handleFinderPathChange,
    projectPreviewUrl,
  }
}
