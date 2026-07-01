import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useEditorStore } from './editor'
import { maskTransformFromLayer, matrixNearlyEqual } from '@/lib/mask-geometry'

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

  it('keeps the existing rotation compensation when flipping selected layers horizontally', () => {
    const editor = useEditorStore()
    editor.addText()
    const layerId = editor.selectedLayerId!
    editor.patchSelectedLayer({ rotation: 30 })

    editor.toggleSelectedLayersFlipX()

    expect(editor.document.layers.find((layer) => layer.id === layerId)).toMatchObject({
      flipX: true,
      rotation: 330,
    })
  })

  it('syncs selected layer transform changes into the layer mask matrix', () => {
    const editor = useEditorStore()
    editor.addText()
    const layerId = editor.selectedLayerId!
    editor.addMaskToLayer(layerId)
    const before = editor.document.layers.find((layer) => layer.id === layerId)!
    expect(before.mask?.width).toBe(before.width)
    expect(before.mask?.height).toBe(before.height)
    editor.patchSelectedLayer({
      x: before.x + 40,
      y: before.y + 20,
      rotation: before.rotation + 30,
    })

    const after = editor.document.layers.find((layer) => layer.id === layerId)!

    expect(after.mask).toBeTruthy()
    expect(matrixNearlyEqual(after.mask!.matrix, maskTransformFromLayer(after))).toBe(true)
  })

  it('records mask brush strokes as dirty tiles instead of replacing the whole mask image', async () => {
    const editor = useEditorStore()
    editor.addText()
    const layerId = editor.selectedLayerId!
    editor.addMaskToLayer(layerId)
    const layer = editor.document.layers.find((item) => item.id === layerId)!
    const beforePulse = editor.maskChangePulse

    await editor.paintMask(layer.mask!, {
      id: 'mask-stroke-1',
      points: [10, 10, 20, 20],
      strokeWidth: 8,
      color: '#000000',
      tension: 0,
      mode: 'eraser',
      eraserOpacity: 1,
    })

    const updated = editor.document.layers.find((item) => item.id === layerId)!
    expect(updated.mask?.strokes.map((stroke) => stroke.id)).toEqual(['mask-stroke-1'])
    expect(Object.keys(updated.mask?.tiles ?? {})).toEqual(['0:0'])
    expect(updated.mask?.version).toBe(2)
    expect(editor.maskDataUrls[updated.mask!.id]).toBeUndefined()
    expect(editor.maskChangePulse).toMatchObject({
      kind: 'layer',
      layerId,
      maskId: updated.mask!.id,
      version: 2,
      reason: 'stroke',
    })
    expect(editor.maskChangePulse.id).toBeGreaterThan(beforePulse.id)
  })

  it('records mask shape operations as single-channel mask edits', async () => {
    const editor = useEditorStore()
    editor.addText()
    const layerId = editor.selectedLayerId!
    editor.addMaskToLayer(layerId)
    const layer = editor.document.layers.find((item) => item.id === layerId)!
    const beforePulse = editor.maskChangePulse

    await editor.addMaskShape(layer.mask!, {
      id: 'mask-shape-1',
      shape: 'rect',
      x: 10,
      y: 12,
      width: 80,
      height: 60,
      value: 0,
      strokeWidth: 3,
    })

    const updated = editor.document.layers.find((item) => item.id === layerId)!
    expect(updated.mask?.shapes).toEqual([expect.objectContaining({
      id: 'mask-shape-1',
      shape: 'rect',
      value: 0,
    })])
    expect(updated.mask?.operations).toEqual([expect.objectContaining({
      id: 'mask-shape-1',
      kind: 'shape',
    })])
    expect(updated.mask?.version).toBe(2)
    expect(editor.maskDataUrls[updated.mask!.id]).toBeUndefined()
    expect(editor.maskChangePulse).toMatchObject({
      kind: 'layer',
      layerId,
      maskId: updated.mask!.id,
      version: 2,
      reason: 'shape',
    })
    expect(editor.maskChangePulse.id).toBeGreaterThan(beforePulse.id)
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

  it('auto-creates a paint layer for the first stroke and undoes the stroke as one step', () => {
    const editor = useEditorStore()

    editor.appendStrokeToPaintLayer({
      id: 'stroke-1',
      points: [10, 12, 20, 24],
      strokeWidth: 6,
      color: '#111827',
      tension: 0.35,
      mode: 'brush',
    })

    expect(editor.document.layers).toHaveLength(1)
    expect(editor.document.layers[0]).toMatchObject({
      type: 'paint',
      strokes: [{ id: 'stroke-1' }],
    })
    expect(editor.selectedLayerId).toBe(editor.document.layers[0].id)

    editor.undo()
    expect(editor.document.layers).toEqual([])
  })

  it('adds a custom polygon shape from normalized layer input', () => {
    const editor = useEditorStore()

    editor.addPolygon({
      shape: 'polygon',
      x: 50,
      y: 70,
      width: 80,
      height: 90,
      polygonPoints: [
        { x: 0, y: 0 },
        { x: 80, y: 20 },
        { x: 30, y: 90 },
      ],
    })

    expect(editor.selectedLayerId).toBe(editor.document.layers[0].id)
    expect(editor.document.layers[0]).toMatchObject({
      type: 'shape',
      shape: 'polygon',
      x: 50,
      y: 70,
      width: 80,
      height: 90,
      polygonPoints: [
        { x: 0, y: 0 },
        { x: 80, y: 20 },
        { x: 30, y: 90 },
      ],
    })
  })

  it('appends brush and eraser strokes to the selected paint layer', () => {
    const editor = useEditorStore()
    editor.addPaint()
    const paintId = editor.selectedLayerId!

    editor.appendStrokeToPaintLayer({
      id: 'stroke-1',
      points: [0, 0, 10, 10],
      strokeWidth: 4,
      color: '#000000',
      tension: 0,
      mode: 'brush',
    })
    editor.appendStrokeToPaintLayer({
      id: 'stroke-2',
      points: [5, 5, 8, 8],
      strokeWidth: 10,
      color: '#000000',
      tension: 0,
      mode: 'eraser',
    })

    expect(editor.document.layers).toHaveLength(1)
    expect(editor.document.layers[0].id).toBe(paintId)
    expect(editor.document.layers[0]).toMatchObject({
      type: 'paint',
      strokes: [
        { id: 'stroke-1', mode: 'brush' },
        { id: 'stroke-2', mode: 'eraser' },
      ],
    })

    editor.undo()
    expect(editor.document.layers[0]).toMatchObject({
      type: 'paint',
      strokes: [{ id: 'stroke-1' }],
    })
  })

  it('merges selected layers into a group and can move them out without deleting layers', () => {
    const editor = useEditorStore()
    editor.addText()
    const first = editor.selectedLayerId!
    editor.addText()
    const second = editor.selectedLayerId!

    editor.setLayerSelection([first, second])
    editor.mergeSelectedLayersIntoGroup()

    expect(editor.groups).toHaveLength(1)
    expect(editor.groups[0].layerIds).toEqual([first, second])

    editor.moveSelectedLayersOutOfGroup()
    expect(editor.groups).toEqual([])
    expect(editor.document.layers).toHaveLength(2)
  })

  it('deleting a group only ungroups child layers', () => {
    const editor = useEditorStore()
    editor.addText()
    const first = editor.selectedLayerId!
    editor.addText()
    const second = editor.selectedLayerId!
    editor.setLayerSelection([first, second])
    editor.mergeSelectedLayersIntoGroup()
    const groupId = editor.groups[0].id

    editor.ungroupGroup(groupId)

    expect(editor.groups).toEqual([])
    expect(editor.document.layers.map((layer) => layer.id)).toEqual([first, second])
  })

  it('exits mask editing when active selection moves to another layer', () => {
    const editor = useEditorStore()
    editor.addText()
    const first = editor.selectedLayerId!
    editor.addText()
    const second = editor.selectedLayerId!

    editor.selectLayer(first)
    editor.editLayerMask(first)
    expect(editor.maskEditTarget).toEqual({ kind: 'layer', layerId: first })

    editor.selectLayer(second)
    expect(editor.maskEditTarget).toBeUndefined()
  })
})

describe('font text layer creation (drag-to-canvas path)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('creates a text layer via addText with default "New text" content', () => {
    const editor = useEditorStore()
    editor.addText()

    const layer = editor.document.layers[0]
    expect(layer.type).toBe('text')
    expect((layer as { text?: string }).text).toBe('New text')
  })

  it('creates a text layer with fallback font family "Inter" when no font provided', () => {
    const editor = useEditorStore()
    editor.addText()

    const layer = editor.document.layers[0]
    expect((layer as { fontFamily?: string }).fontFamily).toBe('Inter')
  })

  it('creates a text layer at specified position via addText', () => {
    const editor = useEditorStore()
    editor.addText(undefined, { x: 320, y: 240 })

    const layer = editor.document.layers[0]
    expect(layer.x).toBe(320)
    expect(layer.y).toBe(240)
  })

  it('selects the newly created text layer', () => {
    const editor = useEditorStore()
    editor.addText()

    expect(editor.selectedLayerId).toBeTruthy()
    expect(editor.selectedLayerId).toBe(editor.document.layers[0].id)
  })
})
