import Konva from 'konva'
import { describe, expect, it } from 'vitest'

import { transformerRotationForSelection } from './useTransformerSync'

describe('transformer rotation synchronization', () => {
  it('shows why flipped Konva nodes cannot drive the selection box rotation', () => {
    const node = new Konva.Rect({
      x: 100,
      y: 50,
      width: 200,
      height: 80,
      scaleX: -1,
      rotation: 330,
    })

    expect(Math.round(node.getAbsoluteRotation())).toBe(150)
    expect(node.rotation()).toBe(330)
  })

  it('uses the model rotation for a single selected layer', () => {
    expect(transformerRotationForSelection({
      selectedLayerRotations: [330],
      maskRotation: undefined,
    })).toBe(330)
  })

  it('uses an unrotated selection box for multi-selection', () => {
    expect(transformerRotationForSelection({
      selectedLayerRotations: [30, 120],
      maskRotation: undefined,
    })).toBe(0)
  })

  it('uses the mask transform rotation while editing a layer mask', () => {
    expect(transformerRotationForSelection({
      selectedLayerRotations: [330],
      maskRotation: 42,
    })).toBe(42)
  })
})
