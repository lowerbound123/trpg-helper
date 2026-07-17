import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { translate } from '@/i18n'

import {
  createTokenProject, createTokenProjectFolder, deleteTokenProjectEntries,
  listTokenProjectFolders, listTokenProjects, openTokenProject, renameTokenProject,
  saveTokenProject, type LibraryRecord,
} from '@/lib/backend'
import {
  createDefaultTokenExportSettings, createDefaultTokenVisualStyle,
  normalizeTokenVisualStyle,
  TOKEN_EXPORT_SETTING_KEYS, TOKEN_VISUAL_STYLE_KEYS,
  type CustomRingConfig, type TokenExportSettings, type TokenProjectDocument,
  type CustomBackgroundConfig,
  type TokenProjectItem, type TokenProjectSummary, type TokenVisualStyle,
} from '@/lib/token'
import { appConfiguration } from '@/lib/configuration'
import { useTokenRingStore } from './token-rings'
import { useWorkspaceStore } from './workspace'

type StyleChange = { itemId: string; before: TokenVisualStyle; after: TokenVisualStyle }
type ItemsState = {
  items: TokenProjectItem[]
  selectedItemId?: string
  checkedItemIds: string[]
  resolvedSources: Record<string, string>
}
type HistoryAction =
  | { kind: 'style'; changes: StyleChange[] }
  | { kind: 'export'; before: TokenExportSettings; after: TokenExportSettings }
  | { kind: 'items'; before: ItemsState; after: ItemsState }
  | { kind: 'ringConfig'; ringId: string; before: CustomRingConfig; after: CustomRingConfig }
  | { kind: 'backgroundConfig'; backgroundId: string; before: CustomBackgroundConfig; after: CustomBackgroundConfig }

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function equal(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
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
  const status = ref(translate('READY'))
  const dirty = ref(false)
  const history = ref<HistoryAction[]>([])
  const historyIndex = ref(-1)
  const historyBusy = ref(false)
  let pendingStyle: { itemId: string; before: TokenVisualStyle } | undefined
  let pendingExport: TokenExportSettings | undefined

  const items = computed(() => document.value?.items ?? [])
  const selectedItem = computed(() => items.value.find((item) => item.id === selectedItemId.value) ?? items.value[0])
  const canUndo = computed(() => !historyBusy.value && historyIndex.value >= 0)
  const canRedo = computed(() => !historyBusy.value && historyIndex.value + 1 < history.value.length)

  function itemState(): ItemsState {
    return {
      items: clone(items.value),
      selectedItemId: selectedItemId.value,
      checkedItemIds: [...checkedItemIds.value],
      resolvedSources: { ...resolvedSources.value },
    }
  }

  function repairRuntimeState() {
    const ids = new Set(items.value.map((item) => item.id))
    if (!selectedItemId.value || !ids.has(selectedItemId.value)) selectedItemId.value = items.value[0]?.id
    checkedItemIds.value = checkedItemIds.value.filter((id) => ids.has(id))
    resolvedSources.value = Object.fromEntries(
      Object.entries(resolvedSources.value).filter(([id]) => ids.has(id)),
    )
  }

  function applyItemsState(state: ItemsState) {
    if (!document.value) return
    document.value.items = clone(state.items)
    selectedItemId.value = state.selectedItemId
    checkedItemIds.value = [...state.checkedItemIds]
    resolvedSources.value = { ...state.resolvedSources }
    repairRuntimeState()
  }

  function pushAction(action: HistoryAction) {
    history.value = history.value.slice(0, historyIndex.value + 1)
    history.value.push(action)
    if (history.value.length > appConfiguration.token.history.maximumEntries) history.value.shift()
    historyIndex.value = history.value.length - 1
    dirty.value = true
  }

  function pushItems(before: ItemsState) {
    const after = itemState()
    if (!equal(before, after)) pushAction({ kind: 'items', before, after })
  }

  function beginEdit() {
    // The concrete edit kind is captured lazily by updateVisualStyle/updateExportSetting.
  }

  function updateVisualStyle<K extends keyof TokenVisualStyle>(key: K, value: TokenVisualStyle[K]) {
    const item = selectedItem.value
    if (!item || item.style[key] === value) return
    if (!pendingStyle || pendingStyle.itemId !== item.id) {
      commitEdit()
      pendingStyle = { itemId: item.id, before: clone(item.style) }
    }
    item.style[key] = value
    dirty.value = true
  }

  function updateExportSetting<K extends keyof TokenExportSettings>(key: K, value: TokenExportSettings[K]) {
    if (!document.value || document.value.exportSettings[key] === value) return
    if (!pendingExport) {
      commitEdit()
      pendingExport = clone(document.value.exportSettings)
    }
    document.value.exportSettings[key] = value
    dirty.value = true
  }

  function commitEdit() {
    if (pendingStyle) {
      const item = items.value.find((candidate) => candidate.id === pendingStyle!.itemId)
      const before = pendingStyle.before
      pendingStyle = undefined
      if (item && !equal(before, item.style)) {
        pushAction({ kind: 'style', changes: [{ itemId: item.id, before, after: clone(item.style) }] })
      }
    }
    if (pendingExport && document.value) {
      const before = pendingExport
      pendingExport = undefined
      if (!equal(before, document.value.exportSettings)) {
        pushAction({ kind: 'export', before, after: clone(document.value.exportSettings) })
      }
    }
  }

  function applySynchronousAction(action: Extract<HistoryAction, { kind: 'style' | 'export' | 'items' }>, direction: 'before' | 'after') {
    if (!document.value) return
    if (action.kind === 'items') return applyItemsState(action[direction])
    if (action.kind === 'export') {
      document.value.exportSettings = clone(action[direction])
      return
    }
    for (const change of action.changes) {
      const item = items.value.find((candidate) => candidate.id === change.itemId)
      if (item) item.style = clone(change[direction])
    }
  }

  async function applyRingAction(action: Extract<HistoryAction, { kind: 'ringConfig' }>, direction: 'before' | 'after', delta: number) {
    historyBusy.value = true
    try {
      const rings = useTokenRingStore()
      const current = rings.descriptor(action.ringId)?.customConfig
      if (!current) throw new Error('自定义圆环不存在')
      await rings.commitConfig(action.ringId, action[direction])
      historyIndex.value += delta
      dirty.value = true
    } catch (reason) {
      status.value = translate('TOKEN_RING_UNDO_FAILED')
    } finally {
      historyBusy.value = false
    }
  }

  async function applyBackgroundAction(action: Extract<HistoryAction, { kind: 'backgroundConfig' }>, direction: 'before' | 'after', delta: number) {
    historyBusy.value = true
    try {
      const { useTokenBackgroundStore } = await import('./token-backgrounds')
      const backgrounds = useTokenBackgroundStore()
      if (!backgrounds.descriptor(action.backgroundId)?.customConfig) throw new Error('Custom background does not exist')
      await backgrounds.commitConfig(action.backgroundId, action[direction])
      historyIndex.value += delta
      dirty.value = true
    } catch {
      status.value = translate('TOKEN_BACKGROUND_UNDO_FAILED')
    } finally {
      historyBusy.value = false
    }
  }

  function undo() {
    commitEdit()
    const action = history.value[historyIndex.value]
    if (!action || historyBusy.value) return
    if (action.kind === 'ringConfig') return void applyRingAction(action, 'before', -1)
    if (action.kind === 'backgroundConfig') return void applyBackgroundAction(action, 'before', -1)
    applySynchronousAction(action, 'before')
    historyIndex.value -= 1
    dirty.value = true
  }

  function redo() {
    commitEdit()
    const action = history.value[historyIndex.value + 1]
    if (!action || historyBusy.value) return
    if (action.kind === 'ringConfig') return void applyRingAction(action, 'after', 1)
    if (action.kind === 'backgroundConfig') return void applyBackgroundAction(action, 'after', 1)
    applySynchronousAction(action, 'after')
    historyIndex.value += 1
    dirty.value = true
  }

  function recordRingConfig(ringId: string, before: CustomRingConfig, after: CustomRingConfig) {
    if (!equal(before, after)) pushAction({ kind: 'ringConfig', ringId, before: clone(before), after: clone(after) })
  }

  function recordBackgroundConfig(backgroundId: string, before: CustomBackgroundConfig, after: CustomBackgroundConfig) {
    if (!equal(before, after)) pushAction({ kind: 'backgroundConfig', backgroundId, before: clone(before), after: clone(after) })
  }

  async function refreshProjects() {
    ;[projects.value, folders.value] = await Promise.all([listTokenProjects(), listTokenProjectFolders()])
  }
  async function addFolder(folder: string) {
    folders.value = await createTokenProjectFolder(folder)
    await refreshProjects()
  }
  function itemFromAsset(asset: LibraryRecord): TokenProjectItem {
    return { id: crypto.randomUUID(), assetId: asset.id, name: asset.name, mediaType: asset.mediaType, sourcePath: asset.path, style: createDefaultTokenVisualStyle() }
  }
  async function createFromAssets(assets: LibraryRecord[]) {
    const images = assets.filter((asset) => asset.mediaType.startsWith('image/'))
    if (!images.length) throw new Error(translate('TOKEN_SELECT_AT_LEAST_ONE_ASSET'))
    const now = new Date().toISOString()
    const next: TokenProjectDocument = { schemaVersion: 1, id: crypto.randomUUID(), title: untitledTokenTitle(), items: images.map(itemFromAsset), exportSettings: createDefaultTokenExportSettings(), createdAt: now, updatedAt: now }
    const payload = await createTokenProject(next)
    loadPayload(payload.document, payload.resolvedSources)
    workspace.openTokenEditor()
    await refreshProjects()
    status.value = translate('TOKEN_PROJECT_CREATED', { name: payload.document.title })
  }
  function addAssets(assets: LibraryRecord[]) {
    if (!document.value) return 0
    const existing = new Set(items.value.map((item) => item.assetId).filter(Boolean))
    const added = assets.filter((asset) => asset.mediaType.startsWith('image/') && !existing.has(asset.id))
    if (!added.length) return 0
    const before = itemState()
    const nextItems = added.map(itemFromAsset)
    document.value.items.push(...nextItems)
    for (const item of nextItems) resolvedSources.value[item.id] = item.sourcePath
    checkedItemIds.value.push(...nextItems.map((item) => item.id))
    selectedItemId.value = nextItems[0]?.id
    pushItems(before)
    return nextItems.length
  }
  function removeItem(itemId: string) {
    if (!document.value) return
    const before = itemState()
    document.value.items = items.value.filter((item) => item.id !== itemId)
    delete resolvedSources.value[itemId]
    checkedItemIds.value = checkedItemIds.value.filter((id) => id !== itemId)
    if (selectedItemId.value === itemId) selectedItemId.value = items.value[0]?.id
    pushItems(before)
  }
  function loadPayload(next: TokenProjectDocument, sources: Record<string, string>) {
    const normalized = clone(next)
    normalized.items = normalized.items.map((item) => {
      const customRing = item.style.ringStyle?.startsWith('asset:')
        ? useTokenRingStore().descriptor(item.style.ringStyle)?.customConfig
        : undefined
      return {
        ...item,
        style: normalizeTokenVisualStyle(item.style, customRing?.innerRadius ?? item.style.ringInnerRadius),
      }
    })
    document.value = normalized
    resolvedSources.value = { ...sources }
    selectedItemId.value = next.items[0]?.id
    checkedItemIds.value = next.items.map((item) => item.id)
    history.value = []
    historyIndex.value = -1
    pendingStyle = undefined
    pendingExport = undefined
    dirty.value = false
  }
  async function open(projectId: string) {
    const payload = await openTokenProject(projectId)
    loadPayload(payload.document, payload.resolvedSources)
    workspace.openTokenEditor()
    status.value = translate('TOKEN_PROJECT_OPENED', { name: payload.document.title })
  }
  async function save() {
    if (!document.value) return
    commitEdit()
    const selected = selectedItemId.value
    const checked = [...checkedItemIds.value]
    document.value.updatedAt = new Date().toISOString()
    const payload = await saveTokenProject(document.value.id, document.value)
    const normalized = clone(payload.document)
    normalized.items = normalized.items.map((item) => ({
      ...item,
      style: normalizeTokenVisualStyle(item.style, item.style.ringInnerRadius),
    }))
    document.value = normalized
    resolvedSources.value = { ...payload.resolvedSources }
    selectedItemId.value = selected
    checkedItemIds.value = checked
    repairRuntimeState()
    dirty.value = false
    await refreshProjects()
    status.value = translate('TOKEN_PROJECT_SAVED', { name: payload.document.title })
  }
  async function renameCurrentProject(title: string) {
    if (!document.value) return
    const nextTitle = title.trim()
    if (!nextTitle || nextTitle === document.value.title) return
    await renameTokenProject(document.value.id, nextTitle)
    document.value.title = nextTitle
    document.value.updatedAt = new Date().toISOString()
    await refreshProjects()
    status.value = translate('TOKEN_PROJECT_RENAMED', { name: nextTitle })
  }
  async function close(options: { save?: boolean } = {}) {
    if (options.save !== false && dirty.value) await save()
    workspace.openManager()
  }
  function applyCurrentStyleToChecked() {
    const current = selectedItem.value
    if (!current) return
    const changes: StyleChange[] = []
    const checked = new Set(checkedItemIds.value)
    for (const item of items.value) {
      if (!checked.has(item.id) || equal(item.style, current.style)) continue
      changes.push({ itemId: item.id, before: clone(item.style), after: clone(current.style) })
      item.style = clone(current.style)
    }
    if (changes.length) pushAction({ kind: 'style', changes })
  }
  function toggleAllChecked() {
    const before = itemState()
    const allChecked = items.value.length > 0 && items.value.every((item) => checkedItemIds.value.includes(item.id))
    checkedItemIds.value = allChecked ? [] : items.value.map((item) => item.id)
    pushItems(before)
  }
  function clearItems() {
    if (!document.value || !items.value.length) return
    const before = itemState()
    document.value.items = []
    resolvedSources.value = {}
    selectedItemId.value = undefined
    checkedItemIds.value = []
    pushItems(before)
  }
  function resetSelectedStyle() {
    const item = selectedItem.value
    if (!item) return
    const before = clone(item.style)
    item.style = createDefaultTokenVisualStyle()
    if (!equal(before, item.style)) pushAction({ kind: 'style', changes: [{ itemId: item.id, before, after: clone(item.style) }] })
  }
  function replaceMissingRingReferences(availableRingStyles: ReadonlySet<string>) {
    const changes: StyleChange[] = []
    for (const item of items.value) {
      if (!item.style.ringStyle.startsWith('asset:') || availableRingStyles.has(item.style.ringStyle)) continue
      const before = clone(item.style)
      item.style.ringStyle = 'solid'
      changes.push({ itemId: item.id, before, after: clone(item.style) })
    }
    if (changes.length) pushAction({ kind: 'style', changes })
    return changes.length
  }
  function replaceMissingBackgroundReferences(availableBackgroundStyles: ReadonlySet<string>) {
    const changes: StyleChange[] = []
    for (const item of items.value) {
      if (!item.style.backgroundStyle.startsWith('asset:') || availableBackgroundStyles.has(item.style.backgroundStyle)) continue
      const before = clone(item.style)
      item.style.backgroundStyle = 'solid'
      changes.push({ itemId: item.id, before, after: clone(item.style) })
    }
    if (changes.length) pushAction({ kind: 'style', changes })
    return changes.length
  }
  async function deleteEntries(entries: { ids: string[]; folders: string[] }) {
    folders.value = await deleteTokenProjectEntries(entries)
    await refreshProjects()
  }

  return {
    projects, folders, document, resolvedSources, selectedItemId, checkedItemIds, status, dirty,
    items, selectedItem, canUndo, canRedo, historyBusy, refreshProjects, addFolder, createFromAssets,
    addAssets, removeItem, open, save, renameCurrentProject, close, updateVisualStyle,
    updateExportSetting, beginEdit, commitEdit, undo, redo, recordRingConfig, recordBackgroundConfig,
    applyCurrentStyleToChecked, toggleAllChecked, clearItems, resetSelectedStyle,
    replaceMissingRingReferences, replaceMissingBackgroundReferences, deleteEntries, visualStyleKeys: TOKEN_VISUAL_STYLE_KEYS,
    exportSettingKeys: TOKEN_EXPORT_SETTING_KEYS,
  }
})
