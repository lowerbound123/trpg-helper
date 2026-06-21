import type { Ref, Reactive } from 'vue'
import type { DirEntry } from 'vuefinder'

import type { LibraryRecord, ProjectSummary } from '@/lib/backend'
import { partitionUploadFiles, type UploadKind } from '@/lib/upload-validation'
import { useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type DebugLog = (message: string, data?: Record<string, unknown>) => void
type FinderRevision = Reactive<Record<'background' | 'asset' | 'font', number>>
type SelectedFinderItems = Reactive<Record<'handout' | 'background' | 'asset' | 'font', DirEntry[]>>

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
  createProjectFromBackground: (background: LibraryRecord) => Promise<void>
  logUpload: DebugLog
}) {
  const { editor, loadImage, imageRecordFromFinderEntry, projectFromFinderEntry, previewUrl, isHandoutExporting, exportHandoutProject, selectedFinderItems, finderRevision, selectedBackgroundFolder, selectedAssetFolder, selectedFontFolder, createProjectFromBackground, logUpload } = options

  async function uploadFiles(kind: UploadKind, files: FileList | File[], folder = '') {
    const fileArray = validUploadFiles(kind, Array.from(files))
    if (!fileArray.length) return []
    const imported: LibraryRecord[] = []
    for (const file of fileArray) {
      if (kind === 'background') imported.push(await editor.importBackgroundFile(file, '', folder))
      if (kind === 'asset') imported.push(await editor.importAssetFile(file, '', folder))
      if (kind === 'font') imported.push(await editor.importFontFile(file, '', folder))
    }
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
    })
    return imported
  }

  function validUploadFiles(kind: UploadKind, files: File[]) {
    const { accepted, rejected } = partitionUploadFiles(kind, files)
    if (rejected.length) {
      const names = rejected.map((file) => file.name).join(', ')
      editor.status = `Unsupported ${kind} file${rejected.length > 1 ? 's' : ''}: ${names}`
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
    if (editor.status !== `Drop ${kind} files to upload`) editor.status = `Drop ${kind} files to upload`
  }

  function selectedImageRecord(kind: 'background' | 'asset') {
    const selected = selectedFinderItems[kind]
    if (selected.length !== 1) return undefined
    return imageRecordFromFinderEntry(kind, selected[0])
  }

  function selectedImageStatus(kind: 'background' | 'asset') {
    const selected = selectedFinderItems[kind]
    if (selected.length === 0) return 'No image selected'
    if (selected.length > 1) return `${selected.length} items selected`
    const record = selectedImageRecord(kind)
    return record ? `Selected: ${record.name}` : 'Select an image file'
  }

  function fontPreviewSource(font: LibraryRecord) {
    return previewUrl(font)
  }

  function handleFinderSelect(kind: 'handout' | 'background' | 'asset' | 'font', items: DirEntry[]) {
    selectedFinderItems[kind] = items
  }

  async function handleCreateBackgroundInput(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    const [background] = await uploadFiles('background', [file], selectedBackgroundFolder.value)
    if (!background) return
    await createProjectFromBackground(background)
    ;(event.target as HTMLInputElement).value = ''
  }

  async function handleCreateBackgroundDrop(event: DragEvent) {
    event.preventDefault()
    const file = event.dataTransfer?.files?.[0]
    if (!file) return
    const [background] = await uploadFiles('background', [file], selectedBackgroundFolder.value)
    if (!background) return
    await createProjectFromBackground(background)
  }

  function selectedHandoutProject() {
    const selected = selectedFinderItems.handout
    if (selected.length !== 1) return undefined
    return projectFromFinderEntry(selected[0])
  }

  function selectedHandoutStatus() {
    const selected = selectedFinderItems.handout
    if (selected.length === 0) return 'No handout selected'
    if (selected.length > 1) return `${selected.length} items selected`
    const project = selectedHandoutProject()
    return project ? `Selected: ${project.title}` : 'Select a handout'
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
    handleCreateBackgroundInput,
    handleCreateBackgroundDrop,
    selectedHandoutProject,
    selectedHandoutStatus,
    isSelectedHandoutExporting,
    exportSelectedHandout,
  }
}
