import { Channel, convertFileSrc, invoke } from '@tauri-apps/api/core'
import { BaseDirectory, writeFile } from '@tauri-apps/plugin-fs'

import { appConfiguration, runtimeConfigurationToml, storeRuntimeConfigurationOverride } from './configuration'
import type { HandoutDocument } from './handout'
import {
  buildHandoutExportEnvelope,
  canvasToPngBlob,
  chooseHandoutTransport,
  validateHandoutExportDimensions,
  type HandoutEncodingOptions,
  type HandoutExportResult,
} from './handout-export'
import { buildLibraryImportEnvelope, partitionLibraryImportFiles } from './library-import'
import type { UploadKind } from './upload-validation'
import type {
  TokenProjectDocument,
  TokenProjectPayload,
  TokenProjectSummary,
  TokenRingConfig,
} from './token'

export interface LibraryRecord {
  id: string
  name: string
  fileName: string
  path: string
  thumbnailPath?: string | null
  fontFamily?: string | null
  tags: string[]
  folder: string
  mediaType: string
  createdAt: string
  updatedAt: string
  tokenRing?: TokenRingConfig | null
}

export interface LibraryIndex {
  backgrounds: LibraryRecord[]
  assets: LibraryRecord[]
  fonts: LibraryRecord[]
  backgroundFolders: string[]
  assetFolders: string[]
  fontFolders: string[]
}

export interface ProjectSummary {
  id: string
  title: string
  projectDir: string
  folder: string
  backgroundAssetId?: string | null
  previewPath?: string | null
  previewSizeBytes?: number | null
  updatedAt: string
}

export type ProjectTarget = {
  projectId?: string
  projectDir?: string
}

export interface ProjectPayload {
  document: HandoutDocument
  metadata: Record<string, unknown>
}

export interface ImportResult {
  record: LibraryRecord
  library: LibraryIndex
}

export interface BatchImportItemResult {
  clientId: string
  fileName: string
  record?: LibraryRecord | null
  error?: string | null
}

export interface BatchImportResult {
  results: BatchImportItemResult[]
  library: LibraryIndex
}

export interface ForegroundSegmentationTimings {
  sessionLoadMs: number
  decodeMs: number
  preprocessMs: number
  inferenceMs: number
  postprocessMs: number
  writeMs: number
  thumbnailMs: number
  indexWriteMs: number
}

export interface ForegroundSegmentationResult {
  record: LibraryRecord
  library: LibraryIndex
  timings: ForegroundSegmentationTimings
}

export interface ForegroundSegmentationRequest {
  assetId: string
  sourcePath: string
}

export interface ForegroundSegmentationItemResult {
  assetId: string
  success: boolean
  record?: LibraryRecord | null
  error?: string | null
  model: string
  device: string
  timings: ForegroundSegmentationTimings
}

export interface ForegroundSegmentationBatchResult {
  results: ForegroundSegmentationItemResult[]
  library: LibraryIndex
}

export interface ForegroundSegmentationProgress {
  phase: 'preparing' | 'downloading' | 'probing' | 'processing' | 'writing' | 'finished'
  stage: string
  current: number
  total: number
  assetId?: string | null
  successCount: number
  failureCount: number
  model?: string | null
  device?: string | null
  completedBytes?: number | null
  totalBytes?: number | null
  elapsedMs?: number | null
  error?: string | null
}

export const emptyLibrary = (): LibraryIndex => ({
  backgrounds: [],
  assets: [],
  fonts: [],
  backgroundFolders: [],
  assetFolders: [],
  fontFolders: [],
})

export function fontRecordFamily(font?: LibraryRecord | null): string {
  return font?.fontFamily?.trim() || font?.name?.replace(/\.[^.]+$/, '') || 'Inter'
}

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

const HIGH_FREQUENCY_LOG_PATTERN = /(drag|pointer|wheel|resize|mousemove|pan|zoom|snap)/i
const RENDER_LOG_SCOPES = new Set(['render', 'export', 'thumbnail', 'background-render', 'handout-preview', 'flat'])

