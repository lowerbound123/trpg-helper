import { describe, expect, it } from 'vitest'

import {
  addImageLayer,
  addLayerGroup,
  addPaintLayer,
  addShapeLayer,
  addTextLayer,
  appendPaintStroke,
  clearBackgroundMask,
  clearLayerMask,
  copyLayerMask,
  createCanvasLayerMask,
  createDefaultHandout,
  deleteBackgroundMask,
  deleteLayerMask,
  flattenLayersToImage,
  groupForLayer,
  isLayerEffectivelyVisible,
  moveLayer,
  moveLayerGroup,
  moveLayerInGroupAware,
  moveLayerOutOfGroup,
  normalizeHandoutDocument,
  setBackgroundMask,
  setLayerMask,
  setLayerMaskEnabled,
  setLayerGroupVisibility,
  ungroupLayerGroup,
  transferLayerMask,
  updateLayer,
} from './handout'
import { createHistory } from './history'
import { matrixFromComponents, matrixNearlyEqual } from './mask-geometry'
import { dataUrlByteSize, downloadFileName, previewPixelRatio } from './render'

describe('handout document model', () => {
  it('creates a versioned pixel-based document', () => {
    const handout = createDefaultHandout('Case File')

    expect(handout.schemaVersion).toBe(1)
    expect(handout.title).toBe('Case File')
    expect(handout.canvas).toEqual({
      width: 1280,
      height: 720,
      backgroundColor: 'rgba(0,0,0,0)',
      backgroundVisible: true,
      backgroundMask: null,
      effects: {
        brightness: 0,
        contrast: 0,
        saturation: 0,
        blur: 0,
      },
    })
    expect(handout.layers).toEqual([])
    expect(handout.groups).toEqual([])
  })

  it('adds image and single-style text layers in z-order', () => {
    const base = createDefaultHandout('Layer Test')
    const withImage = addImageLayer(base, {
      assetId: 'asset-1',
      name: 'Paper texture',
      x: 20,
      y: 30,
      width: 400,
      height: 300,
    })
    const withText = addTextLayer(withImage, {
      text: 'Missing witness report',
      fontId: 'font-1',
      x: 120,
      y: 140,
    })

    expect(withText.layers).toHaveLength(2)
    expect(withText.layers.map((layer) => layer.zIndex)).toEqual([0, 1])
    expect(withText.layers[0]).toMatchObject({
      type: 'image',
      assetId: 'asset-1',
      opacity: 1,
      blendMode: 'source-over',
      flipX: false,
    })
    expect(withText.layers[1]).toMatchObject({
      type: 'text',
      text: 'Missing witness report',
      fontSize: 42,
      align: 'left',
      italic: false,
      underline: false,
      strikethrough: false,
      flipX: false,
    })
  })

  it('adds basic shape layers in z-order', () => {
    const base = createDefaultHandout('Shape Test')
    const withShape = addShapeLayer(base, {
      shape: 'ellipse',
      x: 40,
      y: 50,
      width: 180,
      height: 120,
    })

    expect(withShape.layers).toHaveLength(1)
    expect(withShape.layers[0]).toMatchObject({
      type: 'shape',
      shape: 'ellipse',
      x: 40,
      y: 50,
      width: 180,
      height: 120,
      fill: 'rgba(14,165,233,0.12)',
      stroke: '#0f766e',
      strokeWidth: 3,
      zIndex: 0,
    })
  })

  it('adds editable curve shape layers with default control points and incremented names', () => {
    const base = createDefaultHandout('Curve Test')
    const withQuadratic = addShapeLayer(base, { shape: 'quadratic-curve' })
    const withCubic = addShapeLayer(withQuadratic, { shape: 'cubic-bezier' })
    const withSecondQuadratic = addShapeLayer(withCubic, { shape: 'quadratic-curve' })

    expect(withSecondQuadratic.layers.map((layer) => layer.name)).toEqual([
      'quadratic-curve-1',
      'cubic-bezier-1',
      'quadratic-curve-2',
    ])
    expect(withSecondQuadratic.layers[0]).toMatchObject({
      type: 'shape',
      shape: 'quadratic-curve',
      fill: 'rgba(0,0,0,0)',
      curvePoints: {
        start: { x: 0, y: 135 },
        control: { x: 160, y: 14.4 },
        end: { x: 320, y: 135 },
      },
    })
    expect(withSecondQuadratic.layers[1]).toMatchObject({
      type: 'shape',
      shape: 'cubic-bezier',
      curvePoints: {
        control1: { x: 108, y: 11 },
        control2: { x: 259.2, y: 209 },
      },
    })
  })

  it('creates paint layers and appends strokes immutably', () => {
    const base = createDefaultHandout('Paint Test')
    const withPaint = addPaintLayer(base)
    const paintId = withPaint.layers[0].id
    const withStroke = appendPaintStroke(withPaint, paintId, {
      id: 'stroke-1',
      points: [0, 0, 20, 20],
      strokeWidth: 8,
      color: '#ff0000',
      tension: 0.2,
      mode: 'brush',
    })

    expect(withPaint.layers[0]).toMatchObject({
      type: 'paint',
      name: 'paint-1',
      strokes: [],
      brushColor: '#111827',
      brushKind: 'pixel',
      brushWidth: 6,
      brushOpacity: 1,
      eraserWidth: 12,
      eraserOpacity: 1,
      brushTension: 0.35,
    })
    expect(withStroke.layers[0]).toMatchObject({
      type: 'paint',
      strokes: [{ id: 'stroke-1', mode: 'brush', rawPoints: [{ x: 0, y: 0, pressure: 0.5 }, { x: 20, y: 20, pressure: 0.5 }] }],
    })
    expect(withPaint.layers[0]).not.toBe(withStroke.layers[0])
  })

  it('normalizes legacy paint and curve fields', () => {
    const legacy = {
      ...createDefaultHandout('Legacy'),
      layers: [
        {
          id: 'paint-legacy',
          type: 'paint',
          name: 'Paint',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          flipX: false,
          opacity: 1,
          blendMode: 'source-over',
          visible: true,
          locked: false,
          zIndex: 0,
          effects: undefined,
        },
        {
          id: 'curve-legacy',
          type: 'shape',
          name: 'Curve',
          shape: 'quadratic-curve',
          x: 0,
          y: 0,
          width: 320,
          height: 180,
          rotation: 0,
          flipX: false,
          opacity: 1,
          blendMode: 'source-over',
          visible: true,
          locked: false,
          zIndex: 1,
          effects: undefined,
        },
      ],
    } as any

    const normalized = normalizeHandoutDocument(legacy)
    expect(normalized.layers[0]).toMatchObject({
      type: 'paint',
      strokes: [],
      brushWidth: 6,
      brushKind: 'pixel',
      eraserWidth: 12,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
    })
    expect(normalized.layers[1]).toMatchObject({
      type: 'shape',
      curvePoints: {
        start: { x: 0, y: 135 },
        control: { x: 160, y: 14.4 },
        end: { x: 320, y: 135 },
      },
    })
    expect(normalized.groups).toEqual([])
    expect(normalized.canvas.backgroundMask).toBeNull()
    expect(normalized.layers.every((layer) => layer.mask === null)).toBe(true)
  })

  it('adds toggles clears and deletes layer masks immutably', () => {
    const withLayer = addImageLayer(createDefaultHandout('Mask'), { assetId: 'asset-1' })
    const layerId = withLayer.layers[0].id
    const withMask = setLayerMask(withLayer, layerId, createCanvasLayerMask(withLayer.canvas, {
      id: 'mask-1',
      enabled: true,
      path: 'masks/mask-1.png',
      updatedAt: '2026-06-21T00:00:00.000Z',
    }))
    const disabled = setLayerMaskEnabled(withMask, layerId, false)
    const cleared = clearLayerMask(disabled, layerId, '2026-06-21T00:00:01.000Z')
    const deleted = deleteLayerMask(cleared, layerId)

    expect(withMask.layers[0].mask).toMatchObject({ id: 'mask-1', enabled: true, path: 'masks/mask-1.png' })
    expect(disabled.layers[0].mask?.enabled).toBe(false)
    expect(cleared.layers[0].mask).toMatchObject({
      enabled: true,
      path: '',
      width: withLayer.canvas.width,
      height: withLayer.canvas.height,
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      flipX: false,
      updatedAt: '2026-06-21T00:00:01.000Z',
    })
    expect(deleted.layers[0].mask).toBeNull()
    expect(withLayer.layers[0].mask).toBeNull()
  })

  it('adds toggles clears and deletes background masks', () => {
    const base = createDefaultHandout('Background Mask')
    const withMask = setBackgroundMask(base, createCanvasLayerMask(base.canvas, {
      id: 'background-mask',
      enabled: true,
      path: 'masks/background-mask.png',
      updatedAt: '2026-06-21T00:00:00.000Z',
    }))
    const disabled = setBackgroundMask(withMask, { ...withMask.canvas.backgroundMask!, enabled: false })
    const cleared = clearBackgroundMask(disabled, '2026-06-21T00:00:01.000Z')
    const deleted = deleteBackgroundMask(cleared)

    expect(withMask.canvas.backgroundMask).toMatchObject({ id: 'background-mask', enabled: true })
    expect(disabled.canvas.backgroundMask?.enabled).toBe(false)
    expect(cleared.canvas.backgroundMask).toMatchObject({
      enabled: true,
      path: '',
      width: base.canvas.width,
      height: base.canvas.height,
      updatedAt: '2026-06-21T00:00:01.000Z',
    })
    expect(deleted.canvas.backgroundMask).toBeNull()
  })

  it('normalizes legacy masks to canvas-sized masks with identity transform', () => {
    const legacy = addImageLayer(createDefaultHandout('Legacy Mask'), { assetId: 'asset-1' }) as any
    legacy.layers[0].mask = {
      id: 'legacy-mask',
      enabled: true,
      path: 'masks/legacy-mask.png',
      width: 120,
      height: 90,
      updatedAt: '2026-06-21T00:00:00.000Z',
    }

    const normalized = normalizeHandoutDocument(legacy)

    expect(normalized.layers[0].mask).toMatchObject({
      id: 'legacy-mask',
      width: normalized.canvas.width,
      height: normalized.canvas.height,
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      flipX: false,
    })
  })

  it('migrates legacy mask transform fields into the affine matrix', () => {
    const legacy = addImageLayer(createDefaultHandout('Legacy Transform Mask'), { assetId: 'asset-1' }) as any
    legacy.layers[0].mask = {
      id: 'legacy-mask-transform',
      enabled: true,
      path: 'masks/legacy-mask-transform.png',
      width: 120,
      height: 90,
      x: 10,
      y: 20,
      scaleX: 2,
      scaleY: 3,
      rotation: 30,
      flipX: true,
      updatedAt: '2026-06-21T00:00:00.000Z',
    }

    const normalized = normalizeHandoutDocument(legacy)
    const mask = normalized.layers[0].mask!

    expect(matrixNearlyEqual(mask.matrix, matrixFromComponents({
      x: 10 + normalized.canvas.width * 2,
      y: 20,
      rotation: 30,
      scaleX: -2,
      scaleY: 3,
    }))).toBe(true)
  })

  it('transfers and copies masks between layers', () => {
    const withLayers = addTextLayer(
      addImageLayer(createDefaultHandout('Move Mask'), { assetId: 'asset-1' }),
      { text: 'Target' },
    )
    const [source, target] = withLayers.layers
    const withMask = setLayerMask(withLayers, source.id, createCanvasLayerMask(withLayers.canvas, {
      id: 'mask-source',
      path: 'masks/source.png',
      updatedAt: '2026-06-21T00:00:00.000Z',
    }))

    const transferred = transferLayerMask(withMask, source.id, target.id, '2026-06-21T00:00:01.000Z')
    const copied = copyLayerMask(withMask, source.id, target.id, 'mask-copy', '2026-06-21T00:00:02.000Z')

    expect(transferred.layers.find((layer) => layer.id === source.id)?.mask).toBeNull()
    expect(transferred.layers.find((layer) => layer.id === target.id)?.mask).toMatchObject({
      id: 'mask-source',
      path: '',
      updatedAt: '2026-06-21T00:00:01.000Z',
    })
    expect(copied.layers.find((layer) => layer.id === source.id)?.mask?.id).toBe('mask-source')
    expect(copied.layers.find((layer) => layer.id === target.id)?.mask).toMatchObject({
      id: 'mask-copy',
      path: '',
      updatedAt: '2026-06-21T00:00:02.000Z',
    })
  })

  it('groups layers without nesting and ungrouping keeps child layers', () => {
    const withLayers = addTextLayer(addTextLayer(createDefaultHandout('Groups'), { text: 'A' }), { text: 'B' })
    const [first, second] = withLayers.layers
    const grouped = addLayerGroup(withLayers, [first.id, second.id])
    const hiddenGroup = setLayerGroupVisibility(grouped, grouped.groups[0].id, false)
    const movedOut = moveLayerOutOfGroup(hiddenGroup, first.id)
    const ungrouped = ungroupLayerGroup(movedOut, movedOut.groups[0].id)

    expect(grouped.groups[0]).toMatchObject({
      name: 'group-1',
      layerIds: [first.id, second.id],
      visible: true,
    })
    expect(isLayerEffectivelyVisible(hiddenGroup, second)).toBe(false)
    expect(movedOut.groups[0].layerIds).toEqual([second.id])
    expect(ungrouped.groups).toEqual([])
    expect(ungrouped.layers.map((layer) => layer.id)).toEqual([first.id, second.id])
  })

  it('moves newly grouped layers below the highest selected layer as a contiguous block', () => {
    const withLayers = ['A', 'B', 'C', 'D'].reduce(
      (doc, text) => addTextLayer(doc, { text }),
      createDefaultHandout('Group Order'),
    )
    const [a, b, c, d] = withLayers.layers
    const grouped = addLayerGroup(withLayers, [a.id, c.id])

    expect(grouped.groups[0].layerIds).toEqual([a.id, c.id])
    expect(grouped.layers.map((layer) => layer.id)).toEqual([b.id, a.id, c.id, d.id])
    expect(grouped.layers.map((layer) => layer.zIndex)).toEqual([0, 1, 2, 3])
  })

  it('moves an existing group as one contiguous layer block', () => {
    const withLayers = ['A', 'B', 'C', 'D'].reduce(
      (doc, text) => addTextLayer(doc, { text }),
      createDefaultHandout('Move Group'),
    )
    const [a, b, c, d] = withLayers.layers
    const grouped = addLayerGroup(withLayers, [b.id, c.id])
    const moved = moveLayerGroup(grouped, grouped.groups[0].id, 0)

    expect(grouped.layers.map((layer) => layer.id)).toEqual([a.id, b.id, c.id, d.id])
    expect(moved.layers.map((layer) => layer.id)).toEqual([b.id, c.id, a.id, d.id])
    expect(moved.groups[0].layerIds).toEqual([b.id, c.id])
  })

  it('flattens selected layers into one image layer and removes stale group references', () => {
    const withLayers = ['A', 'B', 'C'].reduce(
      (doc, text) => addTextLayer(doc, { text }),
      createDefaultHandout('Flat Layers'),
    )
    const [a, b, c] = withLayers.layers
    const grouped = addLayerGroup(withLayers, [a.id, b.id])
    const flattened = flattenLayersToImage(grouped, [a.id, b.id], 'asset-flat', 'flat-test', {
      x: 10,
      y: 20,
      width: 300,
      height: 200,
    })

    expect(flattened.layers).toHaveLength(2)
    expect(flattened.layers[0]).toMatchObject({
      type: 'image',
      name: 'flat-test',
      assetId: 'asset-flat',
      x: 10,
      y: 20,
      width: 300,
      height: 200,
      zIndex: 0,
    })
    expect(flattened.layers[1].id).toBe(c.id)
    expect(flattened.groups).toEqual([])
  })

  it('flattens a single selected layer into one image layer', () => {
    const withLayer = addShapeLayer(createDefaultHandout('Flat Single'), { shape: 'rect' })
    const flattened = flattenLayersToImage(withLayer, [withLayer.layers[0].id], 'asset-single-flat', 'flat-single', {
      x: 4,
      y: 8,
      width: 120,
      height: 80,
    })

    expect(flattened.layers).toHaveLength(1)
    expect(flattened.layers[0]).toMatchObject({
      type: 'image',
      assetId: 'asset-single-flat',
      name: 'flat-single',
      x: 4,
      y: 8,
      width: 120,
      height: 80,
    })
  })

  it('updates layers immutably and can reorder them', () => {
    const handout = addTextLayer(createDefaultHandout('Move Test'), {
      text: 'Title',
      x: 0,
      y: 0,
    })
    const layerId = handout.layers[0].id
    const updated = updateLayer(handout, layerId, { x: 80, y: 96, opacity: 0.5 })
    const moved = moveLayer(updated, layerId, 0)

    expect(updated).not.toBe(handout)
    expect(handout.layers[0].x).toBe(0)
    expect(updated.layers[0]).toMatchObject({ x: 80, y: 96, opacity: 0.5 })
    expect(moved.layers[0].zIndex).toBe(0)
  })
})

