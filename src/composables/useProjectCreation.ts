import type { Ref } from 'vue'

import type { LibraryRecord, ProjectSummary } from '@/lib/backend'
import { saveProjectWithPreview } from '@/app/useAppPersistence'
import { useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type ImageCache = Record<string, HTMLImageElement>
type DebugLog = (message: string, data?: Record<string, unknown>) => void

export function useProjectCreation(options: {
  editor: EditorStore
  imageElements: ImageCache
  imageSize: (record: LibraryRecord) => Promise<{ width: number; height: number }>
  selectedProjectFolder: Ref<string>
  selectedImageRecord: (kind: 'background' | 'asset') => LibraryRecord | undefined
  editorMaskPreviewMaxEdge: number
  logHandoutPreview: DebugLog
}) {
  const { editor, imageElements, imageSize, selectedProjectFolder, selectedImageRecord, editorMaskPreviewMaxEdge, logHandoutPreview } = options

  function handoutTitleFromRecord(record: LibraryRecord) {
    const name = record.name || record.fileName || 'Untitled handout'
    return name.replace(/\.[^.]+$/, '') || name
  }

  async function createHandoutFromImageRecord(_kind: 'background' | 'asset', record: LibraryRecord) {
    const size = await imageSize(record)
    await editor.createManagedHandout(handoutTitleFromRecord(record), {
      width: size.width,
      height: size.height,
      backgroundId: record.id,
      folder: selectedProjectFolder.value,
    })
  }

  async function createHandoutFromFinderImage(kind: 'background' | 'asset') {
    const record = selectedImageRecord(kind)
    if (!record) return
    await createHandoutFromImageRecord(kind, record)
  }

  async function saveProject() {
    await saveProjectWithPreview({
      editor,
      imageElements,
      maxMaskEdge: editorMaskPreviewMaxEdge,
      maxCompositeEdge: editorMaskPreviewMaxEdge,
      logPreview: logHandoutPreview,
    })
  }

  async function cloneHandoutProject(project: ProjectSummary) {
    await editor.cloneManagedHandout(project.id)
  }

  return {
    handoutTitleFromRecord,
    createHandoutFromImageRecord,
    createHandoutFromFinderImage,
    saveProject,
    cloneHandoutProject,
  }
}
