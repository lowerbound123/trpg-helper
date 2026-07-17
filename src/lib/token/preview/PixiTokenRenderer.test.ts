import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultTokenExportSettings, createDefaultTokenVisualStyle } from '../configuration'
import type { TokenParams } from '../types'

const applicationState = vi.hoisted(() => {
  let resolveInit: () => void = () => undefined
  let initPromise = Promise.resolve()
  return {
    instances: [] as Array<{ destroy: ReturnType<typeof vi.fn> }>,
    reset() { initPromise = new Promise<void>((resolve) => { resolveInit = resolve }) },
    wait: () => initPromise,
    resolve: () => resolveInit(),
  }
})
const resizeState = vi.hoisted(() => ({ callbacks: [] as ResizeObserverCallback[], disconnect: vi.fn() }))

class TestResizeObserver {
  constructor(callback: ResizeObserverCallback) { resizeState.callbacks.push(callback) }
  observe() {}
  disconnect() { resizeState.disconnect() }
}

vi.mock('pixi.js', async () => {
  const actual = await vi.importActual<typeof import('pixi.js')>('pixi.js')
  class Application {
    stage = new actual.Container()
    canvas = { style: {}, addEventListener: vi.fn(), removeEventListener: vi.fn(), toDataURL: vi.fn() } as unknown as HTMLCanvasElement
    renderer = { events: { features: { globalMove: false } }, resize: vi.fn() }
    render = vi.fn()
    destroy = vi.fn()
    constructor() { applicationState.instances.push(this) }
    async init() { await applicationState.wait() }
  }
  return { ...actual, Application }
})

import { createPixiApplicationOptions, createPreviewScene, PixiTokenRenderer } from './PixiTokenRenderer'

const defaults: TokenParams = {
  size: 512,
  ...createDefaultTokenVisualStyle(),
  ...createDefaultTokenExportSettings(),
  ringImageScaleX: 100, ringImageScaleY: 100, ringImageOffsetX: 0, ringImageOffsetY: 0,
  backgroundImageOffsetX: 0, backgroundImageOffsetY: 0,
}
const handlers = () => ({ onOffsetChange: vi.fn(), onOffsetCommit: vi.fn(), onScaleChange: vi.fn() })

beforeEach(() => {
  applicationState.instances.length = 0
  applicationState.reset()
  resizeState.callbacks.length = 0
  resizeState.disconnect.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('PixiTokenRenderer', () => {
  it('creates a transparent manual WebGL renderer with capped DPR', () => {
    expect(createPixiApplicationOptions(800, 600, 3)).toMatchObject({
      width: 800, height: 600, preference: 'webgl', backgroundAlpha: 0,
      autoDensity: true, autoStart: false, resolution: 2,
    })
  })

  it('keeps the split masks in the required scene subtrees', () => {
    const scene = createPreviewScene()
    expect(scene.ringFrontContainer.mask).toBe(scene.ringFrontMask)
    expect(scene.avatarRestrictedInner.parent).toBe(scene.avatarRestrictedOuter)
    expect(scene.avatarRestrictedHalfMask.parent).toBe(scene.avatarRestrictedOuter)
    expect(scene.ringBackSprite.parent).toBe(scene.ringBackBandContainer)
    expect(scene.backgroundSprite.mask).toBe(scene.backgroundMask)
    scene.root.destroy({ children: true })
  })

  it('shares one application across concurrent mounts', async () => {
    const renderer = new PixiTokenRenderer(handlers())
    const host = { replaceChildren: vi.fn(), style: {} } as unknown as HTMLElement
    const first = renderer.mount(host)
    const second = renderer.mount(host)
    expect(applicationState.instances).toHaveLength(1)
    applicationState.resolve()
    await Promise.all([first, second])
    expect(host.replaceChildren).toHaveBeenCalledOnce()
    renderer.destroy()
  })

  it('does not attach a canvas when destroyed during initialization', async () => {
    const renderer = new PixiTokenRenderer(handlers())
    const host = { replaceChildren: vi.fn(), style: {} } as unknown as HTMLElement
    const mounting = renderer.mount(host)
    renderer.destroy()
    applicationState.resolve()
    await mounting
    expect(host.replaceChildren).not.toHaveBeenCalled()
    expect(applicationState.instances[0]?.destroy).toHaveBeenCalledOnce()
  })

  it('freezes the camera world while dragging and refits after release', async () => {
    const renderer = new PixiTokenRenderer(handlers())
    const host = { replaceChildren: vi.fn(), style: {}, getBoundingClientRect: () => ({ width: 800, height: 600 }) } as unknown as HTMLElement
    const mounting = renderer.mount(host)
    applicationState.resolve()
    await mounting
    const state = renderer as unknown as { image: { width: number; height: number }; activePointerId: number | null; worldSize: number }
    state.image = { width: 1000, height: 1000 }
    renderer.update({ ...defaults, splitRing: true, scale: 500 })
    const expanded = state.worldSize
    state.activePointerId = 1
    renderer.update({ ...defaults, splitRing: true, scale: 100 })
    expect(state.worldSize).toBe(expanded)
    state.activePointerId = null
    renderer.update({ ...defaults, splitRing: true, scale: 100 })
    expect(state.worldSize).toBe(512)
    renderer.destroy()
  })

  it('applies independent viewport zoom without changing token parameters', async () => {
    const renderer = new PixiTokenRenderer(handlers())
    const host = { replaceChildren: vi.fn(), style: {}, getBoundingClientRect: () => ({ width: 800, height: 600 }) } as unknown as HTMLElement
    const mounting = renderer.mount(host)
    applicationState.resolve()
    await mounting
    renderer.update(defaults)
    const paramsBefore = { ...(renderer as unknown as { params: TokenParams }).params }
    expect(renderer.setViewportZoom(2)).toBe(2)
    expect(renderer.getViewportZoom()).toBe(2)
    expect((renderer as unknown as { params: TokenParams }).params).toEqual(paramsBefore)
    renderer.fitViewport()
    expect(renderer.getViewportZoom()).toBe(1)
    renderer.destroy()
  })

  it('disconnects ResizeObserver on destroy', async () => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    const renderer = new PixiTokenRenderer(handlers())
    const host = { replaceChildren: vi.fn(), style: {}, getBoundingClientRect: () => ({ width: 800, height: 600 }) } as unknown as HTMLElement
    const mounting = renderer.mount(host)
    applicationState.resolve()
    await mounting
    renderer.destroy()
    expect(resizeState.disconnect).toHaveBeenCalledOnce()
  })
})
