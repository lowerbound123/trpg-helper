import type { Ref } from 'vue'

import type { LibraryRecord } from '@/lib/backend'
import type { ShapeKind } from '@/lib/handout'
import { shapeItems } from '@/lib/shape-items'
import { useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type DebugLog = (message: string, data?: Record<string, unknown>) => void

export function useCanvasDrop(options: {
  editor: EditorStore
  fontFamily: (font: LibraryRecord) => string
  canvasPointFromClient: (clientX: number, clientY: number) => { x: number; y: number }
  stageFrameRef: Ref<HTMLElement | undefined>
  imageSize: (record: LibraryRecord) => Promise<{ width: number; height: number }>
  updateTransformer: () => void
  draggedFontId: Ref<string>
  draggedAssetId: Ref<string>
  draggedShapeKind: Ref<ShapeKind | undefined>
  assetRecordFromDragPath: (path: string) => LibraryRecord | undefined
  fontRecordFromDragPath: (path: string) => LibraryRecord | undefined
  createFontTextOnCanvas: (font: LibraryRecord, position?: { x?: number; y?: number }) => void
  addShapeToCanvas: (shape: ShapeKind, position?: { x?: number; y?: number }) => void
  logText: DebugLog
  logUpload: DebugLog
}) {
  const { editor, fontFamily, canvasPointFromClient, stageFrameRef, imageSize, updateTransformer, draggedFontId, draggedAssetId, draggedShapeKind, assetRecordFromDragPath, fontRecordFromDragPath, createFontTextOnCanvas, addShapeToCanvas, logText, logUpload } = options

  let lastFontDragOverLogAt = 0

  function pointInsideStageFrame(clientX: number, clientY: number) {
    const rect = stageFrameRef.value?.getBoundingClientRect()
    if (!rect) return false
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  }

  function handleCanvasDrop(event: DragEvent) {
    event.preventDefault()
    // NOTE: do NOT stopPropagation() — the document-level font drop
    // handlers serve as a fallback when dataTransfer types are unavailable.
    const point = canvasPointFromClient(event.clientX, event.clientY)

    const fontId = event.dataTransfer?.getData('application/x-handout-font') || draggedFontId.value
    const fontName = event.dataTransfer?.getData('application/x-handout-font-name') || event.dataTransfer?.getData('text/plain') || ''
    const fontFamilyName = event.dataTransfer?.getData('application/x-handout-font-family') || ''
    logText('canvas-drop', {
      fontId, fontName, fontFamilyName,
      draggedFontId: draggedFontId.value,
      types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
      position: point,
    })
    const font = editor.resolveFont(fontId)
      || editor.library.fonts.find((item) => item.name === fontName || fontFamily(item) === fontName || fontFamily(item) === fontFamilyName)
    logText('canvas-drop-font-resolved', { resolved: Boolean(font), fontId: font?.id, fontName: font?.name })
    if (font) {
      createFontTextOnCanvas(font, point)
      draggedFontId.value = ''
      return
    }

    // Fallback: check VueFinder "items" drag data for font records
    const itemsData = event.dataTransfer?.getData('items')
    if (itemsData) {
      try {
        const paths = JSON.parse(itemsData) as string[]
        const vueFinderFont = paths.map((path) => fontRecordFromDragPath(path)).find(Boolean)
        if (vueFinderFont) {
          logText('canvas-drop-vuefinder-font-resolved', { fontId: vueFinderFont.id, fontName: vueFinderFont.name })
          createFontTextOnCanvas(vueFinderFont, point)
          return
        }
      } catch (error) {
        logUpload('failed to parse vuefinder drag items for font', { error, itemsData })
      }
    }

    const shape = (event.dataTransfer?.getData('application/x-handout-shape') || draggedShapeKind.value) as ShapeKind | ''
    if (shape && shapeItems.some((item) => item.kind === shape)) {
      addShapeToCanvas(shape, point)
      draggedShapeKind.value = undefined
      return
    }

    let asset = editor.resolveAsset(event.dataTransfer?.getData('application/x-handout-asset') || draggedAssetId.value)
    if (!asset) {
      const items = event.dataTransfer?.getData('items')
      if (items) {
        try {
          const paths = JSON.parse(items) as string[]
          asset = paths.map((path) => assetRecordFromDragPath(path)).find(Boolean)
        } catch (error) {
          logUpload('failed to parse vuefinder drag items', { error, items })
        }
      }
    }
    if (!asset) return
    void imageSize(asset).then((size) => {
      editor.addLayerFromAssetAt(asset, point.x, point.y, size)
      void updateTransformer()
    })
    draggedAssetId.value = ''
  }

  function handleCanvasDragOver(event: DragEvent) {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  function handleDocumentFontDragOver(event: DragEvent) {
    if (!draggedFontId.value || !pointInsideStageFrame(event.clientX, event.clientY)) {
      if (draggedFontId.value) logText('font-document-dragover-outside-stage', { client: { x: event.clientX, y: event.clientY } })
      return
    }
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    const now = window.performance.now()
    if (now - lastFontDragOverLogAt > 300) {
      lastFontDragOverLogAt = now
      logText('font-document-dragover', {
        draggedFontId: draggedFontId.value,
        types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
        client: { x: event.clientX, y: event.clientY },
        canvas: canvasPointFromClient(event.clientX, event.clientY),
      })
    }
  }

  function handleDocumentFontDrop(event: DragEvent) {
    if (!draggedFontId.value || !pointInsideStageFrame(event.clientX, event.clientY)) return
    event.preventDefault()
    const font = editor.resolveFont(draggedFontId.value)
    logText('font-document-drop', {
      draggedFontId: draggedFontId.value,
      resolved: Boolean(font),
      client: { x: event.clientX, y: event.clientY },
      canvas: canvasPointFromClient(event.clientX, event.clientY),
    })
    if (!font) return
    createFontTextOnCanvas(font, canvasPointFromClient(event.clientX, event.clientY))
    draggedFontId.value = ''
  }

  return {
    handleCanvasDrop,
    handleCanvasDragOver,
    handleDocumentFontDragOver,
    handleDocumentFontDrop,
  }
}
