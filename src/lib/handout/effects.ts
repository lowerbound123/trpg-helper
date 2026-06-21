export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'

export interface LayerEffects {
  brightness: number
  contrast: number
  saturation: number
  blur: number
}

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