describe('command history', () => {
  it('supports undo and redo without storing history in the document', () => {
    const history = createHistory(createDefaultHandout('History Test'))
    history.commit((doc) => addTextLayer(doc, { text: 'A', x: 10, y: 12 }))
    history.commit((doc) => updateLayer(doc, doc.layers[0].id, { x: 24 }))

    expect(history.current.layers[0]).toMatchObject({ text: 'A', x: 24 })
    expect(history.canUndo.value).toBe(true)

    history.undo()
    expect(history.current.layers[0]).toMatchObject({ text: 'A', x: 10 })

    history.redo()
    expect(history.current.layers[0]).toMatchObject({ text: 'A', x: 24 })
    expect('history' in history.current).toBe(false)
  })

  it('can merge continuous updates into one undo step', () => {
    const history = createHistory(createDefaultHandout('Continuous Test'))
    history.commit((doc) => addTextLayer(doc, { text: 'A', x: 10, y: 12 }))
    const layerId = history.current.layers[0].id

    history.commit((doc) => updateLayer(doc, layerId, { x: 20 }))
    history.commit((doc) => updateLayer(doc, layerId, { x: 30 }), { merge: true })
    history.commit((doc) => updateLayer(doc, layerId, { x: 40 }), { merge: true })

    expect(history.current.layers[0].x).toBe(40)
    history.undo()
    expect(history.current.layers[0].x).toBe(10)
  })
})

