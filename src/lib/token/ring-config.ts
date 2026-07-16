import type { TokenRingConfig } from './types'

type LegacyTokenRingConfig = Omit<TokenRingConfig, 'imageScaleX' | 'imageScaleY' | 'imageOffsetX' | 'imageOffsetY'> & {
  assetScale?: number
  offsetX?: number
  offsetY?: number
  imageScaleX?: number
  imageScaleY?: number
  imageOffsetX?: number
  imageOffsetY?: number
}

export function normalizeTokenRingConfig(value: LegacyTokenRingConfig): TokenRingConfig {
  const legacyScale = (value.assetScale ?? 1) * 100
  return {
    revision: value.revision,
    designSize: value.designSize,
    innerRadius: value.innerRadius,
    outerRadius: value.outerRadius,
    imageScaleX: value.imageScaleX ?? legacyScale,
    imageScaleY: value.imageScaleY ?? legacyScale,
    imageOffsetX: value.imageOffsetX ?? value.offsetX ?? 0,
    imageOffsetY: value.imageOffsetY ?? value.offsetY ?? 0,
  }
}

export function migrateTokenRingConfig(
  value: LegacyTokenRingConfig,
  designSize: number,
): { config: TokenRingConfig; migrated: boolean } {
  const normalized = normalizeTokenRingConfig(value)
  if (normalized.designSize === designSize) return { config: normalized, migrated: false }
  const factor = designSize / normalized.designSize
  return {
    config: {
      ...normalized,
      revision: normalized.revision + 1,
      designSize,
      innerRadius: normalized.innerRadius * factor,
      outerRadius: normalized.outerRadius * factor,
      imageOffsetX: normalized.imageOffsetX * factor,
      imageOffsetY: normalized.imageOffsetY * factor,
    },
    migrated: true,
  }
}
