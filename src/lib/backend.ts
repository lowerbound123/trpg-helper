import { convertFileSrc, invoke } from '@tauri-apps/api/core'

import type { HandoutDocument } from './handout'

export interface LibraryRecord {
  id: string
  name: string
  fileName: string
  path: string
  thumbnailPath?: string | null
  tags: string[]
  mediaType: string
  createdAt: string
  updatedAt: string
}

export interface LibraryIndex {
  backgrounds: LibraryRecord[]
  assets: LibraryRecord[]
  fonts: LibraryRecord[]
}

export interface ProjectSummary {
  id: string
  title: string
  projectDir: string
  updatedAt: string
}

export interface ProjectPayload {
  document: HandoutDocument
  metadata: Record<string, unknown>
}

export interface ImportResult {
  record: LibraryRecord
  library: LibraryIndex
}

export const emptyLibrary = (): LibraryIndex => ({
  backgrounds: [],
  assets: [],
  fonts: [],
})

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function fileUrl(path?: string | null): string {
  if (!path) return ''
  if (!isTauriRuntime()) return path
  return convertFileSrc(path)
}

export async function readFileDataUrl(path: string, mediaType: string): Promise<string> {
  if (!isTauriRuntime()) return path
  return invoke<string>('read_file_data_url', { path, mediaType })
}

export async function getLibrary(): Promise<LibraryIndex> {
  if (!isTauriRuntime()) return emptyLibrary()
  return invoke<LibraryIndex>('get_library')
}

export async function importAsset(file: File, tags: string[]): Promise<ImportResult> {
  if (!isTauriRuntime()) {
    throw new Error('Asset import requires the Tauri desktop runtime.')
  }
  return invoke<ImportResult>('import_asset', {
    fileName: file.name,
    data: Array.from(new Uint8Array(await file.arrayBuffer())),
    tags,
    mediaType: file.type || 'application/octet-stream',
  })
}

export async function importBackground(file: File, tags: string[]): Promise<ImportResult> {
  if (!isTauriRuntime()) {
    throw new Error('Background import requires the Tauri desktop runtime.')
  }
  return invoke<ImportResult>('import_background', {
    fileName: file.name,
    data: Array.from(new Uint8Array(await file.arrayBuffer())),
    tags,
    mediaType: file.type || 'application/octet-stream',
  })
}

export async function importFont(file: File, tags: string[]): Promise<ImportResult> {
  if (!isTauriRuntime()) {
    throw new Error('Font import requires the Tauri desktop runtime.')
  }
  return invoke<ImportResult>('import_font', {
    fileName: file.name,
    data: Array.from(new Uint8Array(await file.arrayBuffer())),
    tags,
    mediaType: file.type || 'font/ttf',
  })
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

export async function createProject(title: string, document: HandoutDocument): Promise<ProjectPayload> {
  if (!isTauriRuntime()) {
    return {
      document: { ...document, title },
      metadata: {
        id: `preview-${Date.now()}`,
        savedAt: new Date().toISOString(),
      },
    }
  }
  return invoke<ProjectPayload>('create_project', { title, document })
}

export async function openManagedProject(projectId: string): Promise<ProjectPayload> {
  if (!isTauriRuntime()) {
    throw new Error('Opening projects requires the Tauri desktop runtime.')
  }
  return invoke<ProjectPayload>('open_managed_project', { projectId })
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
