import Konva from 'konva'

import type { LayerEffects } from './handout'

export function hasVisibleEffects(effects?: Partial<LayerEffects>) {
  return Boolean(
    effects
    && (
      Number(effects.blur || 0) !== 0
      || Number(effects.brightness || 0) !== 0
      || Number(effects.contrast || 0) !== 0
      || Number(effects.saturation || 0) !== 0
    ),
  )
}

export function konvaEffectConfig(effects?: Partial<LayerEffects>) {
  if (!hasVisibleEffects(effects)) {
    return {
      filters: [],
      blurRadius: 0,
      brightness: 0,
      contrast: 0,
      saturation: 0,
      luminance: 0,
    }
  }

  return {
    filters: [
      Konva.Filters.Blur,
      Konva.Filters.Brighten,
      Konva.Filters.Contrast,
      Konva.Filters.HSL,
    ],
    blurRadius: Math.max(0, Number(effects?.blur || 0)),
    brightness: Number(effects?.brightness || 0) / 100,
    contrast: Number(effects?.contrast || 0),
    saturation: Number(effects?.saturation || 0) / 100,
    luminance: 0,
  }
}
