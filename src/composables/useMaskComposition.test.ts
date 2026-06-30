import { computed, ref, shallowReactive } from 'vue'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { HandoutLayer, LayerMask } from '@/lib/handout'
import { identityMatrix } from '@/lib/mask-geometry'
import { renderMaskedLayerImage } from '@/lib/render'

import { useMaskComposition } from './useMaskComposition'

vi.mock('@/lib/render', () => ({
  renderMaskedLayerImage: vi.fn(async (layer: HandoutLayer) => {
    return {
      width: layer.width,
      height: layer.height,
      dataset: { layerId: layer.id },
    } as unknown as HTMLCanvasElement
  }),
  renderHandoutPreviewToDataUrl: vi.fn(async () => 'data:image/png;base64,AAAA'),
}))

function mask(id: string, layerId: string): LayerMask {
  return {
    id,
    layerId,
    enabled: true,
    path: null,
    highResPath: `masks/${id}.png`,
    width: 100,
    height: 80,
    matrix: identityMatrix(),
    tileSize: 512,
    defaultAlpha: 255,
    tiles: {},
    strokes: [],
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    flipX: false,
    previewScale: 1,
    cache: null,
    sourceVersion: 1,
    version: 1,
    updatedAt: '2026-06-30T00:00:00.000Z',
  }
}

