import { describe, expect, it } from 'vitest'

import { calculateSnapGuides, SNAP_THRESHOLD_SCREEN_PX, type SnapLayer } from './snapping'

const moving: SnapLayer = {
  id: 'moving',
  x: 96,
  y: 200,
  width: 100,
  height: 80,
  visible: true,
  locked: false,
}

function layer(input: Partial<SnapLayer> & Pick<SnapLayer, 'id' | 'x' | 'y'>): SnapLayer {
  return {
    width: 100,
    height: 80,
    visible: true,
    locked: false,
    ...input,
  }
}

describe('snap guide calculation', () => {
  it('uses screen pixels as the snap threshold', () => {
    const zoomedIn = calculateSnapGuides({
      movingLayer: moving,
      layers: [layer({ id: 'target', x: 100, y: 400 })],
      canvas: { width: 1000, height: 800 },
      stageScale: 2,
    })
    const zoomedOut = calculateSnapGuides({
      movingLayer: moving,
      layers: [layer({ id: 'target', x: 100, y: 400 })],
      canvas: { width: 1000, height: 800 },
      stageScale: 0.5,
    })

    expect(SNAP_THRESHOLD_SCREEN_PX).toBe(5)
    expect(zoomedIn.x).toBeUndefined()
    expect(zoomedOut.x).toMatchObject({
      target: 100,
      index: 0,
      layerId: 'target',
    })
    expect(zoomedOut.x?.distance).toBe(4)
    expect(zoomedOut.lines).toEqual([{ orientation: 'vertical', value: 100 }])
  })

  it('snaps independently to nearby layer and canvas guides', () => {
    const result = calculateSnapGuides({
      movingLayer: moving,
      layers: [
        moving,
        layer({ id: 'near-x', x: 199, y: 190 }),
        layer({ id: 'hidden', x: 100, y: 200, visible: false }),
        layer({ id: 'locked', x: 100, y: 200, locked: true }),
      ],
      canvas: { width: 1000, height: 800 },
      stageScale: 1,
    })

    expect(result.x).toMatchObject({
      target: 199,
      index: 2,
      layerId: 'near-x',
    })
    expect(result.nextPosition).toEqual({ x: 99, y: 200 })
    expect(result.lines).toEqual([{ orientation: 'vertical', value: 199 }])
  })

  it('limits layer candidates to nearby layers before choosing a guide', () => {
    const nearby = Array.from({ length: 24 }, (_, index) =>
      layer({ id: `near-${index}`, x: 300 + index * 4, y: 320 + index }),
    )
    const farButPerfect = layer({ id: 'far-perfect', x: 196, y: 5000 })

    const result = calculateSnapGuides({
      movingLayer: moving,
      layers: [moving, farButPerfect, ...nearby],
      canvas: { width: 1000, height: 800 },
      stageScale: 1,
    })

    expect(result.x?.layerId).not.toBe('far-perfect')
    expect(result.x).toBeUndefined()
    expect(result.lines).toEqual([])
  })
})
