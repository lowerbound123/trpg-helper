import { isEditableTarget } from '@/lib/dom'

export type AppShortcutContext = {
  isEditorView: () => boolean
  hasSelectedLayer: () => boolean
  saveProject: () => void
  undo: () => void
  redo: () => void
  deleteLayer: () => void
  setTool: (tool: 'select' | 'brush' | 'eraser') => void
  setRailTab: (tab: 'assets' | 'fonts' | 'graph' | 'layers') => void
  addText: () => void
  moveLayerUp: () => void
  moveLayerDown: () => void
}

export function createAppShortcutHandler(context: AppShortcutContext) {
  return (event: KeyboardEvent) => {
    if (!context.isEditorView()) return
    const key = event.key.toLowerCase()
    const command = event.metaKey || event.ctrlKey
    if (command && key === 's') {
      event.preventDefault()
      context.saveProject()
      return
    }
    if (command && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) context.redo()
      else context.undo()
      return
    }
    if (isEditableTarget(event.target)) return
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!context.hasSelectedLayer()) return
      event.preventDefault()
      context.deleteLayer()
      return
    }
    if (command || event.altKey || event.shiftKey) return

    // Layer reordering via arrow keys (requires a selected layer)
    if (event.key === 'ArrowUp') {
      if (!context.hasSelectedLayer()) return
      event.preventDefault()
      context.moveLayerUp()
      return
    }
    if (event.key === 'ArrowDown') {
      if (!context.hasSelectedLayer()) return
      event.preventDefault()
      context.moveLayerDown()
      return
    }

    if (key === 's') context.setTool('select')
    else if (key === 'b') context.setTool('brush')
    else if (key === 'e') context.setTool('eraser')
    else if (key === 'l') context.setRailTab('layers')
    else if (key === 'a') context.setRailTab('assets')
    else if (key === 'f') context.setRailTab('fonts')
    else if (key === 'g') context.setRailTab('graph')
    else if (key === 't') context.addText()
    else return
    event.preventDefault()
  }
}
