// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const textureRecords: Array<{
  source: { update: ReturnType<typeof vi.fn> }
  destroy: ReturnType<typeof vi.fn>
}> = []
const textureFrom = vi.fn((resource: CanvasImageSource, skipCache?: boolean) => {
  void resource
  void skipCache
  const record = {
    source: { update: vi.fn() },
    destroy: vi.fn(),
  }
  textureRecords.push(record)
  return record
})
const rendererRender = vi.fn()
const rendererResize = vi.fn()
const rendererExtractCanvas = vi.fn(() => document.createElement('canvas'))

vi.mock('pixi.js', () => {
  class Application {
    renderer = {
      resize: rendererResize,
      render: rendererRender,
      extract: {
        canvas: rendererExtractCanvas,
      },
    }

    init = vi.fn(async () => undefined)
  }

  class Container {
    addChild = vi.fn()
    destroy = vi.fn()
  }

  class Sprite {
    width = 0
    height = 0
    mask: unknown = null
    texture: unknown

    constructor(texture: unknown) {
      this.texture = texture
    }
  }

  return {
    Application,
    Container,
    Sprite,
    Texture: {
      from: textureFrom,
    },
  }
})

describe('PixiMaskBridge', () => {
  beforeEach(() => {
    textureRecords.length = 0
    textureFrom.mockClear()
    rendererRender.mockClear()
    rendererResize.mockClear()
    rendererExtractCanvas.mockClear()
  })

  it('uses uncached canvas textures, refreshes their sources, and keeps source canvases owned by the runtime', async () => {
    const { composeMaskPreview } = await import('./PixiMaskBridge')
    const sourceCanvas = document.createElement('canvas')
    const maskCanvas = document.createElement('canvas')
    sourceCanvas.width = 20
    sourceCanvas.height = 10
    maskCanvas.width = 20
    maskCanvas.height = 10

    await composeMaskPreview({
      layerId: 'layer-1',
      maskId: 'mask-1',
      sourceCanvas,
      localMaskCanvas: maskCanvas,
      sourceVersion: 2,
    })

    expect(textureFrom).toHaveBeenCalledWith(sourceCanvas, true)
    expect(textureFrom).toHaveBeenCalledWith(maskCanvas, true)
    expect(textureRecords[0].source.update).toHaveBeenCalledTimes(1)
    expect(textureRecords[1].source.update).toHaveBeenCalledTimes(1)
    expect(textureRecords[0].destroy).toHaveBeenCalledWith(false)
    expect(textureRecords[1].destroy).toHaveBeenCalledWith(false)
  })
})