function shouldAppendDebugLog(scope: string, message: string) {
  if (!appConfiguration.debug.fileLogEnabled) return false
  if (scope === 'speed') return appConfiguration.debug.renderPerfLogEnabled
  if (HIGH_FREQUENCY_LOG_PATTERN.test(`${scope}:${message}`)) return false
  if (scope === 'mask' || scope === 'text' || RENDER_LOG_SCOPES.has(scope)) {
    return appConfiguration.debug.renderPerfLogEnabled
  }
  return true
}

export function logFileNameForScope(scope: string) {
  const normalized = scope.trim().toLowerCase()
  if (!/^[a-z0-9-]+$/.test(normalized)) return 'app.log'
  if (normalized === 'speed') return 'speed.log'
  if (normalized === 'mask') return 'mask.log'
  if (normalized === 'text') return 'text.log'
  if (RENDER_LOG_SCOPES.has(normalized)) return 'render.log'
  if (normalized === 'upload') return 'upload.log'
  if (normalized === 'token') return 'token.log'
  if (normalized === 'segmentation') return 'segmentation.log'
  return 'app.log'
}

export function fileUrl(path?: string | null): string {
  if (!path) return ''
  if (!isTauriRuntime()) return path
  return convertFileSrc(path)
}

export async function readConfiguration(): Promise<string> {
  if (!isTauriRuntime()) return runtimeConfigurationToml()
  return invoke<string>('read_configuration')
}

export async function writeConfiguration(source: string): Promise<string> {
  if (!isTauriRuntime()) {
    storeRuntimeConfigurationOverride(source)
    return 'browser-local-configuration'
  }
  const path = await invoke<string>('write_configuration', { source })
  storeRuntimeConfigurationOverride(source)
  return path
}

export async function readFileDataUrl(path: string, mediaType: string): Promise<string> {
  if (!isTauriRuntime()) return path
  return invoke<string>('read_file_data_url', { path, mediaType })
}

export async function readProjectFileDataUrl(
  target: { projectId?: string; projectDir?: string },
  relativePath: string,
  mediaType: string,
): Promise<string> {
  if (!isTauriRuntime()) return relativePath
  return invoke<string>('read_project_file_data_url', {
    projectId: target.projectId || null,
    projectDir: target.projectDir || null,
    relativePath,
    mediaType,
  })
}

export async function getLibrary(): Promise<LibraryIndex> {
  if (!isTauriRuntime()) return emptyLibrary()
  return invoke<LibraryIndex>('get_library')
}

export async function repairMissingThumbnails(): Promise<LibraryIndex> {
  if (!isTauriRuntime()) return emptyLibrary()
  return invoke<LibraryIndex>('repair_missing_thumbnails')
}

export async function segmentAssetForeground(assetId: string, sourcePath: string): Promise<ForegroundSegmentationResult> {
  if (!isTauriRuntime()) throw new Error('Foreground segmentation requires the Tauri desktop runtime.')
  return invoke<ForegroundSegmentationResult>('segment_asset_foreground', { assetId, sourcePath })
}

export async function segmentAssetsForeground(
  requests: ForegroundSegmentationRequest[],
  onProgress?: (event: ForegroundSegmentationProgress) => void,
): Promise<ForegroundSegmentationBatchResult> {
  if (!isTauriRuntime()) throw new Error('Foreground segmentation requires the Tauri desktop runtime.')
  const progressChannel = new Channel<ForegroundSegmentationProgress>()
  progressChannel.onmessage = (event) => onProgress?.(event)
  return invoke<ForegroundSegmentationBatchResult>('segment_assets_foreground', {
    requests,
    onProgress: progressChannel,
  })
}

export async function saveFontPreview(fontId: string, dataUrl: string): Promise<LibraryIndex> {
  if (!isTauriRuntime()) return emptyLibrary()
  return invoke<LibraryIndex>('save_font_preview', { fontId, dataUrl })
}