function layer(id: string): HandoutLayer {
  return {
    id,
    type: 'text',
    name: id,
    text: id,
    fontId: undefined,
    fontFamily: 'Inter',
    fontSize: 24,
    fontWeight: 400,
    italic: false,
    underline: false,
    strikethrough: false,
    fill: '#111827',
    lineHeight: 1.2,
    align: 'left',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    rotation: 0,
    flipX: false,
    opacity: 1,
    blendMode: 'source-over',
    visible: true,
    locked: false,
    zIndex: 0,
    effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
    mask: mask(`mask-${id}`, id),
  } as HandoutLayer
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('useMaskComposition targeted refresh', () => {
  beforeEach(() => {
    vi.mocked(renderMaskedLayerImage).mockClear()
  })

  it('refreshes only requested masked layers and leaves other stable canvases untouched', async () => {
    const first = layer('layer-1')
    const second = layer('layer-2')
    const existingFirst = { width: first.width, height: first.height, dataset: { layerId: first.id } } as unknown as HTMLCanvasElement
    const maskedLayerImages = shallowReactive<Record<string, HTMLCanvasElement | undefined>>({
      [first.id]: existingFirst,
    })
    const maskedLayerRenderRevisions = shallowReactive<Record<string, number>>({
      [first.id]: 7,
      [second.id]: 3,
    })
    const editor = {
      view: 'editor',
      document: {
        canvas: {
          width: 800,
          height: 600,
          backgroundColor: 'rgba(0,0,0,0)',
          backgroundVisible: true,
          backgroundMask: null,
          effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
        },
        layers: [first, second],
        groups: [],
      },
      library: { backgrounds: [], assets: [], fonts: [], backgroundFolders: [], assetFolders: [], fontFolders: [] },
      currentProjectId: undefined,
      projectDir: '',
      loadMaskDataUrl: vi.fn(),
      maskDataUrls: {},
    } as any

    const composition = useMaskComposition({
      editor,
      imageElements: {},
      maskFeatureEnabled: true,
      isDraggingMask: ref(false),
      stageScale: computed(() => 1),
      editorMaskPreviewMaxEdge: 1200,
      maskProxyMaxEdge: () => 1200,
      activeMaskEditLayer: computed(() => undefined),
      logCanvasLayerRenderState: vi.fn(),
      maskedLayerImages,
      maskedLayerRenderRevisions,
      requestMaskedLayerDraw: vi.fn(),
      maskPreviewUrls: {},
      maskEditImage: ref(),
      maskEditImageRevision: ref(0),
    })

    await composition.refreshMaskedLayerImages({ layerIds: [second.id], reason: 'unit-target' })

    expect(renderMaskedLayerImage).toHaveBeenCalledTimes(1)
    expect(vi.mocked(renderMaskedLayerImage).mock.calls[0][0].id).toBe(second.id)
    expect(maskedLayerImages[first.id]).toBe(existingFirst)
    expect(maskedLayerImages[second.id]?.dataset.layerId).toBe(second.id)
    expect(maskedLayerRenderRevisions[first.id]).toBe(7)
    expect(maskedLayerRenderRevisions[second.id]).toBe(4)
  })

  it('does not cancel an in-flight layer refresh when another layer refresh starts', async () => {
    const first = layer('layer-1')
    const second = layer('layer-2')
    const firstCanvas = { width: first.width, height: first.height, dataset: { layerId: first.id } } as unknown as HTMLCanvasElement
    const secondCanvas = { width: second.width, height: second.height, dataset: { layerId: second.id } } as unknown as HTMLCanvasElement
    const firstRender = deferred<HTMLCanvasElement>()
    vi.mocked(renderMaskedLayerImage).mockImplementation(async (targetLayer: HandoutLayer) => {
      if (targetLayer.id === first.id) return firstRender.promise
      return secondCanvas
    })
    const maskedLayerImages = shallowReactive<Record<string, HTMLCanvasElement | undefined>>({})
    const maskedLayerRenderRevisions = shallowReactive<Record<string, number>>({})
    const requestMaskedLayerDraw = vi.fn()
    const editor = {
      view: 'editor',
      document: {
        canvas: {
          width: 800,
          height: 600,
          backgroundColor: 'rgba(0,0,0,0)',
          backgroundVisible: true,
          backgroundMask: null,
          effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
        },
        layers: [first, second],
        groups: [],
      },
      library: { backgrounds: [], assets: [], fonts: [], backgroundFolders: [], assetFolders: [], fontFolders: [] },
      currentProjectId: undefined,
      projectDir: '',
      loadMaskDataUrl: vi.fn(),
      maskDataUrls: {},
    } as any

    const composition = useMaskComposition({
      editor,
      imageElements: {},
      maskFeatureEnabled: true,
      isDraggingMask: ref(false),
      stageScale: computed(() => 1),
      editorMaskPreviewMaxEdge: 1200,
      maskProxyMaxEdge: () => 1200,
      activeMaskEditLayer: computed(() => undefined),
      logCanvasLayerRenderState: vi.fn(),
      maskedLayerImages,
      maskedLayerRenderRevisions,
      requestMaskedLayerDraw,
      maskPreviewUrls: {},
      maskEditImage: ref(),
      maskEditImageRevision: ref(0),
    })

    const firstRefresh = composition.refreshMaskedLayerImages({ layerIds: [first.id], reason: 'unit-first' })
    const secondRefresh = composition.refreshMaskedLayerImages({ layerIds: [second.id], reason: 'unit-second' })

    await secondRefresh
    expect(maskedLayerImages[second.id]).toBe(secondCanvas)

    firstRender.resolve(firstCanvas)
    await firstRefresh

    expect(maskedLayerImages[first.id]).toBe(firstCanvas)
    expect(maskedLayerRenderRevisions[first.id]).toBe(1)
    expect(maskedLayerRenderRevisions[second.id]).toBe(1)
    expect(requestMaskedLayerDraw).toHaveBeenCalledWith(first.id)
    expect(requestMaskedLayerDraw).toHaveBeenCalledWith(second.id)
  })

  it('discards a masked layer result if the mask changed while the composite was in flight', async () => {
    const sourceLayer = layer('layer-1')
    const staleCanvas = { width: sourceLayer.width, height: sourceLayer.height, dataset: { version: '1' } } as unknown as HTMLCanvasElement
    const staleRender = deferred<HTMLCanvasElement>()
    vi.mocked(renderMaskedLayerImage).mockImplementation(async () => staleRender.promise)
    const maskedLayerImages = shallowReactive<Record<string, HTMLCanvasElement | undefined>>({})
    const maskedLayerRenderRevisions = shallowReactive<Record<string, number>>({})
    const requestMaskedLayerDraw = vi.fn()
    const editor = {
      view: 'editor',
      document: {
        canvas: {
          width: 800,
          height: 600,
          backgroundColor: 'rgba(0,0,0,0)',
          backgroundVisible: true,
          backgroundMask: null,
          effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
        },
        layers: [sourceLayer],
        groups: [],
      },
      library: { backgrounds: [], assets: [], fonts: [], backgroundFolders: [], assetFolders: [], fontFolders: [] },
      currentProjectId: undefined,
      projectDir: '',
      loadMaskDataUrl: vi.fn(),
      maskDataUrls: {},
    } as any

    const composition = useMaskComposition({
      editor,
      imageElements: {},
      maskFeatureEnabled: true,
      isDraggingMask: ref(false),
      stageScale: computed(() => 1),
      editorMaskPreviewMaxEdge: 1200,
      maskProxyMaxEdge: () => 1200,
      activeMaskEditLayer: computed(() => undefined),
      logCanvasLayerRenderState: vi.fn(),
      maskedLayerImages,
      maskedLayerRenderRevisions,
      requestMaskedLayerDraw,
      maskPreviewUrls: {},
      maskEditImage: ref(),
      maskEditImageRevision: ref(0),
    })

    const refresh = composition.refreshMaskedLayerImages({ layerIds: [sourceLayer.id], reason: 'unit-stale' })
    editor.document = {
      ...editor.document,
      layers: [{
        ...sourceLayer,
        mask: {
          ...sourceLayer.mask!,
          version: 2,
          sourceVersion: 2,
          updatedAt: '2026-06-30T00:00:01.000Z',
        },
      }],
    }
    staleRender.resolve(staleCanvas)
    await refresh

    expect(maskedLayerImages[sourceLayer.id]).toBeUndefined()
    expect(maskedLayerRenderRevisions[sourceLayer.id]).toBeUndefined()
    expect(requestMaskedLayerDraw).not.toHaveBeenCalled()
  })
})
