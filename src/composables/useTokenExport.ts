import { Channel, invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { computed, reactive } from 'vue'

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

export type TokenExportScope = 'current' | 'checked' | 'all'

export function useTokenExport() {
  const token = useTokenStore()
  const editor = useEditorStore()
  const progress = reactive({ running: false, completed: 0, total: 0, phase: '', error: '' })
  const percentage = computed(() => progress.total ? Math.round(progress.completed / progress.total * 100) : 0)

  function paramsForItem(item: TokenProjectItem): TokenParams {
    const customAssetId = item.style.ringStyle.startsWith('asset:')
      ? item.style.ringStyle.slice('asset:'.length)
      : undefined
    const customAsset = customAssetId ? editor.resolveAsset(customAssetId) : undefined
    const ring = customAsset?.tokenRing
    const missingCustomRing = Boolean(customAssetId && (!customAsset || !ring))
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
      ringImageScaleX: ring ? ring.assetScale * 100 : 100,
      ringImageScaleY: ring ? ring.assetScale * 100 : 100,
      ringImageOffsetX: ring?.offsetX ?? 0,
      ringImageOffsetY: ring?.offsetY ?? 0,
      ringAssetPath: customAsset?.path,
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
      return
    }
    if (message.event === 'itemFinished') {
      progress.completed = message.data.completed
      return
    }
    progress.completed = message.data.completed
    progress.total = message.data.total
  }

  async function exportScope(scope: TokenExportScope) {
    if (progress.running) return
    const selected = itemsForScope(scope)
    if (!selected.length) return
    const outputDir = await open({ directory: true, multiple: false, title: '选择 Token 导出目录' })
    if (!outputDir || Array.isArray(outputDir)) return
    const items: TokenBatchGenerateItem[] = selected.flatMap((item) => {
      const source = token.resolvedSources[item.id] || item.sourcePath
      return source ? [{ input: source, params: paramsForItem(item) }] : []
    })
    progress.running = true
    progress.completed = 0
    progress.total = items.length
    progress.phase = 'preparing'
    progress.error = ''
    const startedAt = performance.now()
    const onProgress = new Channel<TokenExportProgressEvent>()
    onProgress.onmessage = handleProgress
    try {
      const results = await invoke<TokenGenerateResult[]>('generate_token_batch', { items, outputDir, onProgress })
      const failures = results.filter((result) => !result.success)
      token.status = failures.length
        ? `Exported ${results.length - failures.length}/${results.length}; ${failures.length} failed`
        : `Exported ${results.length} token${results.length === 1 ? '' : 's'}`
      void appendDebugLog('speed', 'token-export-complete', {
        scope,
        count: results.length,
        failures: failures.length,
        durationMs: performance.now() - startedAt,
      })
      void appendDebugLog('render', 'token-export-results', { scope, outputDir, results })
      return results
    } catch (error) {
      progress.error = String(error)
      token.status = `Token export failed: ${String(error)}`
      void appendDebugLog('token', 'token-export-failed', { scope, error: String(error) })
      throw error
    } finally {
      progress.running = false
    }
  }

  return { progress, percentage, exportScope }
}
