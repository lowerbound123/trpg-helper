import { describe, expect, it } from 'vitest'

import {
  addImageLayer,
  addTextLayer,
  createDefaultHandout,
  moveLayer,
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
    })
    expect(withText.layers[1]).toMatchObject({
      type: 'text',
      text: 'Missing witness report',
      fontSize: 42,
      align: 'left',
      italic: false,
      underline: false,
      strikethrough: false,
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
