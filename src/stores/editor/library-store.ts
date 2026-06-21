import type { ComputedRef, Ref } from 'vue'

import type { HandoutDocument } from '@/lib/handout'
import {
  createLibraryFolder,
  deleteLibraryEntries,
  getLibrary,
  importAsset,
  importBackground,
  importFont,
  moveLibraryRecord,
  renameLibraryFolder,
  renameLibraryRecord,
  repairMissingThumbnails,
  type LibraryIndex,
  type LibraryRecord,
} from '@/lib/backend'

import type { createFontStore } from './font-store'

const tagList = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)

export function createLibraryStore(deps: {
  library: Ref<LibraryIndex>
  status: Ref<string>
  document: ComputedRef<HandoutDocument>
  fontStore: ReturnType<typeof createFontStore>
}) {
  async function refreshLibrary() {
    deps.library.value = await getLibrary()
    deps.fontStore.scheduleFontPreviews()
  }

  async function repairLibraryThumbnails() {
    deps.library.value = await repairMissingThumbnails()
    deps.fontStore.scheduleFontPreviews()
  }

  async function importAssetFile(file: File, tagText: string, folder = '') {
    const result = await importAsset(file, tagList(tagText), folder)
    deps.library.value = result.library
    deps.status.value = `Imported asset ${result.record.name}`
    return result.record
  }

  async function importBackgroundFile(file: File, tagText: string, folder = '') {
    const result = await importBackground(file, tagList(tagText), folder)
    deps.library.value = result.library
    deps.status.value = `Imported background ${result.record.name}`
    return result.record
  }

  async function importFontFile(file: File, tagText: string, folder = '') {
    const result = await importFont(file, tagList(tagText), folder)
    deps.library.value = result.library
    await deps.fontStore.loadFont(result.record)
    await deps.fontStore.createFontPreview(result.record)
    deps.status.value = `Imported font ${result.record.name}`
    return result.record
  }

  async function createResourceFolder(kind: 'background' | 'asset' | 'font', folder: string) {
    deps.library.value = await createLibraryFolder(kind, folder)
    deps.status.value = `Created ${kind} folder ${folder.trim()}`
  }

  async function renameResource(kind: 'background' | 'asset' | 'font', id: string, name: string) {
    deps.library.value = await renameLibraryRecord(kind, id, name)
    deps.status.value = `Renamed ${kind} to ${name.trim()}`
  }

  async function renameResourceFolder(kind: 'background' | 'asset' | 'font', oldFolder: string, newFolder: string) {
    deps.library.value = await renameLibraryFolder(kind, oldFolder, newFolder)
    deps.status.value = `Renamed folder ${oldFolder} to ${newFolder.trim()}`
  }

  async function moveResourceToFolder(kind: 'background' | 'asset' | 'font', id: string, folder: string) {
    deps.library.value = await moveLibraryRecord(kind, id, folder)
    deps.status.value = `Moved ${kind} to ${folder.trim() || 'root'}`
  }

  async function deleteResourceEntries(kind: 'background' | 'asset' | 'font', entries: { ids: string[]; folders: string[] }) {
    deps.library.value = await deleteLibraryEntries(kind, entries)
    deps.status.value = `Deleted ${kind} item${entries.ids.length + entries.folders.length === 1 ? '' : 's'}`
  }

  function resolveAsset(assetId?: string) {
    return deps.library.value.assets.find((asset) => asset.id === assetId)
      || deps.document.value.projectAssets?.find((asset) => asset.id === assetId) as LibraryRecord | undefined
  }

  function resolveBackground(backgroundId?: string) {
    return deps.library.value.backgrounds.find((background) => background.id === backgroundId)
  }

  function resolveFont(fontId?: string) {
    return deps.library.value.fonts.find((font) => font.id === fontId)
  }

  function mergeProjectAssetsIntoLibrary(doc: HandoutDocument) {
    const projectAssets = doc.projectAssets ?? []
    if (!projectAssets.length) return
    const existing = new Set(deps.library.value.assets.map((asset) => asset.id))
    const nextAssets = [...deps.library.value.assets]
    for (const asset of projectAssets) {
      if (existing.has(asset.id)) continue
      nextAssets.push(asset as LibraryRecord)
      existing.add(asset.id)
    }
    deps.library.value = { ...deps.library.value, assets: nextAssets }
  }

  return {
    refreshLibrary,
    repairLibraryThumbnails,
    importAssetFile,
    importBackgroundFile,
    importFontFile,
    createResourceFolder,
    renameResource,
    renameResourceFolder,
    moveResourceToFolder,
    deleteResourceEntries,
    resolveAsset,
    resolveBackground,
    resolveFont,
    mergeProjectAssetsIntoLibrary,
  }
}
