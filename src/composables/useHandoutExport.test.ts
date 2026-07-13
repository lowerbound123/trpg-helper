import { beforeEach, describe, expect, it, vi } from 'vitest'

const renderHandoutToCanvasMock = vi.hoisted(() => vi.fn(async () => ({ width: 800, height: 600 } as HTMLCanvasElement)))
const encodeHandoutCanvasToDownloadsMock = vi.hoisted(() => vi.fn(async () => ({ path: '/Downloads/Handout.jpg', inputBytes: 8, outputBytes: 4, decodeMs: 1, encodeMs: 2, writeMs: 1 })))
const writeEncodedImageBlobToDownloadsMock = vi.hoisted(() => vi.fn(async () => '/Downloads/handout.jpg'))
const exportImageBlobToDownloadsMock = vi.hoisted(() => vi.fn(async () => '/Downloads/fallback.jpg'))
const materializeMaskDataUrlMock = vi.hoisted(() => vi.fn(() => 'data:image/png;base64,RUNTIME'))

vi.mock('@/lib/render', () => ({
  renderHandoutToCanvas: renderHandoutToCanvasMock,
  downloadFileName: vi.fn((title: string, _date?: Date, extension = 'png') => `${title}.${extension}`),
}))

vi.mock('@/lib/backend', () => ({
  exportImageBlobToDownloads: exportImageBlobToDownloadsMock,
  writeEncodedImageBlobToDownloads: writeEncodedImageBlobToDownloadsMock,
  encodeHandoutCanvasToDownloads: encodeHandoutCanvasToDownloadsMock,
  openManagedProject: vi.fn(),
}))

vi.mock('@/lib/mask-runtime', () => ({
  editorMaskGpuRuntime: {
    materializeMaskDataUrl: materializeMaskDataUrlMock,
    hasCurrentMask: vi.fn(() => true),
  },
}))

vi.mock('./useExportProgress', () => ({
  useExportProgress: () => ({
    exportProgress: { value: 0 },
    prepareExportProgress: vi.fn(async () => undefined),
    setExportProgress: vi.fn(async () => undefined),
    finishExportProgress: vi.fn(),
    cleanupExportProgress: vi.fn(),
  }),
}))

import type { HandoutDocument, HandoutLayer, LayerMask } from '@/lib/handout'
import { identityMatrix } from '@/lib/mask-geometry'

import { useHandoutExport } from './useHandoutExport'

function mask(input: Partial<LayerMask> = {}): LayerMask {
  return {
    id: 'mask-1',
    enabled: true,
    path: null,
    highResPath: 'masks/mask-1.png',
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
    ...input,
  } as LayerMask
}

function textLayer(input: Partial<HandoutLayer> = {}): HandoutLayer {
  return {
    id: 'layer-1',
    type: 'text',
    name: 'Text',
    text: 'Masked',
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
    mask: mask(),
    ...input,
  } as HandoutLayer
}

function documentWithMask(): HandoutDocument {
  return {
    schemaVersion: 1,
    id: 'doc-1',
    title: 'Handout',
    canvas: {
      width: 800,
      height: 600,
      backgroundColor: 'rgba(0,0,0,0)',
      backgroundVisible: true,
      backgroundAssetId: undefined,
      backgroundMask: null,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
    },
    layers: [textLayer()],
    groups: [],
    projectAssets: [],
    updatedAt: '2026-06-30T00:00:00.000Z',
  }
}

describe('useHandoutExport', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    renderHandoutToCanvasMock.mockClear()
    encodeHandoutCanvasToDownloadsMock.mockClear()
    writeEncodedImageBlobToDownloadsMock.mockClear()
    exportImageBlobToDownloadsMock.mockClear()
    materializeMaskDataUrlMock.mockClear()
  })

  it('renders the selected export format directly and writes the encoded blob without staging transcode', async () => {
    const editor = {
      document: documentWithMask(),
      library: { backgrounds: [], assets: [], fonts: [], backgroundFolders: [], assetFolders: [], fontFolders: [] },
      currentProjectId: 'project-1',
      projectDir: '',
      maskDataUrls: {},
      resolveBackground: vi.fn(() => undefined),
      resolveAsset: vi.fn(() => undefined),
      loadMaskDataUrl: vi.fn(async () => 'data:image/png;base64,FALLBACK'),
    } as any
    const exportApi = useHandoutExport({
      editor,
      imageElements: {},
      loadImage: vi.fn(async () => ({} as HTMLImageElement)),
      logExport: vi.fn(),
    })
    exportApi.exportEncoding.value = { ...exportApi.exportEncoding.value, format: 'jpg', jpegQuality: 82 }

    await exportApi.exportCurrentImage()

    expect(renderHandoutToCanvasMock).toHaveBeenCalledTimes(1)
    const renderCall = renderHandoutToCanvasMock.mock.calls[0] as unknown[]
    expect(renderCall[4]).toMatchObject({
      maskRenderMode: 'export-deterministic',
      maskDataUrls: { 'mask-1': 'data:image/png;base64,RUNTIME' },
    })
    expect(encodeHandoutCanvasToDownloadsMock).toHaveBeenCalledWith(
      'Handout.jpg',
      expect.objectContaining({ width: 800, height: 600 }),
      expect.objectContaining({ format: 'jpg', jpegQuality: 82 }),
    )
    expect(writeEncodedImageBlobToDownloadsMock).not.toHaveBeenCalled()
    expect(exportImageBlobToDownloadsMock).not.toHaveBeenCalled()
  })
})
