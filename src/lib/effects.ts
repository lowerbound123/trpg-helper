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
  const blur = Math.max(0, Number(effects?.blur || 0))
  const brightness = Number(effects?.brightness || 0)
  const contrast = Number(effects?.contrast || 0)
  const saturation = Number(effects?.saturation || 0)
  const filters = [
    blur ? Konva.Filters.Blur : undefined,
    brightness ? Konva.Filters.Brighten : undefined,
    contrast ? Konva.Filters.Contrast : undefined,
    saturation ? Konva.Filters.HSL : undefined,
  ].filter((filter): filter is typeof Konva.Filters.Blur => Boolean(filter))

  return {
    filters,
    blurRadius: blur,
    brightness: brightness / 100,
    contrast,
    saturation: saturation / 100,
    luminance: 0,
  }
}