export async function saveProjectMask(
  target: ProjectTarget,
  maskId: string,
  dataUrl: string,
): Promise<string> {
  if (!isTauriRuntime()) return `masks/${maskId}.png`
  return invoke<string>('save_project_mask', {
    projectId: target.projectId || null,
    projectDir: target.projectDir || null,
    maskId,
    dataUrl,
  })
}

export async function saveProjectAsset(
  target: ProjectTarget,
  assetId: string,
  fileName: string,
  dataUrl: string,
): Promise<string> {
  if (!isTauriRuntime()) return `assets/${assetId}.png`
  return invoke<string>('save_project_asset', {
    projectId: target.projectId ?? null,
    projectDir: target.projectDir ?? null,
    assetId,
    fileName,
    dataUrl,
  })
}

export async function saveProjectMaskCache(
  target: ProjectTarget,
  maskId: string,
  dataUrl: string,
  maxEdge: number,
): Promise<string> {
  if (!isTauriRuntime()) return `.cache/masks/${maskId}-preview-${maxEdge}.png`
  return invoke<string>('save_project_mask_cache', {
    projectId: target.projectId || null,
    projectDir: target.projectDir || null,
    maskId,
    dataUrl,
    maxEdge,
  })
}

export async function deleteProjectMask(
  target: { projectId?: string; projectDir?: string },
  relativePath: string,
): Promise<void> {
  if (!isTauriRuntime() || !relativePath) return
  return invoke<void>('delete_project_mask', {
    projectId: target.projectId || null,
    projectDir: target.projectDir || null,
    relativePath,
  })
}

export async function importAsset(file: File, tags: string[], folder = ''): Promise<ImportResult> {
  return importSingleLibraryFile('asset', file, tags, folder)
}

export async function importLibraryFiles(
  kind: UploadKind,
  files: File[],
  tags: string[],
  folder = '',
): Promise<BatchImportResult> {
  if (!isTauriRuntime()) throw new Error('Library import requires the Tauri desktop runtime.')
  if (!files.length) return { results: [], library: await getLibrary() }
  const results: BatchImportItemResult[] = []
  let library = emptyLibrary()
  let clientIdOffset = 0
  for (const batch of partitionLibraryImportFiles(files)) {
    const preparedAt = performance.now()
    const envelope = await buildLibraryImportEnvelope(kind, batch, tags, folder, clientIdOffset)
    void appendDebugLog('speed', 'library-import-envelope-prepared', {
      kind,
      files: batch.length,
      bytes: envelope.length,
      durationMs: Math.round(performance.now() - preparedAt),
    })
    const imported = await invoke<BatchImportResult>('import_library_batch', envelope)
    results.push(...imported.results)
    library = imported.library
    clientIdOffset += batch.length
  }
  return { results, library }
}

export async function importLibraryPaths(
  kind: UploadKind,
  paths: string[],
  folder = '',
  tags: string[] = [],
): Promise<BatchImportResult> {
  if (!isTauriRuntime()) throw new Error('Path import requires the Tauri desktop runtime.')
  return invoke<BatchImportResult>('import_library_paths', { kind, paths, folder, tags })
}

async function importSingleLibraryFile(kind: UploadKind, file: File, tags: string[], folder: string): Promise<ImportResult> {
  const result = await importLibraryFiles(kind, [file], tags, folder)
  const item = result.results[0]
  if (!item?.record) throw new Error(item?.error || `Failed to import ${file.name}`)
  return { record: item.record, library: result.library }
}

export async function updateTokenRingConfig(
  id: string,
  expectedRevision: number,
  config: TokenRingConfig,
): Promise<LibraryIndex> {
  return invoke<LibraryIndex>('update_token_ring_config', { id, expectedRevision, config })
}

export async function importBackground(file: File, tags: string[], folder = ''): Promise<ImportResult> {
  return importSingleLibraryFile('background', file, tags, folder)
}

export async function importFont(file: File, tags: string[], folder = ''): Promise<ImportResult> {
  return importSingleLibraryFile('font', file, tags, folder)
}

