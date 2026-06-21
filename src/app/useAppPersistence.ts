import type { LibraryIndex } from '@/lib/backend'
import { saveProjectPreview } from '@/lib/backend'
import { appConfiguration } from '@/lib/configuration'
import type { HandoutDocument } from '@/lib/handout'
import { dataUrlByteSize, renderHandoutPreviewToDataUrl } from '@/lib/render'

type EditorPersistenceState = {
  currentProjectId?: string
  projectDir: string
  document: HandoutDocument
  library: LibraryIndex
  maskDataUrls: Record<string, string>
  saveCurrentProject: () => Promise<boolean>
  refreshProjects: () => Promise<void>
}

export type SaveProjectWithPreviewOptions = {
  editor: EditorPersistenceState
  imageElements: Record<string, HTMLImageElement>
  maxMaskEdge: number
  maxCompositeEdge: number
  logPreview: (message: string, data?: Record<string, unknown>) => void
}

export async function saveProjectWithPreview(options: SaveProjectWithPreviewOptions) {
  const saved = await options.editor.saveCurrentProject()
  if (!saved || !options.editor.currentProjectId) return saved

  options.logPreview('rendering preview after save', {
    projectId: options.editor.currentProjectId,
    title: options.editor.document.title,
    canvas: options.editor.document.canvas,
    layers: options.editor.document.layers.length,
  })
  const dataUrl = await renderHandoutPreviewToDataUrl(
    options.editor.document,
    options.editor.library,
    options.imageElements,
    {
      projectTarget: {
        projectId: options.editor.currentProjectId,
        projectDir: options.editor.projectDir || undefined,
      },
      maskDataUrls: options.editor.maskDataUrls,
      maxMaskEdge: options.maxMaskEdge,
      maxCompositeEdge: options.maxCompositeEdge,
      masksEnabled: appConfiguration.mask.enabled,
      usePixiMaskPreview: appConfiguration.mask.usePixiPreview,
    },
  )
  const previewPath = await saveProjectPreview(options.editor.currentProjectId, dataUrl)
  options.logPreview('saved preview after save', {
    projectId: options.editor.currentProjectId,
    previewPath,
    dataUrlLength: dataUrl.length,
    previewBytes: dataUrlByteSize(dataUrl),
  })
  await options.editor.refreshProjects()
  return saved
}
