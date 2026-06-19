import { ref, reactive } from 'vue'

import {
  exportImageToDownloads,
  openManagedProject,
  type LibraryRecord,
  type ProjectSummary,
} from '@/lib/backend'
import { appConfiguration } from '@/lib/configuration'
import { exportExtension, exportMimeType, exportQualityValue, type ExportFormat } from '@/lib/export-options'
import type { HandoutDocument } from '@/lib/handout'
import { dataUrlByteSize, downloadFileName, renderHandoutToDataUrl } from '@/lib/render'
import { isImageLayer, useEditorStore } from '@/stores/editor'
import { useExportProgress } from './useExportProgress'

type EditorStore = ReturnType<typeof useEditorStore>
type ImageCache = Record<string, HTMLImageElement>
type ExportLog = (message: string, data?: Record<string, unknown>) => void

export function useHandoutExport(options: {
  editor: EditorStore
  imageElements: ImageCache
  loadImage: (record: LibraryRecord) => Promise<HTMLImageElement>
  logExport: ExportLog
}) {
  const exportScale = ref(appConfiguration.export.defaultScale)
  const exportFormat = ref<ExportFormat>('png')
  const exportQuality = ref(90)
  const exportLog = ref('')
  const isExportingCurrent = ref(false)
  const exportingHandoutIds = reactive(new Set<string>())
  const lastCurrentExport = ref<{ signature: string; path: string }>()
  const lastHandoutExports = reactive(new Map<string, { signature: string; path: string }>())
  const {
    exportProgress,
    prepareExportProgress,
    setExportProgress,
    finishExportProgress,
    cleanupExportProgress,
  } = useExportProgress()

  async function ensureDocumentImages(document: HandoutDocument) {
    const records = [
      options.editor.resolveBackground(document.canvas.backgroundAssetId) || options.editor.resolveAsset(document.canvas.backgroundAssetId),
      ...document.layers
        .filter(isImageLayer)
        .map((layer) => options.editor.resolveAsset(layer.assetId) || options.editor.resolveBackground(layer.assetId)),
    ].filter(Boolean) as LibraryRecord[]
    await Promise.allSettled(records.map((record) => options.loadImage(record)))
  }

  async function exportCurrentImage() {
    if (isExportingCurrent.value) return
    const clickedAt = performance.now()
    isExportingCurrent.value = true
    exportProgress.value = 1
    exportLog.value = 'Preparing export...'
    await prepareExportProgress()
    const clickToProgressMs = Math.round(performance.now() - clickedAt)
    options.logExport('export current start', {
      title: options.editor.document.title,
      scale: exportScale.value,
      format: exportFormat.value,
      quality: exportQuality.value,
      clickToProgressMs,
    })
    try {
      exportLog.value = 'Checking export changes...'
      await setExportProgress(8)
      const signatureStartedAt = performance.now()
      const signature = JSON.stringify({
        document: options.editor.document,
        scale: exportScale.value,
        format: exportFormat.value,
        quality: exportQuality.value,
      })
      const signatureMs = Math.round(performance.now() - signatureStartedAt)
      if (lastCurrentExport.value?.signature === signature) {
        exportLog.value = `Unchanged image already exported to ${lastCurrentExport.value.path}`
        options.logExport('export current unchanged', { signatureMs, clickToProgressMs, path: lastCurrentExport.value.path })
        finishExportProgress(true)
        return
      }
      exportLog.value = 'Loading export images...'
      await setExportProgress(18)
      const imageLoadStartedAt = performance.now()
      await ensureDocumentImages(options.editor.document)
      const imageLoadMs = Math.round(performance.now() - imageLoadStartedAt)
      exportLog.value = 'Rendering export image...'
      await setExportProgress(42)
      const renderStartedAt = performance.now()
      const dataUrl = await renderHandoutToDataUrl(
        options.editor.document,
        options.editor.library,
        exportScale.value,
        options.imageElements,
        exportMimeType(exportFormat.value),
        exportQualityValue(exportFormat.value, exportQuality.value),
      )
      const konvaRenderMs = Math.round(performance.now() - renderStartedAt)
      options.logExport('export current render complete', { signatureMs, imageLoadMs, konvaRenderMs, bytes: dataUrlByteSize(dataUrl) })
      exportLog.value = `Writing ${exportFormat.value.toUpperCase()} to Downloads...`
      await setExportProgress(86)
      const writeStartedAt = performance.now()
      const path = await exportImageToDownloads(downloadFileName(options.editor.document.title, new Date(), exportExtension(exportFormat.value)), dataUrl)
      const writeMs = Math.round(performance.now() - writeStartedAt)
      lastCurrentExport.value = { signature, path }
      exportLog.value = `Exported image to ${path}`
      options.logExport('export current complete', {
        path,
        bytes: dataUrlByteSize(dataUrl),
        clickToProgressMs,
        signatureMs,
        imageLoadMs,
        konvaRenderMs,
        writeMs,
      })
      finishExportProgress(true)
    } catch (error) {
      exportLog.value = `Export failed: ${String(error)}`
      options.logExport('export current failed', { error })
      finishExportProgress(false)
    } finally {
      isExportingCurrent.value = false
    }
  }

  async function exportHandoutProject(project: ProjectSummary) {
    if (exportingHandoutIds.has(project.id)) return
    const clickedAt = performance.now()
    exportingHandoutIds.add(project.id)
    await prepareExportProgress()
    exportLog.value = 'Preparing export...'
    const clickToProgressMs = Math.round(performance.now() - clickedAt)
    options.logExport('export handout start', { projectId: project.id, title: project.title, clickToProgressMs })
    try {
      const signatureStartedAt = performance.now()
      const signature = `${project.id}:${project.updatedAt}:1`
      const lastExport = lastHandoutExports.get(project.id)
      const signatureMs = Math.round(performance.now() - signatureStartedAt)
      if (lastExport?.signature === signature) {
        exportLog.value = `Unchanged image already exported to ${lastExport.path}`
        options.logExport('export handout unchanged', { projectId: project.id, signatureMs, clickToProgressMs, path: lastExport.path })
        finishExportProgress(false)
        return
      }
      const openStartedAt = performance.now()
      const payload = await openManagedProject(project.id)
      const openDurationMs = Math.round(performance.now() - openStartedAt)
      const imageLoadStartedAt = performance.now()
      await ensureDocumentImages(payload.document)
      const imageLoadMs = Math.round(performance.now() - imageLoadStartedAt)
      const renderStartedAt = performance.now()
      const dataUrl = await renderHandoutToDataUrl(payload.document, options.editor.library, 1, options.imageElements)
      const konvaRenderMs = Math.round(performance.now() - renderStartedAt)
      options.logExport('export handout render complete', {
        projectId: project.id,
        openDurationMs,
        signatureMs,
        imageLoadMs,
        konvaRenderMs,
        bytes: dataUrlByteSize(dataUrl),
      })
      const writeStartedAt = performance.now()
      const path = await exportImageToDownloads(downloadFileName(payload.document.title), dataUrl)
      const writeMs = Math.round(performance.now() - writeStartedAt)
      lastHandoutExports.set(project.id, { signature, path })
      exportLog.value = `Exported image to ${path}`
      options.logExport('export handout complete', {
        projectId: project.id,
        path,
        bytes: dataUrlByteSize(dataUrl),
        clickToProgressMs,
        openDurationMs,
        signatureMs,
        imageLoadMs,
        konvaRenderMs,
        writeMs,
      })
      finishExportProgress(true)
    } catch (error) {
      exportLog.value = `Export failed: ${String(error)}`
      options.logExport('export handout failed', { projectId: project.id, error })
      finishExportProgress(false)
    } finally {
      exportingHandoutIds.delete(project.id)
    }
  }

  function isHandoutExporting(projectId?: string) {
    return Boolean(projectId && exportingHandoutIds.has(projectId))
  }

  return {
    exportScale,
    exportFormat,
    exportQuality,
    exportLog,
    exportProgress,
    isExportingCurrent,
    exportCurrentImage,
    exportHandoutProject,
    isHandoutExporting,
    cleanupExportProgress,
  }
}
