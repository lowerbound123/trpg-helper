import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  createTokenProject,
  createTokenProjectFolder,
  deleteTokenProjectEntries,
  listTokenProjectFolders,
  listTokenProjects,
  openTokenProject,
  saveTokenProject,
  type LibraryRecord,
} from '@/lib/backend'
import {
  createDefaultTokenExportSettings,
  createDefaultTokenVisualStyle,
  TOKEN_EXPORT_SETTING_KEYS,
  TOKEN_VISUAL_STYLE_KEYS,
  type TokenExportSettings,
  type TokenProjectDocument,
  type TokenProjectItem,
  type TokenProjectSummary,
  type TokenVisualStyle,
} from '@/lib/token'
import { appConfiguration } from '@/lib/configuration'
import { useWorkspaceStore } from './workspace'

type HistorySnapshot = { items: TokenProjectItem[]; exportSettings: TokenExportSettings }

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function untitledTokenTitle(now = new Date()) {
  const number = (value: number) => String(value).padStart(2, '0')
  return `未命名项目-${now.getFullYear()}${number(now.getMonth() + 1)}${number(now.getDate())}-${number(now.getHours())}${number(now.getMinutes())}${number(now.getSeconds())}`
}

export const useTokenStore = defineStore('token-projects', () => {
  const workspace = useWorkspaceStore()
  const projects = ref<TokenProjectSummary[]>([])
  const folders = ref<string[]>([])
  const document = ref<TokenProjectDocument>()
  const resolvedSources = ref<Record<string, string>>({})
  const selectedItemId = ref<string>()
  const checkedItemIds = ref<string[]>([])
  const status = ref('Ready')
  const dirty = ref(false)
  const history = ref<HistorySnapshot[]>([])
  const historyIndex = ref(-1)
  let pendingEdit: HistorySnapshot | undefined

  const items = computed(() => document.value?.items ?? [])
  const selectedItem = computed(() => items.value.find((item) => item.id === selectedItemId.value) ?? items.value[0])
  const canUndo = computed(() => historyIndex.value >= 0)
  const canRedo = computed(() => historyIndex.value + 1 < history.value.length)

  function snapshot(): HistorySnapshot {
    return {
      items: clone(document.value?.items ?? []),
      exportSettings: clone(document.value?.exportSettings ?? createDefaultTokenExportSettings()),
    }
  }

  function applySnapshot(value: HistorySnapshot) {
    if (!document.value) return
    document.value.items = clone(value.items)
    document.value.exportSettings = clone(value.exportSettings)
    dirty.value = true
  }

  function pushHistory(before: HistorySnapshot) {
    const after = snapshot()
    if (JSON.stringify(before) === JSON.stringify(after)) return
    history.value = history.value.slice(0, historyIndex.value + 1)
    history.value.push(before)
    if (history.value.length > appConfiguration.token.history.maximumEntries) history.value.shift()
    historyIndex.value = history.value.length - 1
    dirty.value = true
  }

  function beginEdit() {
    pendingEdit ??= snapshot()
  }

  function commitEdit() {
    if (!pendingEdit) return
    const before = pendingEdit
    pendingEdit = undefined
    pushHistory(before)
  }

  function updateVisualStyle<K extends keyof TokenVisualStyle>(key: K, value: TokenVisualStyle[K]) {
    const item = selectedItem.value
    if (!item) return
    beginEdit()
    item.style[key] = value
    dirty.value = true
  }

  function updateExportSetting<K extends keyof TokenExportSettings>(key: K, value: TokenExportSettings[K]) {
    if (!document.value) return
    beginEdit()
    document.value.exportSettings[key] = value
    dirty.value = true
  }

  function undo() {
    const before = history.value[historyIndex.value]
    if (!before) return
    const current = snapshot()
    applySnapshot(before)
    history.value[historyIndex.value] = current
    historyIndex.value -= 1
  }

  function redo() {
    const index = historyIndex.value + 1
    const next = history.value[index]
    if (!next) return
    const current = snapshot()
    applySnapshot(next)
    history.value[index] = current
    historyIndex.value = index
  }

  async function refreshProjects() {
    ;[projects.value, folders.value] = await Promise.all([listTokenProjects(), listTokenProjectFolders()])
  }

  async function addFolder(folder: string) {
    folders.value = await createTokenProjectFolder(folder)
    await refreshProjects()
  }

  function itemFromAsset(asset: LibraryRecord): TokenProjectItem {
    return {
      id: crypto.randomUUID(),
      assetId: asset.id,
      name: asset.name,
      mediaType: asset.mediaType,
      sourcePath: asset.path,
      style: createDefaultTokenVisualStyle(),
    }
  }

  async function createFromAssets(assets: LibraryRecord[]) {
    const images = assets.filter((asset) => asset.mediaType.startsWith('image/'))
    if (!images.length) throw new Error('请选择至少一个图片 Asset')
    const now = new Date().toISOString()
    const next: TokenProjectDocument = {
      schemaVersion: 1,
      id: crypto.randomUUID(),
      title: untitledTokenTitle(),
      items: images.map(itemFromAsset),
      exportSettings: createDefaultTokenExportSettings(),
      createdAt: now,
      updatedAt: now,
    }
    const payload = await createTokenProject(next)
    loadPayload(payload.document, payload.resolvedSources)
    workspace.openTokenEditor()
    await refreshProjects()
    status.value = `Created token project ${payload.document.title}`
  }

  function addAssets(assets: LibraryRecord[]) {
    if (!document.value) return 0
    const existing = new Set(document.value.items.map((item) => item.assetId).filter(Boolean))
    const added = assets.filter((asset) => asset.mediaType.startsWith('image/') && !existing.has(asset.id))
    if (!added.length) return 0
    const before = snapshot()
    const nextItems = added.map(itemFromAsset)
    document.value.items.push(...nextItems)
    for (const item of nextItems) resolvedSources.value[item.id] = item.sourcePath
    checkedItemIds.value.push(...nextItems.map((item) => item.id))
    selectedItemId.value = nextItems[0]?.id
    pushHistory(before)
    return nextItems.length
  }

  function removeItem(itemId: string) {
    if (!document.value) return
    const before = snapshot()
    document.value.items = document.value.items.filter((item) => item.id !== itemId)
    delete resolvedSources.value[itemId]
    checkedItemIds.value = checkedItemIds.value.filter((id) => id !== itemId)
    if (selectedItemId.value === itemId) selectedItemId.value = document.value.items[0]?.id
    pushHistory(before)
  }

  function loadPayload(next: TokenProjectDocument, sources: Record<string, string>) {
    document.value = clone(next)
    resolvedSources.value = { ...sources }
    selectedItemId.value = next.items[0]?.id
    checkedItemIds.value = next.items.map((item) => item.id)
    history.value = []
    historyIndex.value = -1
    pendingEdit = undefined
    dirty.value = false
  }

  async function open(projectId: string) {
    const payload = await openTokenProject(projectId)
    loadPayload(payload.document, payload.resolvedSources)
    workspace.openTokenEditor()
    status.value = `Opened token project ${payload.document.title}`
  }

  async function save() {
    if (!document.value) return
    commitEdit()
    const previousSelectedItemId = selectedItemId.value
    const previousCheckedItemIds = new Set(checkedItemIds.value)
    document.value.updatedAt = new Date().toISOString()
    const payload = await saveTokenProject(document.value.id, document.value)
    loadPayload(payload.document, payload.resolvedSources)
    const availableItemIds = new Set(payload.document.items.map((item) => item.id))
    selectedItemId.value = previousSelectedItemId && availableItemIds.has(previousSelectedItemId)
      ? previousSelectedItemId
      : payload.document.items[0]?.id
    checkedItemIds.value = payload.document.items
      .map((item) => item.id)
      .filter((itemId) => previousCheckedItemIds.has(itemId))
    await refreshProjects()
    status.value = `Saved token project ${payload.document.title}`
  }

  async function close(options: { save?: boolean } = {}) {
    if (options.save !== false && dirty.value) await save()
    workspace.openManager()
  }

  function applyCurrentStyleToChecked() {
    const current = selectedItem.value
    if (!current) return
    const before = snapshot()
    const checked = new Set(checkedItemIds.value)
    for (const item of items.value) {
      if (checked.has(item.id)) item.style = clone(current.style)
    }
    pushHistory(before)
  }

  function toggleAllChecked() {
    const allChecked = items.value.length > 0 && items.value.every((item) => checkedItemIds.value.includes(item.id))
    checkedItemIds.value = allChecked ? [] : items.value.map((item) => item.id)
  }

  function clearItems() {
    if (!document.value || document.value.items.length === 0) return
    const before = snapshot()
    document.value.items = []
    resolvedSources.value = {}
    selectedItemId.value = undefined
    checkedItemIds.value = []
    pushHistory(before)
  }

  function resetSelectedStyle() {
    const item = selectedItem.value
    if (!item) return
    const before = snapshot()
    item.style = createDefaultTokenVisualStyle()
    pushHistory(before)
  }

  function replaceMissingRingReferences(availableRingStyles: ReadonlySet<string>) {
    if (!document.value) return 0
    const before = snapshot()
    let replaced = 0
    for (const item of document.value.items) {
      if (!item.style.ringStyle.startsWith('asset:') || availableRingStyles.has(item.style.ringStyle)) continue
      item.style.ringStyle = 'solid'
      replaced += 1
    }
    if (replaced > 0) pushHistory(before)
    return replaced
  }

  async function deleteEntries(entries: { ids: string[]; folders: string[] }) {
    folders.value = await deleteTokenProjectEntries(entries)
    await refreshProjects()
  }

  return {
    projects, folders, document, resolvedSources, selectedItemId, checkedItemIds, status, dirty,
    items, selectedItem, canUndo, canRedo, refreshProjects, addFolder, createFromAssets, addAssets, removeItem, open, save,
    close, updateVisualStyle, updateExportSetting, beginEdit, commitEdit, undo, redo,
    applyCurrentStyleToChecked, toggleAllChecked, clearItems, resetSelectedStyle,
    replaceMissingRingReferences, deleteEntries,
    visualStyleKeys: TOKEN_VISUAL_STYLE_KEYS,
    exportSettingKeys: TOKEN_EXPORT_SETTING_KEYS,
  }
})