export async function createLibraryFolder(
  kind: 'background' | 'asset' | 'font',
  folder: string,
): Promise<LibraryIndex> {
  if (!isTauriRuntime()) return emptyLibrary()
  return invoke<LibraryIndex>('create_library_folder', { kind, folder })
}

export async function createProjectFolder(folder: string): Promise<string[]> {
  if (!isTauriRuntime()) return []
  return invoke<string[]>('create_project_folder', { folder })
}

export async function renameLibraryRecord(
  kind: 'background' | 'asset' | 'font',
  id: string,
  name: string,
): Promise<LibraryIndex> {
  if (!isTauriRuntime()) return emptyLibrary()
  return invoke<LibraryIndex>('rename_library_record', { kind, id, name })
}

export async function renameLibraryFolder(
  kind: 'background' | 'asset' | 'font',
  oldFolder: string,
  newFolder: string,
): Promise<LibraryIndex> {
  if (!isTauriRuntime()) return emptyLibrary()
  return invoke<LibraryIndex>('rename_library_folder', { kind, oldFolder, newFolder })
}

export async function moveLibraryRecord(
  kind: 'background' | 'asset' | 'font',
  id: string,
  folder: string,
): Promise<LibraryIndex> {
  if (!isTauriRuntime()) return emptyLibrary()
  return invoke<LibraryIndex>('move_library_record', { kind, id, folder })
}

export async function deleteLibraryEntries(
  kind: 'background' | 'asset' | 'font',
  entries: { ids: string[]; folders: string[] },
): Promise<LibraryIndex> {
  if (!isTauriRuntime()) return emptyLibrary()
  return invoke<LibraryIndex>('delete_library_entries', { kind, entries })
}

export async function renameProjectFolder(oldFolder: string, newFolder: string): Promise<string[]> {
  if (!isTauriRuntime()) return []
  return invoke<string[]>('rename_project_folder', { oldFolder, newFolder })
}

export async function listProjectFolders(): Promise<string[]> {
  if (!isTauriRuntime()) return []
  return invoke<string[]>('list_project_folders')
}

export async function saveProject(
  projectDir: string,
  document: HandoutDocument,
): Promise<ProjectPayload> {
  if (!isTauriRuntime()) {
    throw new Error('Saving projects requires the Tauri desktop runtime.')
  }
  return invoke<ProjectPayload>('save_project', {
    projectDir,
    document,
    metadata: {
      savedAt: new Date().toISOString(),
      app: 'handout-generator',
    },
  })
}

export async function openProject(projectDir: string): Promise<ProjectPayload> {
  if (!isTauriRuntime()) {
    throw new Error('Opening projects requires the Tauri desktop runtime.')
  }
  return invoke<ProjectPayload>('open_project', { projectDir })
}

export async function listProjects(): Promise<ProjectSummary[]> {
  if (!isTauriRuntime()) return []
  return invoke<ProjectSummary[]>('list_projects')
}

export async function createProject(title: string, document: HandoutDocument, folder = ''): Promise<ProjectPayload> {
  if (!isTauriRuntime()) {
    return {
      document: { ...document, title },
      metadata: {
        id: `preview-${Date.now()}`,
        folder,
        savedAt: new Date().toISOString(),
      },
    }
  }
  return invoke<ProjectPayload>('create_project', { title, document, folder })
}

export async function openManagedProject(projectId: string): Promise<ProjectPayload> {
  if (!isTauriRuntime()) {
    throw new Error('Opening projects requires the Tauri desktop runtime.')
  }
  return invoke<ProjectPayload>('open_managed_project', { projectId })
}

export async function copyProjectMasks(sourceProjectId: string, targetProjectId: string): Promise<void> {
  if (!isTauriRuntime()) return
  return invoke<void>('copy_project_masks', { sourceProjectId, targetProjectId })
}

