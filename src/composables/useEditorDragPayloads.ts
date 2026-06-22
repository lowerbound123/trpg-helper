import { ref } from 'vue'

import type { LibraryRecord } from '@/lib/backend'
import type { ShapeKind } from '@/lib/handout'

type TextLog = (message: string, data?: Record<string, unknown>) => void

export function useEditorDragPayloads(options: {
  fontFamily: (font: LibraryRecord) => string
  logText: TextLog
}) {
  const draggedAssetId = ref('')
  const draggedFontId = ref('')
  const draggedShapeKind = ref<ShapeKind>()
  const fontDragStarted = ref(false)

  function startAssetDrag(asset: LibraryRecord, event: DragEvent) {
    draggedAssetId.value = asset.id
    event.dataTransfer?.setData('application/x-handout-asset', asset.id)
    event.dataTransfer?.setData('text/plain', asset.name)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  }

  function clearAssetDrag() {
    draggedAssetId.value = ''
  }

  function startFontDrag(font: LibraryRecord, event: DragEvent) {
    draggedFontId.value = font.id
    fontDragStarted.value = true
    event.dataTransfer?.setData('application/x-handout-font', font.id)
    event.dataTransfer?.setData('application/x-handout-font-name', font.name)
    event.dataTransfer?.setData('application/x-handout-font-family', options.fontFamily(font))
    event.dataTransfer?.setData('text/plain', font.name)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
    console.log('[font-drag] startFontDrag — id:', font.id, 'name:', font.name, 'dataTransfer.types:', event.dataTransfer?.types)
    options.logText('font-drag-start', {
      fontId: font.id,
      name: font.name,
      family: options.fontFamily(font),
      types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
    })
  }

  function prepareFontDrag(font: LibraryRecord) {
    draggedFontId.value = font.id
    console.log('[font-drag] prepareFontDrag — draggedFontId set to:', font.id)
    options.logText('font-drag-prepare', {
      fontId: font.id,
      name: font.name,
      family: options.fontFamily(font),
    })
  }

  function clearFontDrag() {
    window.setTimeout(() => {
      options.logText('font-drag-clear', { draggedFontId: draggedFontId.value })
      draggedFontId.value = ''
      fontDragStarted.value = false
    }, 50)
  }

  function startShapeDrag(shape: ShapeKind, event: DragEvent) {
    draggedShapeKind.value = shape
    event.dataTransfer?.setData('application/x-handout-shape', shape)
    event.dataTransfer?.setData('text/plain', shape)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  }

  function clearShapeDrag() {
    draggedShapeKind.value = undefined
  }

  return {
    draggedAssetId,
    draggedFontId,
    draggedShapeKind,
    fontDragStarted,
    startAssetDrag,
    clearAssetDrag,
    startFontDrag,
    prepareFontDrag,
    clearFontDrag,
    startShapeDrag,
    clearShapeDrag,
  }
}