describe('moveLayerInGroupAware', () => {
  /** Helper: asserts that every group's layerIds map to contiguous indices in document.layers. */
  function groupsAreContiguous(doc: ReturnType<typeof createDefaultHandout>) {
    for (const g of doc.groups) {
      const indices = g.layerIds
        .map((id) => doc.layers.findIndex((l) => l.id === id))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b)
      if (indices.length !== g.layerIds.length) return false
      for (let i = 1; i < indices.length; i++) {
        if (indices[i] !== indices[i - 1] + 1) return false
      }
    }
    return true
  }

  /** Helper: creates a document with N text layers named "A", "B", "C", … */
  function docWithLayers(count: number): ReturnType<typeof createDefaultHandout> {
    let doc = createDefaultHandout('Order Test')
    for (let i = 0; i < count; i++) {
      doc = addTextLayer(doc, { text: String.fromCharCode(65 + i) })
    }
    return doc
  }

  /** Helper: groups two layers by index in the current document.layers order. */
  function groupLayersByIndex(doc: ReturnType<typeof createDefaultHandout>, a: number, b: number) {
    return addLayerGroup(doc, [doc.layers[a].id, doc.layers[b].id])
  }

  /** Helper: get layer ID by its text content. */
  function idByText(doc: ReturnType<typeof createDefaultHandout>, text: string) {
    return doc.layers.find((l) => l.type === 'text' && (l as { text?: string }).text === text)!.id
  }

  /** Helper: get text labels of all layers in order. */
  function layerTexts(doc: ReturnType<typeof createDefaultHandout>) {
    return doc.layers.map((l) => (l.type === 'text' ? (l as { text?: string }).text : l.name))
  }

  // ── Requirement 1: Independent ↔ Independent ─────────────────────

  it('swaps independent layer up with adjacent independent layer', () => {
    const doc = docWithLayers(3) // [A@0, B@1, C@2]
    const result = moveLayerInGroupAware(doc, idByText(doc, 'B'), 1)

    expect(layerTexts(result)).toEqual(['A', 'C', 'B'])
    expect(result.layers.map((l) => l.zIndex)).toEqual([0, 1, 2])
    expect(groupsAreContiguous(result)).toBe(true)
  })

  it('swaps independent layer down with adjacent independent layer', () => {
    const doc = docWithLayers(3)
    const result = moveLayerInGroupAware(doc, idByText(doc, 'B'), -1)

    expect(layerTexts(result)).toEqual(['B', 'A', 'C'])
    expect(groupsAreContiguous(result)).toBe(true)
  })

  it('does nothing when topmost independent layer tries to move up', () => {
    const doc = docWithLayers(2)
    const result = moveLayerInGroupAware(doc, idByText(doc, 'B'), 1)

    expect(layerTexts(result)).toEqual(['A', 'B'])
    expect(groupsAreContiguous(result)).toBe(true)
  })

  it('does nothing when bottommost independent layer tries to move down', () => {
    const doc = docWithLayers(2)
    const result = moveLayerInGroupAware(doc, idByText(doc, 'A'), -1)

    expect(layerTexts(result)).toEqual(['A', 'B'])
    expect(groupsAreContiguous(result)).toBe(true)
  })

  // ── Requirement 2: Independent ↔ Group (block move) ─────────────

  it('independent up past group: group block moves down unchanged', () => {
    // A [B C] → A up → [B C] A (group composition never changes)
    const doc = docWithLayers(3) // [A@0, B@1, C@2]
    const grouped = groupLayersByIndex(doc, 1, 2) // group [B, C]
    const aId = idByText(grouped, 'A')
    const bId = idByText(doc, 'B')
    const cId = idByText(doc, 'C')
    const result = moveLayerInGroupAware(grouped, aId, 1)

    // Group block [B, C] moved down, A moved above: [B, C, A]
    expect(layerTexts(result)).toEqual(['B', 'C', 'A'])
    // Group [B, C] is unchanged
    const grp = groupForLayer(result, bId)
    expect(grp).toBeTruthy()
    expect(new Set(grp!.layerIds)).toEqual(new Set([bId, cId]))
    expect(groupsAreContiguous(result)).toBe(true)
  })

  it('independent down past group: group block moves up unchanged', () => {
    // [A B] C → C down → C [A B]
    const doc = docWithLayers(3) // [A@0, B@1, C@2]
    const grouped = groupLayersByIndex(doc, 0, 1) // group [A, B]
    const aId = idByText(doc, 'A')
    const bId = idByText(doc, 'B')
    const cId = idByText(grouped, 'C')
    const result = moveLayerInGroupAware(grouped, cId, -1)

    // Group block [A, B] moved up, C moved below: [C, A, B]
    expect(layerTexts(result)).toEqual(['C', 'A', 'B'])
    // Group [A, B] is unchanged
    const grp = groupForLayer(result, aId)
    expect(grp).toBeTruthy()
    expect(new Set(grp!.layerIds)).toEqual(new Set([aId, bId]))
    expect(groupsAreContiguous(result)).toBe(true)
  })

  // ── Requirement 3: Group interior swap ───────────────────────────

  it('swaps with sibling up within a group', () => {
    const doc = docWithLayers(4) // [A@0, B@1, C@2, D@3]
    const grouped = addLayerGroup(doc, [doc.layers[1].id, doc.layers[2].id]) // group [B, C]
    const bId = idByText(grouped, 'B')
    const cId = idByText(doc, 'C')
    const result = moveLayerInGroupAware(grouped, bId, 1)

    // B swaps with C within the group
    expect(layerTexts(result)).toEqual(['A', 'C', 'B', 'D'])
    const grp = groupForLayer(result, bId)
    expect(grp!.layerIds).toEqual([cId, bId]) // C, B in z-order (C first = lower z)
    expect(groupsAreContiguous(result)).toBe(true)
  })

  it('swaps with sibling down within a group', () => {
    const doc = docWithLayers(4)
    const grouped = addLayerGroup(doc, [doc.layers[1].id, doc.layers[2].id]) // group [B, C]
    const bId = idByText(doc, 'B')
    const cId = idByText(grouped, 'C')
    const result = moveLayerInGroupAware(grouped, cId, -1)

    expect(layerTexts(result)).toEqual(['A', 'C', 'B', 'D'])
    const grp = groupForLayer(result, cId)
    expect(grp!.layerIds).toEqual([cId, bId]) // C, B in z-order (C first = lower z = bottom)
    expect(groupsAreContiguous(result)).toBe(true)
  })

  // ── Requirement 4: Group block move ──────────────────────────────

  it('moves entire group up when top boundary layer moves up', () => {
    // x [A,B,C] y → top up → x y [A,B,C]
    const doc = docWithLayers(5) // [A@0, B@1, C@2, D@3, E@4]
    const grouped = addLayerGroup(doc, [doc.layers[1].id, doc.layers[2].id, doc.layers[3].id]) // group [B, C, D]
    const dId = idByText(grouped, 'D') // D is the top of the group
    const result = moveLayerInGroupAware(grouped, dId, 1)

    // Group block moves up: E slides below the group
    expect(layerTexts(result)).toEqual(['A', 'E', 'B', 'C', 'D'])
    // Group still has the same 3 members
    const grp = result.groups[0]
    expect(grp.layerIds).toHaveLength(3)
    expect(groupsAreContiguous(result)).toBe(true)
  })

  it('moves entire group down when bottom boundary layer moves down', () => {
    // x [A,B,C] y → bottom down → [A,B,C] x y
    const doc = docWithLayers(5)
    const grouped = addLayerGroup(doc, [doc.layers[1].id, doc.layers[2].id, doc.layers[3].id]) // group [B, C, D]
    const bId = idByText(grouped, 'B') // B is the bottom of the group
    const result = moveLayerInGroupAware(grouped, bId, -1)

    // Group block moves down: A slides above the group
    expect(layerTexts(result)).toEqual(['B', 'C', 'D', 'A', 'E'])
    expect(groupsAreContiguous(result)).toBe(true)
  })

  it('does nothing when group is at top and top layer tries to move up', () => {
    const doc = docWithLayers(3) // [A@0, B@1, C@2]
    const grouped = addLayerGroup(doc, [doc.layers[1].id, doc.layers[2].id]) // group [B, C] at top
    const cId = idByText(grouped, 'C')
    const result = moveLayerInGroupAware(grouped, cId, 1)

    // No change — group is already at the top
    expect(layerTexts(result)).toEqual(['A', 'B', 'C'])
    expect(groupsAreContiguous(result)).toBe(true)
  })

  it('does nothing when group is at bottom and bottom layer tries to move down', () => {
    const doc = docWithLayers(3) // [A@0, B@1, C@2]
    const grouped = addLayerGroup(doc, [doc.layers[0].id, doc.layers[1].id]) // group [A, B] at bottom
    const aId = idByText(grouped, 'A')
    const result = moveLayerInGroupAware(grouped, aId, -1)

    // No change — group is already at the bottom
    expect(layerTexts(result)).toEqual(['A', 'B', 'C'])
    expect(groupsAreContiguous(result)).toBe(true)
  })

  // ── Two-group interaction ────────────────────────────────────────

  it('swaps two adjacent group blocks when top of lower group moves up', () => {
    const doc = docWithLayers(4) // [A@0, B@1, C@2, D@3]
    const g1 = addLayerGroup(doc, [doc.layers[0].id, doc.layers[1].id]) // group [A, B]
    const g2 = addLayerGroup(g1, [g1.layers[2].id, g1.layers[3].id]) // group [C, D]
    const bId = idByText(g2, 'B') // B is top of first group
    const result = moveLayerInGroupAware(g2, bId, 1)

    // Groups swap: [C, D] [A, B]
    expect(layerTexts(result)).toEqual(['C', 'D', 'A', 'B'])
    expect(result.groups).toHaveLength(2)
    expect(groupsAreContiguous(result)).toBe(true)
  })

  // ── Single-layer group ───────────────────────────────────────────

  it('moves a single-layer group as a block', () => {
    const doc = docWithLayers(3) // [A@0, B@1, C@2]
    const grouped = addLayerGroup(doc, [doc.layers[1].id]) // group [B] alone
    const bId = idByText(grouped, 'B')
    const result = moveLayerInGroupAware(grouped, bId, 1)

    // B (alone in group) swaps with C
    expect(layerTexts(result)).toEqual(['A', 'C', 'B'])
    const grp = groupForLayer(result, bId)
    expect(grp).toBeTruthy()
    expect(grp!.layerIds).toEqual([bId])
    expect(groupsAreContiguous(result)).toBe(true)
  })

  // ── Contiguity invariant ─────────────────────────────────────────

  it('maintains group contiguity after multiple operations', () => {
    let doc = docWithLayers(5) // [A@0, B@1, C@2, D@3, E@4]
    // Group [B, C] and [D, E]
    const g1 = addLayerGroup(doc, [doc.layers[1].id, doc.layers[2].id])
    doc = addLayerGroup(g1, [g1.layers[3].id, g1.layers[4].id])

    // Op 1: Move independent A up (group [B, C] moves down as a block)
    let aId = idByText(doc, 'A')
    doc = moveLayerInGroupAware(doc, aId, 1)
    expect(groupsAreContiguous(doc)).toBe(true)

    // Op 2: Move within a group
    let bId = idByText(doc, 'B')
    doc = moveLayerInGroupAware(doc, bId, 1)
    expect(groupsAreContiguous(doc)).toBe(true)

    // Op 3: Move group block
    let dId = idByText(doc, 'D')
    doc = moveLayerInGroupAware(doc, dId, 1)
    expect(groupsAreContiguous(doc)).toBe(true)

    // Op 4: Two-group swap
    let cId = idByText(doc, 'C')
    doc = moveLayerInGroupAware(doc, cId, 1)
    expect(groupsAreContiguous(doc)).toBe(true)
  })
})