export async function renameManagedProject(projectId: string, title: string): Promise<ProjectPayload> {
  if (!isTauriRuntime()) {
    throw new Error('Renaming projects requires the Tauri desktop runtime.')
  }
  return invoke<ProjectPayload>('rename_managed_project', { projectId, title })
}

export async function moveManagedProject(projectId: string, folder: string): Promise<ProjectPayload> {
  if (!isTauriRuntime()) {
    throw new Error('Moving projects requires the Tauri desktop runtime.')
  }
  return invoke<ProjectPayload>('move_managed_project', { projectId, folder })
}

export async function deleteProjectEntries(entries: { ids: string[]; folders: string[] }): Promise<string[]> {
  if (!isTauriRuntime()) return []
  return invoke<string[]>('delete_project_entries', { entries })
}

export async function saveManagedProject(
  projectId: string,
  document: HandoutDocument,
): Promise<ProjectPayload> {
  if (!isTauriRuntime()) {
    return {
      document,
      metadata: {
        id: projectId,
        savedAt: new Date().toISOString(),
      },
    }
  }
  return invoke<ProjectPayload>('save_managed_project', { projectId, document })
}

export async function createTokenProject(
  document: TokenProjectDocument,
  folder = '',
): Promise<TokenProjectPayload> {
  return invoke<TokenProjectPayload>('create_token_project', { document, folder })
}

export async function listTokenProjects(): Promise<TokenProjectSummary[]> {
  if (!isTauriRuntime()) return []
  return invoke<TokenProjectSummary[]>('list_token_projects')
}

export async function listTokenProjectFolders(): Promise<string[]> {
  if (!isTauriRuntime()) return []
  return invoke<string[]>('list_token_project_folders')
}

export async function createTokenProjectFolder(folder: string): Promise<string[]> {
  return invoke<string[]>('create_token_project_folder', { folder })
}

export async function openTokenProject(projectId: string): Promise<TokenProjectPayload> {
  return invoke<TokenProjectPayload>('open_token_project', { projectId })
}

export async function saveTokenProject(
  projectId: string,
  document: TokenProjectDocument,
): Promise<TokenProjectPayload> {
  return invoke<TokenProjectPayload>('save_token_project', { projectId, document })
}

export async function renameTokenProject(
  projectId: string,
  title: string,
): Promise<TokenProjectPayload> {
  return invoke<TokenProjectPayload>('rename_token_project', { projectId, title })
}

export async function moveTokenProject(projectId: string, folder: string): Promise<TokenProjectPayload> {
  return invoke<TokenProjectPayload>('move_token_project', { projectId, folder })
}

export async function copyTokenProject(projectId: string): Promise<TokenProjectPayload> {
  return invoke<TokenProjectPayload>('copy_token_project', { projectId })
}

export async function renameTokenProjectFolder(oldFolder: string, newFolder: string): Promise<string[]> {
  return invoke<string[]>('rename_token_project_folder', { oldFolder, newFolder })
}

export async function deleteTokenProjectEntries(entries: { ids: string[]; folders: string[] }): Promise<string[]> {
  return invoke<string[]>('delete_token_project_entries', { entries })
}

export async function saveTokenProjectPreview(projectId: string, dataUrl: string): Promise<string> {
  return invoke<string>('save_token_project_preview', { projectId, dataUrl })
}

export async function exportImage(filePath: string, dataUrl: string): Promise<string> {
  if (!isTauriRuntime()) {
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = filePath.split('/').at(-1) || 'handout.png'
    link.click()
    return filePath
  }
  return invoke<string>('export_image', { filePath, dataUrl })
}

export async function exportImageToDownloads(fileName: string, dataUrl: string): Promise<string> {
  if (!isTauriRuntime()) {
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = fileName || 'handout.png'
    link.click()
    return fileName
  }
  return invoke<string>('export_image_to_downloads', { fileName, dataUrl })
}

