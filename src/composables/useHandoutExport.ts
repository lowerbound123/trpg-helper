import { ref, reactive } from 'vue'

import {
  encodeHandoutCanvasToDownloads,
  openManagedProject,
  writeEncodedImageBlobToDownloads,
  type LibraryRecord,
  type ProjectSummary,
} from '@/lib/backend'
import { appConfiguration } from '@/lib/configuration'
import { browserQualityForEncoding, exportExtension, exportMimeType } from '@/lib/export-options'
import type { HandoutDocument, LayerMask } from '@/lib/handout'
import { canvasToPngBlob, type HandoutEncodingOptions } from '@/lib/handout-export'
import { editorMaskGpuRuntime } from '@/lib/mask-runtime'
import { downloadFileName, renderHandoutToCanvas } from '@/lib/render'
import { isImageLayer, useEditorStore } from '@/stores/editor'
import { useExportProgress } from './useExportProgress'
import { translate } from '@/i18n'

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
  const exportEncoding = ref<HandoutEncodingOptions>(structuredClone(appConfiguration.export.defaults))
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

  function enabledDocumentMasks(document: HandoutDocument) {
    return [
      document.canvas.backgroundMask,
      ...document.layers.map((layer) => layer.mask),
    ].filter((mask): mask is LayerMask => Boolean(mask?.enabled))
  }

  async function currentMaterializedMaskDataUrls(document: HandoutDocument) {
    const maskDataUrls = { ...options.editor.maskDataUrls }
    await Promise.all(enabledDocumentMasks(document).map(async (mask) => {
      const runtimeDataUrl = editorMaskGpuRuntime.hasCurrentMask(mask)
        ? editorMaskGpuRuntime.materializeMaskDataUrl(mask)
        : ''
      const dataUrl = runtimeDataUrl || await options.editor.loadMaskDataUrl(mask)
      if (dataUrl) maskDataUrls[mask.id] = dataUrl
    }))
    return maskDataUrls
  }

  async function browserCanvasBlob(canvas: HTMLCanvasElement, options: HandoutEncodingOptions) {
    if (options.format === 'jxl') throw new Error(translate('JPEG_XL_DESKTOP_ONLY'))
    if (options.format === 'png') return canvasToPngBlob(canvas)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error(translate('IMAGE_ENCODING_FAILED', { format: options.format.toUpperCase() }))),
        exportMimeType(options.format),
        browserQualityForEncoding(options),
      )
    })
  }

  async function encodeCanvas(fileName: string, canvas: HTMLCanvasElement, encoding: HandoutEncodingOptions) {
    const desktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    if (desktop) return await encodeHandoutCanvasToDownloads(fileName, canvas, encoding)
    const blob = await browserCanvasBlob(canvas, encoding)
    return {
      path: await writeEncodedImageBlobToDownloads(fileName, blob),
      inputBytes: blob.size,
      outputBytes: blob.size,
      decodeMs: 0,
      encodeMs: 0,
      writeMs: 0,
    }
  }

  async function exportCurrentImage() {
    if (isExportingCurrent.value) return
    const clickedAt = performance.now()
    isExportingCurrent.value = true
    exportProgress.value = 1
    exportLog.value = translate('HANDOUT_EXPORT_PREPARING')
    await prepareExportProgress()
    const clickToProgressMs = Math.round(performance.now() - clickedAt)
    options.logExport('export current start', {
      title: options.editor.document.title,
      scale: exportScale.value,
      format: exportEncoding.value.format,
      encoding: exportEncoding.value,
      clickToProgressMs,
    })
    try {
      exportLog.value = translate('HANDOUT_EXPORT_CHECKING')
      await setExportProgress(8)
      const signatureStartedAt = performance.now()
      const signature = JSON.stringify({
        document: options.editor.document,
        scale: exportScale.value,
        encoding: exportEncoding.value,
      })
      const signatureMs = Math.round(performance.now() - signatureStartedAt)
      if (lastCurrentExport.value?.signature === signature) {
        exportLog.value = translate('HANDOUT_EXPORT_UNCHANGED', { path: lastCurrentExport.value.path })
        options.logExport('export current unchanged', { signatureMs, clickToProgressMs, path: lastCurrentExport.value.path })
        finishExportProgress(true)
        return
      }
      exportLog.value = translate('HANDOUT_EXPORT_LOADING_IMAGES')
      await setExportProgress(18)
      const imageLoadStartedAt = performance.now()
      await ensureDocumentImages(options.editor.document)
      const imageLoadMs = Math.round(performance.now() - imageLoadStartedAt)
      exportLog.value = translate('HANDOUT_EXPORT_RENDERING')
      await setExportProgress(42)
      const renderStartedAt = performance.now()
      const maskDataUrls = await currentMaterializedMaskDataUrls(options.editor.document)
      const canvas = await renderHandoutToCanvas(
        options.editor.document,
        options.editor.library,
        exportScale.value,
        options.imageElements,
        {
          projectTarget: {
            projectId: options.editor.currentProjectId,
            projectDir: options.editor.projectDir || undefined,
          },
          masksEnabled: appConfiguration.mask.enabled,
          maskDataUrls,
          maskRenderMode: 'export-deterministic',
        },
      )
      const konvaRenderMs = Math.round(performance.now() - renderStartedAt)
      options.logExport('export current render complete', { signatureMs, imageLoadMs, konvaRenderMs, width: canvas.width, height: canvas.height })
      exportLog.value = translate('HANDOUT_EXPORT_ENCODING', { format: exportEncoding.value.format.toUpperCase() })
      await setExportProgress(86)
      const writeStartedAt = performance.now()
      const result = await encodeCanvas(
        downloadFileName(options.editor.document.title, new Date(), exportExtension(exportEncoding.value.format)),
        canvas,
        exportEncoding.value,
      )
      const writeMs = Math.round(performance.now() - writeStartedAt)
      const path = result.path
      lastCurrentExport.value = { signature, path }
      exportLog.value = translate('HANDOUT_EXPORT_COMPLETED', { path })
      options.logExport('export current complete', {
        path,
        bytes: result.outputBytes,
        clickToProgressMs,
        signatureMs,
        imageLoadMs,
        konvaRenderMs,
        writeMs,
      })
      finishExportProgress(true)
    } catch (error) {
      exportLog.value = translate('HANDOUT_EXPORT_FAILED')
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
    exportLog.value = translate('HANDOUT_EXPORT_PREPARING')
    const clickToProgressMs = Math.round(performance.now() - clickedAt)
    options.logExport('export handout start', { projectId: project.id, title: project.title, clickToProgressMs })
    try {
      const signatureStartedAt = performance.now()
      const signature = `${project.id}:${project.updatedAt}:1`
      const lastExport = lastHandoutExports.get(project.id)
      const signatureMs = Math.round(performance.now() - signatureStartedAt)
      if (lastExport?.signature === signature) {
        exportLog.value = translate('HANDOUT_EXPORT_UNCHANGED', { path: lastExport.path })
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
      const canvas = await renderHandoutToCanvas(payload.document, options.editor.library, 1, options.imageElements, {
        projectTarget: { projectId: project.id },
        masksEnabled: appConfiguration.mask.enabled,
        maskRenderMode: 'export-deterministic',
      })
      const konvaRenderMs = Math.round(performance.now() - renderStartedAt)
      options.logExport('export handout render complete', {
        projectId: project.id,
        openDurationMs,
        signatureMs,
        imageLoadMs,
        konvaRenderMs,
        width: canvas.width,
        height: canvas.height,
      })
      const writeStartedAt = performance.now()
      const pngEncoding = { ...structuredClone(appConfiguration.export.defaults), format: 'png' as const }
      const result = await encodeCanvas(downloadFileName(payload.document.title), canvas, pngEncoding)
      const path = result.path
      const writeMs = Math.round(performance.now() - writeStartedAt)
      lastHandoutExports.set(project.id, { signature, path })
      exportLog.value = translate('HANDOUT_EXPORT_COMPLETED', { path })
      options.logExport('export handout complete', {
        projectId: project.id,
        path,
        bytes: result.outputBytes,
        clickToProgressMs,
        openDurationMs,
        signatureMs,
        imageLoadMs,
        konvaRenderMs,
        writeMs,
      })
      finishExportProgress(true)
    } catch (error) {
      exportLog.value = translate('HANDOUT_EXPORT_FAILED')
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
    exportEncoding,
    exportLog,
    exportProgress,
    isExportingCurrent,
    exportCurrentImage,
    exportHandoutProject,
    isHandoutExporting,
    cleanupExportProgress,
  }
}