describe('font text layer creation (drag-to-canvas path)', () => {
  it('creates a text layer with specific fontId and fontFamily at given position', () => {
    const doc = createDefaultHandout('Font Test')
    const result = addTextLayer(doc, {
      text: 'New text',
      fontId: 'font-abc',
      fontFamily: 'MyFont',
      x: 320,
      y: 240,
    })

    const layer = result.layers[0] as { type: string; text?: string; fontId?: string; fontFamily?: string; x: number; y: number }
    expect(layer.type).toBe('text')
    expect(layer.text).toBe('New text')
    expect(layer.fontId).toBe('font-abc')
    expect(layer.fontFamily).toBe('MyFont')
    expect(layer.x).toBe(320)
    expect(layer.y).toBe(240)
  })

  it('uses default position when none provided', () => {
    const doc = createDefaultHandout('Font Test')
    const result = addTextLayer(doc, { text: 'Hello', fontFamily: 'Inter' })

    const layer = result.layers[0] as { x: number; y: number; fontFamily?: string }
    expect(layer.x).toBe(160)
    expect(layer.y).toBe(160)
  })

  it('uses Inter as default fontFamily when not provided', () => {
    const doc = createDefaultHandout('Font Test')
    const result = addTextLayer(doc, { text: 'Minimal' })

    const layer = result.layers[0] as { fontFamily?: string }
    expect(layer.fontFamily).toBe('Inter')
  })
})

