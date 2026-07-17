import { Channel, invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { computed, reactive } from 'vue'
import { toast } from 'vue-sonner'

import { appendDebugLog } from '@/lib/backend'
import { appConfiguration } from '@/lib/configuration'
import type {
  TokenBatchGenerateItem,
  TokenExportProgressEvent,
  TokenGenerateResult,
  TokenParams,
  TokenProjectItem,
} from '@/lib/token'
import { useEditorStore } from '@/stores/editor'
import { useTokenStore } from '@/stores/token'
import { translate } from '@/i18n'

export type TokenExportScope = 'current' | 'checked' | 'all'

export function useTokenExport() {
  const token = useTokenStore()
  const editor = useEditorStore()
  const progress = reactive({
    running: false,
    completed: 0,
    total: 0,
    phase: '',
    currentInput: '',
    itemProgress: 0,
    successCount: 0,
    failureCount: 0,
    status: 'idle' as 'idle' | 'running' | 'finished' | 'failed',
    error: '',
  })
  const percentage = computed(() => progress.total
    ? Math.round((progress.completed + progress.itemProgress) / progress.total * 100)
    : 0)

  function paramsForItem(item: TokenProjectItem): TokenParams {
    const customAssetId = item.style.ringStyle.startsWith('asset:')
      ? item.style.ringStyle.slice('asset:'.length)
      : undefined
    const customAsset = customAssetId ? editor.resolveAsset(customAssetId) : undefined
    const ring = customAsset?.tokenRing
    const missingCustomRing = Boolean(customAssetId && (!customAsset || !ring))
    const backgroundAssetId = item.style.backgroundStyle.startsWith('asset:')
      ? item.style.backgroundStyle.slice('asset:'.length)
      : undefined
    const backgroundAsset = backgroundAssetId ? editor.resolveAsset(backgroundAssetId) : undefined
    const customBackground = backgroundAsset?.tokenBackground
    const missingCustomBackground = Boolean(backgroundAssetId && (!backgroundAsset || !customBackground))
    if (missingCustomRing) {
      void appendDebugLog('token', 'token-export-custom-ring-missing', {
        itemId: item.id,
        assetId: customAssetId,
        fallback: 'solid',
      })
    }
    return {
      size: appConfiguration.token.defaults.designSize,
      ...item.style,
      ringStyle: missingCustomRing ? 'solid' : item.style.ringStyle,
      ringInnerRadius: ring?.innerRadius ?? item.style.ringInnerRadius,
      ringOuterRadius: ring?.outerRadius ?? item.style.ringOuterRadius,
      ...token.document!.exportSettings,
      ringImageScaleX: ring?.imageScaleX ?? 100,
      ringImageScaleY: ring?.imageScaleY ?? 100,
      ringImageOffsetX: ring?.imageOffsetX ?? 0,
      ringImageOffsetY: ring?.imageOffsetY ?? 0,
      ringAssetPath: customAsset?.path,
      backgroundStyle: missingCustomBackground ? 'solid' : item.style.backgroundStyle,
      backgroundImageOffsetX: customBackground?.imageOffsetX ?? 0,
      backgroundImageOffsetY: customBackground?.imageOffsetY ?? 0,
      backgroundAssetPath: backgroundAsset?.path,
    }
  }

  function itemsForScope(scope: TokenExportScope) {
    if (scope === 'current') return token.selectedItem ? [token.selectedItem] : []
    if (scope === 'checked') {
      const checked = new Set(token.checkedItemIds)
      return token.items.filter((item) => checked.has(item.id))
    }
    return token.items
  }

  function handleProgress(message: TokenExportProgressEvent) {
    if (message.event === 'started') {
      progress.total = message.data.total
      return
    }
    if (message.event === 'itemProgress') {
      progress.phase = message.data.phase
      progress.currentInput = message.data.input
      progress.itemProgress = Math.max(0, Math.min(1, message.data.itemProgress))
      return
    }
    if (message.event === 'itemFinished') {
      progress.completed = message.data.completed
      progress.itemProgress = 0
      if (message.data.success) progress.successCount += 1
      else progress.failureCount += 1
      return
    }
    progress.completed = message.data.completed
    progress.total = message.data.total
    progress.successCount = message.data.successCount
    progress.failureCount = message.data.failureCount
    progress.status = 'finished'
  }

  async function exportScope(scope: TokenExportScope) {
    if (progress.running) return
    const selected = itemsForScope(scope)
    if (!selected.length) return
    const outputDir = await open({ directory: true, multiple: false, title: translate('TOKEN_EXPORT_DIRECTORY_TITLE') })
    if (!outputDir || Array.isArray(outputDir)) return
    const missingResults: TokenGenerateResult[] = []
    const items: TokenBatchGenerateItem[] = selected.flatMap((item) => {
      const source = token.resolvedSources[item.id] || item.sourcePath
      if (source) return [{ input: source, params: paramsForItem(item) }]
      missingResults.push({ success: false, outputPath: '', error: translate('TOKEN_EXPORT_MISSING_SOURCE', { name: item.name }) })
      return []
    })
    progress.running = true
    progress.completed = 0
    progress.total = selected.length
    progress.phase = 'preparing'
    progress.currentInput = ''
    progress.itemProgress = 0
    progress.successCount = 0
    progress.failureCount = 0
    progress.status = 'running'
    progress.error = ''
    const startedAt = performance.now()
    const onProgress = new Channel<TokenExportProgressEvent>()
    onProgress.onmessage = handleProgress
    try {
      const generated = items.length
        ? await invoke<TokenGenerateResult[]>('generate_token_batch', { items, outputDir, onProgress })
        : []
      const results = [...generated, ...missingResults]
      const failures = results.filter((result) => !result.success)
      progress.completed = results.length
      progress.total = selected.length
      progress.itemProgress = 0
      progress.successCount = results.length - failures.length
      progress.failureCount = failures.length
      progress.status = 'finished'
      token.status = failures.length
        ? translate('TOKEN_EXPORT_PARTIAL', { success: results.length - failures.length, total: results.length, failure: failures.length })
        : translate('TOKEN_EXPORT_SUCCESS', { count: results.length })
      void appendDebugLog('speed', 'token-export-complete', {
        scope,
        count: results.length,
        failures: failures.length,
        durationMs: performance.now() - startedAt,
      })
      void appendDebugLog('render', 'token-export-results', { scope, outputDir, results })
      if (failures.length) toast.error(translate('TOKEN_EXPORT_PARTIAL', { success: results.length - failures.length, total: results.length, failure: failures.length }))
      else toast.success(translate('TOKEN_EXPORT_SUCCESS', { count: results.length }))
      return results
    } catch (error) {
      progress.status = 'failed'
      progress.error = String(error)
      token.status = translate('TOKEN_EXPORT_FAILED')
      void appendDebugLog('token', 'token-export-failed', { scope, error: String(error) })
      toast.error(translate('TOKEN_EXPORT_FAILED'))
      return selected.map((item) => ({ success: false, outputPath: '', error: `${item.name}: ${String(error)}` }))
    } finally {
      progress.running = false
    }
  }

  return { progress, percentage, exportScope }
}