export async function exportImageBlobToDownloads(
  fileName: string,
  blob: Blob,
  format: 'png' | 'jpeg' | 'webp',
  quality?: number,
): Promise<string> {
  if (!isTauriRuntime()) {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = fileName || 'handout.png'
    link.click()
    URL.revokeObjectURL(link.href)
    return fileName
  }
  const data = new Uint8Array(await blob.arrayBuffer())
  const boundedQuality = quality === undefined ? null : Math.max(1, Math.min(100, Math.round(quality)))
  const stagingPath = `staging-${crypto.randomUUID()}.png`
  await writeFile(stagingPath, data, { baseDir: BaseDirectory.AppLocalData })
  return invoke<string>('export_image_file_to_downloads', { fileName, stagingPath, format, quality: boundedQuality })
}

export async function writeEncodedImageBlobToDownloads(
  fileName: string,
  blob: Blob,
): Promise<string> {
  if (!isTauriRuntime()) {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = fileName || 'handout.png'
    link.click()
    URL.revokeObjectURL(link.href)
    return fileName
  }
  const arrayStartedAt = performance.now()
  const data = new Uint8Array(await blob.arrayBuffer())
  void appendDebugLog('speed', 'export-encoded-blob-array-buffer', {
    fileName,
    bytes: data.length,
    durationMs: Math.round(performance.now() - arrayStartedAt),
  })
  const writeStartedAt = performance.now()
  const path = await invoke<string>('write_encoded_image_bytes_to_downloads', data, {
    headers: { 'x-file-name': fileName },
  })
  void appendDebugLog('speed', 'export-encoded-downloads-write', {
    fileName,
    bytes: data.length,
    durationMs: Math.round(performance.now() - writeStartedAt),
  })
  return path
}

export async function encodeHandoutCanvasToDownloads(
  fileName: string,
  canvas: HTMLCanvasElement,
  options: HandoutEncodingOptions,
): Promise<HandoutExportResult> {
  if (!isTauriRuntime()) throw new Error('Rust Handout 编码仅在桌面应用中可用')
  const config = appConfiguration.export
  validateHandoutExportDimensions(
    canvas.width,
    canvas.height,
    config.limits.maxCanvasDimension,
    config.limits.maxCanvasPixels,
  )
  const inputEncoding = chooseHandoutTransport(canvas.width, canvas.height, config.rawRgbaIpcMaxBytes)
  const payloadStartedAt = performance.now()
  let payload: Uint8Array
  if (inputEncoding === 'rgba8') {
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('无法读取 Handout 导出像素')
    payload = new Uint8Array(context.getImageData(0, 0, canvas.width, canvas.height).data.buffer)
  } else {
    payload = new Uint8Array(await (await canvasToPngBlob(canvas)).arrayBuffer())
  }
  void appendDebugLog('speed', 'handout-export-transport-prepared', {
    inputEncoding,
    width: canvas.width,
    height: canvas.height,
    bytes: payload.length,
    durationMs: Math.round(performance.now() - payloadStartedAt),
  })
  const envelope = buildHandoutExportEnvelope({
    fileName,
    width: canvas.width,
    height: canvas.height,
    inputEncoding,
    options,
    jpegMatteColor: config.rendering.jpegMatteColor,
    webpStrengthProfiles: config.webpStrengthProfiles,
  }, payload)
  const ipcStartedAt = performance.now()
  const result = await invoke<HandoutExportResult>('encode_handout_image_to_downloads', envelope)
  void appendDebugLog('speed', 'handout-export-rust-complete', {
    ...result,
    inputEncoding,
    ipcDurationMs: Math.round(performance.now() - ipcStartedAt),
  })
  return result
}

export async function saveProjectPreview(projectId: string, dataUrl: string): Promise<string> {
  if (!isTauriRuntime()) return dataUrl
  return invoke<string>('save_project_preview', { projectId, dataUrl })
}

export async function appendDebugLog(scope: string, message: string, data?: unknown): Promise<string> {
  if (!shouldAppendDebugLog(scope, message)) return ''
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    scope,
    message,
    data,
  })
  if (!isTauriRuntime()) {
    console.debug(line)
    return line
  }
  return invoke<string>('append_debug_log', { scope, line })
}
