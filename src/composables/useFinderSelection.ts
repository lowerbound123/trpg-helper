import type { Ref, Reactive } from 'vue'
import type { DirEntry } from 'vuefinder'

import type { LibraryRecord, ProjectSummary } from '@/lib/backend'
import { partitionUploadFiles, type UploadKind } from '@/lib/upload-validation'
import { useEditorStore } from '@/stores/editor'
import { translate } from '@/i18n'

type EditorStore = ReturnType<typeof useEditorStore>
type DebugLog = (message: string, data?: Record<string, unknown>) => void
type FinderRevision = Reactive<Record<'background' | 'asset' | 'font', number>>
type SelectedFinderItems = Reactive<Record<'handout' | 'token' | 'background' | 'asset' | 'font', DirEntry[]>>

export function useFinderSelection(options: {
  editor: EditorStore
  loadImage: (record: LibraryRecord) => Promise<HTMLImageElement>
  partitionUploadFiles: typeof partitionUploadFiles
  imageRecordFromFinderEntry: (kind: 'background' | 'asset', entry: DirEntry) => LibraryRecord | undefined
  projectFromFinderEntry: (entry: DirEntry) => ProjectSummary | undefined
  previewUrl: (record: LibraryRecord) => string | undefined
  isHandoutExporting: (id?: string) => boolean
  exportHandoutProject: (project: ProjectSummary) => Promise<void>
  selectedFinderItems: SelectedFinderItems
  finderRevision: FinderRevision
  selectedBackgroundFolder: Ref<string>
  selectedAssetFolder: Ref<string>
  selectedFontFolder: Ref<string>
  logUpload: DebugLog
}) {
  const { editor, loadImage, imageRecordFromFinderEntry, projectFromFinderEntry, previewUrl, isHandoutExporting, exportHandoutProject, selectedFinderItems, finderRevision, selectedBackgroundFolder, selectedAssetFolder, selectedFontFolder, logUpload } = options

  async function uploadFiles(kind: UploadKind, files: FileList | File[], folder = '') {
    const fileArray = validUploadFiles(kind, Array.from(files))
    if (!fileArray.length) return { results: [], library: editor.library }
    const result = await editor.importFiles(kind, fileArray, folder)
    const imported = result.results.flatMap((item) => item.record ? [item.record] : [])
    await Promise.allSettled(
      imported
        .filter((record) => record.mediaType.startsWith('image/'))
        .map((record) => loadImage(record)),
    )
    finderRevision[kind] += 1
    logUpload('uploaded files', {
      kind, folder,
      files: fileArray.map((file) => ({ name: file.name, type: file.type, size: file.size })),
      imported: imported.map((record) => ({ id: record.id, name: record.name, path: record.path })),
      failed: result.results.filter((item) => item.error).map((item) => ({ fileName: item.fileName, error: item.error })),
    })
    return result
  }

  function validUploadFiles(kind: UploadKind, files: File[]) {
    const { accepted, rejected } = partitionUploadFiles(kind, files)
    if (rejected.length) {
      const names = rejected.map((file) => file.name).join(', ')
      editor.status = translate('UNSUPPORTED_UPLOAD_FILES', { kind, names })
      logUpload('rejected unsupported files', {
        kind,
        files: rejected.map((file) => ({ name: file.name, type: file.type, size: file.size })),
      })
    }
    return accepted
  }

  async function handleDirectFinderDrop(kind: UploadKind, event: DragEvent) {
    const files = Array.from(event.dataTransfer?.files || [])
    if (!files.length) return
    event.preventDefault()
    event.stopPropagation()
    const folder = kind === 'background'
      ? selectedBackgroundFolder.value
      : kind === 'asset'
        ? selectedAssetFolder.value
        : selectedFontFolder.value
    await uploadFiles(kind, files, folder)
  }

  function handleDirectFinderDragover(kind: UploadKind, event: DragEvent) {
    if (!event.dataTransfer?.types.includes('Files')) return
    event.dataTransfer.dropEffect = 'copy'
    event.dataTransfer.effectAllowed = 'copy'
    event.preventDefault()
    event.stopPropagation()
    const status = translate('UPLOAD_DROP_PROMPT', { kind })
    if (editor.status !== status) editor.status = status
  }

  function selectedImageRecord(kind: 'background' | 'asset') {
    const selected = selectedFinderItems[kind]
    if (selected.length !== 1) return undefined
    return imageRecordFromFinderEntry(kind, selected[0])
  }

  function selectedImageStatus(kind: 'background' | 'asset') {
    const selected = selectedFinderItems[kind]
    if (selected.length === 0) return translate('NO_IMAGE_SELECTED')
    if (selected.length > 1) return translate('SELECTED_ITEMS_COUNT', { count: selected.length })
    const record = selectedImageRecord(kind)
    return record ? translate('SELECTED_ITEM', { name: record.name }) : translate('SELECT_AN_IMAGE_FILE')
  }

  function fontPreviewSource(font: LibraryRecord) {
    return previewUrl(font)
  }

  function handleFinderSelect(kind: 'handout' | 'token' | 'background' | 'asset' | 'font', items: DirEntry[]) {
    selectedFinderItems[kind] = items
  }

  function selectedHandoutProject() {
    const selected = selectedFinderItems.handout
    if (selected.length !== 1) return undefined
    return projectFromFinderEntry(selected[0])
  }

  function selectedHandoutStatus() {
    const selected = selectedFinderItems.handout
    if (selected.length === 0) return translate('NO_HANDOUT_SELECTED')
    if (selected.length > 1) return translate('SELECTED_ITEMS_COUNT', { count: selected.length })
    const project = selectedHandoutProject()
    return project ? translate('SELECTED_ITEM', { name: project.title }) : translate('SELECT_A_HANDOUT')
  }

  function isSelectedHandoutExporting() {
    const project = selectedHandoutProject()
    return isHandoutExporting(project?.id)
  }

  async function exportSelectedHandout() {
    const project = selectedHandoutProject()
    if (!project) return
    await exportHandoutProject(project)
  }

  return {
    uploadFiles,
    validUploadFiles,
    handleDirectFinderDrop,
    handleDirectFinderDragover,
    selectedImageRecord,
    selectedImageStatus,
    fontPreviewSource,
    handleFinderSelect,
    selectedHandoutProject,
    selectedHandoutStatus,
    isSelectedHandoutExporting,
    exportSelectedHandout,
  }
}
