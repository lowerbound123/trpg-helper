export type EditorTool = 'select' | 'brush' | 'eraser' | 'polygon'

export function isPaintEditorTool(tool: EditorTool) {
  return tool === 'brush' || tool === 'eraser'
}
