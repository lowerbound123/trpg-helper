import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useEditorStore } from './editor'

describe('editor multi-selection state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('supports additive selection and batch patching selected layers', () => {
    const editor = useEditorStore()
    editor.addText()
    const first = editor.selectedLayerId!
    editor.addText()
    const second = editor.selectedLayerId!

    editor.selectLayer(first)
    editor.toggleLayerSelection(second)
    editor.patchSelectedLayers({ visible: false, rotation: 15 })

    expect(editor.selectedLayerIds).toEqual([first, second])
    expect(editor.document.layers.map((layer) => layer.visible)).toEqual([false, false])
    expect(editor.document.layers.map((layer) => layer.rotation)).toEqual([15, 15])
  })

  it('deletes all selected layers and clears selection', () => {
    const editor = useEditorStore()
    editor.addText()
    const first = editor.selectedLayerId!
    editor.addText()
    const second = editor.selectedLayerId!

    editor.setLayerSelection([first, second])
    editor.deleteSelectedLayer()

    expect(editor.document.layers).toEqual([])
    expect(editor.selectedLayerIds).toEqual([])
    expect(editor.selectedLayerId).toBeUndefined()
  })

  it('patches one selected layer effect without overwriting other effect fields', () => {
    const editor = useEditorStore()
    editor.addText()
    const first = editor.selectedLayerId!
    editor.addText()
    const second = editor.selectedLayerId!
    editor.patchLayer(first, { effects: { brightness: 10, contrast: 1, saturation: 2, blur: 3 } })
    editor.patchLayer(second, { effects: { brightness: 20, contrast: 4, saturation: 5, blur: 6 } })

    editor.setLayerSelection([first, second])
    editor.patchSelectedLayerEffect('brightness', 42)

    expect(editor.document.layers[0].effects).toEqual({ brightness: 42, contrast: 1, saturation: 2, blur: 3 })
    expect(editor.document.layers[1].effects).toEqual({ brightness: 42, contrast: 4, saturation: 5, blur: 6 })
  })
})
