import { openManagedProject, saveProjectPreview } from '@/lib/backend'
import { appConfiguration } from '@/lib/configuration'
import { dataUrlByteSize, renderHandoutPreviewToDataUrl } from '@/lib/render'
import { useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type ImageCache = Record<string, HTMLImageElement>
type PreviewLog = (message: string, data?: Record<string, unknown>) => void

export function useProjectPreviews(options: {
  editor: EditorStore
  imageElements: ImageCache
  logHandoutPreview: PreviewLog
  waitForIdleTask: () => Promise<void>
  maskFeatureEnabled: boolean
  editorMaskPreviewMaxEdge: number
  previewTargetBytes: number
}) {
  const { editor, imageElements, logHandoutPreview, waitForIdleTask, maskFeatureEnabled, editorMaskPreviewMaxEdge, previewTargetBytes } = options

  let previewMaintenanceRunning = false

  async function ensureProjectPreviews() {
    if (previewMaintenanceRunning) return
    previewMaintenanceRunning = true
    let generated = 0
    try {
      for (const project of editor.projects) {
        const shouldRegeneratePreview = !project.previewPath
          || !project.previewPath.endsWith('preview.webp')
          || Number(project.previewSizeBytes || 0) > previewTargetBytes
        if (!shouldRegeneratePreview) continue
        await waitForIdleTask()
        try {
          logHandoutPreview('generating preview', {
            projectId: project.id,
            title: project.title,
            currentPreviewPath: project.previewPath,
            currentPreviewSizeBytes: project.previewSizeBytes,
          })
          const payload = await openManagedProject(project.id)
          const dataUrl = await renderHandoutPreviewToDataUrl(payload.document, editor.library, imageElements, {
            projectTarget: { projectId: project.id },
            masksEnabled: maskFeatureEnabled,
            maxMaskEdge: editorMaskPreviewMaxEdge,
            maxCompositeEdge: editorMaskPreviewMaxEdge,
            usePixiMaskPreview: appConfiguration.mask.usePixiPreview,
          })
          const previewPath = await saveProjectPreview(project.id, dataUrl)
          generated += 1
          logHandoutPreview('saved preview', {
            projectId: project.id,
            previewPath,
            previewBytes: dataUrlByteSize(dataUrl),
          })
        } catch (error) {
          logHandoutPreview('failed to generate preview', {
            projectId: project.id,
            title: project.title,
            error,
          })
        }
      }
      if (generated > 0) {
        logHandoutPreview('preview generation complete', { generated })
        await editor.refreshProjects()
      }
    } finally {
      previewMaintenanceRunning = false
    }
  }

  return { ensureProjectPreviews }
}
