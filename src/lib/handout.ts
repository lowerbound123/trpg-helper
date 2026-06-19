import { v4 as uuidv4 } from 'uuid'

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'

export type LayerType = 'image' | 'text'

export interface CanvasSettings {
  width: number
  height: number
  backgroundColor: string
  backgroundAssetId?: string
  effects: LayerEffects
}

export interface LayerEffects {
  brightness: number
  contrast: number
  saturation: number
  blur: number
}

export interface BaseLayer {
  id: string
  type: LayerType
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  flipX: boolean
  opacity: number
  blendMode: BlendMode
  visible: boolean
  locked: boolean
  zIndex: number
  effects: LayerEffects
}

export interface ImageLayer extends BaseLayer {
  type: 'image'
  assetId: string
}

export interface TextLayer extends BaseLayer {
  type: 'text'
  text: string
  fontId?: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  italic: boolean
  underline: boolean
  strikethrough: boolean
  fill: string
  align: 'left' | 'center' | 'right' | 'justify'
  lineHeight: number
}

export type HandoutLayer = ImageLayer | TextLayer

export interface HandoutDocument {
  schemaVersion: 1
  id: string
  title: string
  canvas: CanvasSettings
  layers: HandoutLayer[]
  updatedAt: string
}

export type NewImageLayerInput = {
  assetId: string
  name?: string
  x?: number
  y?: number
  width?: number
  height?: number
}

export type NewTextLayerInput = {
  text: string
  fontId?: string
  fontFamily?: string
  x?: number
  y?: number
  width?: number
  height?: number
}

export type LayerPatch = Partial<
  Omit<ImageLayer, 'id' | 'type' | 'zIndex'> & Omit<TextLayer, 'id' | 'type' | 'zIndex'>
>

export const defaultEffects = (): LayerEffects => ({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
})

export function normalizeEffects(effects?: Partial<LayerEffects>): LayerEffects {
  return {
    ...defaultEffects(),
    ...effects,
  }
}

export function normalizeHandoutDocument(document: HandoutDocument): HandoutDocument {
  return {
    ...document,
    canvas: {
      ...document.canvas,
      effects: normalizeEffects(document.canvas.effects),
    },
    layers: document.layers.map((layer) => ({
      ...layer,
      flipX: layer.flipX ?? false,
      effects: normalizeEffects(layer.effects),
    })) as HandoutLayer[],
  }
}

const touch = (document: HandoutDocument): HandoutDocument => ({
  ...document,
  updatedAt: new Date().toISOString(),
})

const normalizeZIndex = (layers: HandoutLayer[]): HandoutLayer[] =>
  layers.map((layer, index) => ({ ...layer, zIndex: index }))

export function createDefaultHandout(title = 'Untitled handout'): HandoutDocument {
  return {
    schemaVersion: 1,
    id: uuidv4(),
    title,
    canvas: {
      width: 1280,
      height: 720,
      backgroundColor: 'rgba(0,0,0,0)',
      effects: defaultEffects(),
    },
    layers: [],
    updatedAt: new Date().toISOString(),
  }
}

export function addImageLayer(document: HandoutDocument, input: NewImageLayerInput): HandoutDocument {
  const layer: ImageLayer = {
    id: uuidv4(),
    type: 'image',
    name: input.name ?? 'Image layer',
    assetId: input.assetId,
    x: input.x ?? 120,
    y: input.y ?? 120,
    width: input.width ?? 360,
    height: input.height ?? 240,
    rotation: 0,
    flipX: false,
    opacity: 1,
    blendMode: 'source-over',
    visible: true,
    locked: false,
    zIndex: document.layers.length,
    effects: defaultEffects(),
  }

  return touch({
    ...document,
    layers: [...document.layers, layer],
  })
}

export function addTextLayer(document: HandoutDocument, input: NewTextLayerInput): HandoutDocument {
  const layer: TextLayer = {
    id: uuidv4(),
    type: 'text',
    name: 'Text layer',
    text: input.text,
    fontId: input.fontId,
    fontFamily: input.fontFamily ?? 'Inter',
    fontSize: 42,
    fontWeight: 600,
    italic: false,
    underline: false,
    strikethrough: false,
    fill: '#111827',
    align: 'left',
    lineHeight: 1.18,
    x: input.x ?? 160,
    y: input.y ?? 160,
    width: input.width ?? 520,
    height: input.height ?? 120,
    rotation: 0,
    flipX: false,
    opacity: 1,
    blendMode: 'source-over',
    visible: true,
    locked: false,
    zIndex: document.layers.length,
    effects: defaultEffects(),
  }

  return touch({
    ...document,
    layers: [...document.layers, layer],
  })
}

export function updateLayer(
  document: HandoutDocument,
  layerId: string,
  patch: LayerPatch,
): HandoutDocument {
  return touch({
    ...document,
    layers: document.layers.map((layer) => {
      if (layer.id !== layerId) return layer
      return { ...layer, ...patch } as HandoutLayer
    }),
  })
}

export function removeLayer(document: HandoutDocument, layerId: string): HandoutDocument {
  return touch({
    ...document,
    layers: normalizeZIndex(document.layers.filter((layer) => layer.id !== layerId)),
  })
}

export function moveLayer(
  document: HandoutDocument,
  layerId: string,
  targetIndex: number,
): HandoutDocument {
  const layers = [...document.layers]
  const currentIndex = layers.findIndex((layer) => layer.id === layerId)
  if (currentIndex < 0) return document

  const [layer] = layers.splice(currentIndex, 1)
  const boundedIndex = Math.max(0, Math.min(targetIndex, layers.length))
  layers.splice(boundedIndex, 0, layer)

  return touch({
    ...document,
    layers: normalizeZIndex(layers),
  })
}

export function updateCanvas(
  document: HandoutDocument,
  canvas: Partial<CanvasSettings>,
): HandoutDocument {
  return touch({
    ...document,
    canvas: {
      ...document.canvas,
      ...canvas,
      effects: normalizeEffects({
        ...document.canvas.effects,
        ...canvas.effects,
      }),
    },
  })
}
