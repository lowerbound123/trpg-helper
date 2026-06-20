import { describe, expect, it } from 'vitest'

import {
  addImageLayer,
  addPaintLayer,
  addShapeLayer,
  addTextLayer,
  appendPaintStroke,
  createDefaultHandout,
  moveLayer,
  normalizeHandoutDocument,
  updateLayer,
} from './handout'
import { createHistory } from './history'
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
      effects: {
        brightness: 0,
        contrast: 0,
        saturation: 0,
        blur: 0,
      },
    })
    expect(handout.layers).toEqual([])
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
      brushWidth: 6,
      brushTension: 0.35,
    })
    expect(withStroke.layers[0]).toMatchObject({
      type: 'paint',
      strokes: [{ id: 'stroke-1', mode: 'brush' }],
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