describe('flip-aware rotation compensation', () => {
  /**
   * Pure extraction of the rotation formula used in onTransformEnd.
   * Step 1: Normalize from node's current scaleY to scaleY=1.
   * Step 2: Convert from screen-space to model rotation (negate if flipX).
   */
  function computeNodeRotation(
    nodeRotation: number,
    flipX: boolean,
    nodeScaleY: number = 1,
  ): number {
    // Step 1: Undo Konva Transformer's scaleY flip
    if (nodeScaleY < 0) nodeRotation = 180 - nodeRotation
    // Step 2: flipX (scaleX=-1) reverses visual rotation direction
    const result = Math.round(flipX ? -nodeRotation : nodeRotation)
    return result === 0 ? 0 : result // normalize -0 to 0
  }

  it('non-flipped: rotation = rounded node rotation', () => {
    expect(computeNodeRotation(30.2, false)).toBe(30)
    expect(computeNodeRotation(75.8, false)).toBe(76)
  })

  it('flipped, scaleY=1: rotation negated (mirrored x-axis)', () => {
    // Node rotation in mirrored coords → model rotation is negated
    expect(computeNodeRotation(0, true)).toBe(0)
    expect(computeNodeRotation(-30, true)).toBe(30)
    expect(computeNodeRotation(45, true)).toBe(-45)
  })

  it('flipped, scaleY=-1: undo Transformer Y-flip before negating', () => {
    // Transformer changed scaleY=-1,rot=164: normalize 180-164=16, then flip: -16
    expect(computeNodeRotation(164, true, -1)).toBe(-16)
    // Transformer at 180 → 0 after normalization, then 0
    expect(computeNodeRotation(180, true, -1)).toBe(0)
  })
})

describe('export helpers', () => {
  it('creates safe timestamped png file names', () => {
    expect(downloadFileName('Case File: Alpha.png', new Date(2026, 5, 18, 7, 8, 9))).toBe(
      'Case-File-Alpha-20260618-070809.png',
    )
  })

  it('sizes previews by maximum edge', () => {
    expect(previewPixelRatio({ width: 5000, height: 7000 })).toBeCloseTo(256 / 7000)
    expect(previewPixelRatio({ width: 5000, height: 7000 }, 320)).toBeCloseTo(320 / 7000)
    expect(previewPixelRatio({ width: 240, height: 160 }, 320)).toBe(1)
  })

  it('estimates data url bytes from base64 payloads', () => {
    expect(dataUrlByteSize('data:image/png;base64,AAAA')).toBe(3)
    expect(dataUrlByteSize('data:image/png;base64,AA==')).toBe(1)
  })
})
