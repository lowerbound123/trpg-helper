import type { Ref } from 'vue'

import { appendDebugLog, fileUrl, fontRecordFamily, saveFontPreview, type LibraryIndex, type LibraryRecord } from '@/lib/backend'
import { generateFontPreviewDataUrl } from '@/lib/font-preview'

function fontFamily(font?: LibraryRecord) {
  return fontRecordFamily(font)
}

function logText(message: string, data?: Record<string, unknown>) {
  void appendDebugLog('text', message, data)
}

export function createFontStore(deps: {
  library: Ref<LibraryIndex>
}) {
  function scheduleFontPreviews() {
    const run = () => { void ensureFontPreviews() }
    const win = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number }
    if (win.requestIdleCallback) win.requestIdleCallback(run, { timeout: 1500 })
    else window.setTimeout(run, 250)
  }

  async function loadFont(font: LibraryRecord) {
    if (!font.path || !('FontFace' in window)) {
      logText('font-load-skipped', {
        id: font.id,
        name: font.name,
        path: font.path,
        hasFontFace: 'FontFace' in window,
      })
      return
    }
    const family = fontFamily(font)
    const source = fileUrl(font.path)
    logText('font-load-start', {
      id: font.id,
      name: font.name,
      family,
      recordFamily: font.fontFamily,
      mediaType: font.mediaType,
      source,
    })
    try {
      const face = new FontFace(family, `url("${source}")`)
      await face.load()
      globalThis.document.fonts.add(face)
      logText('font-load-success', {
        id: font.id,
        name: font.name,
        family,
        recordFamily: font.fontFamily,
        status: face.status,
        check: globalThis.document.fonts.check(`16px "${family}"`),
      })
    } catch (error) {
      logText('font-load-failed', {
        id: font.id,
        name: font.name,
        family,
        error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
      })
      throw error
    }
  }

  async function createFontPreview(font: LibraryRecord) {
    try {
      const dataUrl = await generateFontPreviewDataUrl(font)
      deps.library.value = await saveFontPreview(font.id, dataUrl)
      logText('font-preview-saved', {
        id: font.id,
        name: font.name,
        dataUrlBytes: Math.round((dataUrl.length * 3) / 4),
      })
    } catch (error) {
      logText('font-preview-failed', {
        id: font.id,
        name: font.name,
        error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      })
    }
  }

  async function ensureFontPreviews() {
    for (const font of deps.library.value.fonts) {
      if (font.thumbnailPath) continue
      await createFontPreview(font)
    }
  }

  return {
    scheduleFontPreviews,
    loadFont,
    createFontPreview,
    ensureFontPreviews,
  }
}
