import { describe, expect, it } from 'vitest'

import { migrateTokenRingConfig, normalizeTokenRingConfig } from './ring-config'

describe('normalizeTokenRingConfig', () => {
  it('migrates legacy uniform scale and offsets to independent axes', () => {
    expect(normalizeTokenRingConfig({
      revision: 7,
      designSize: 512,
      innerRadius: 220,
      outerRadius: 250,
      assetScale: 1.25,
      offsetX: 12,
      offsetY: -8,
    })).toEqual({
      revision: 7,
      designSize: 512,
      innerRadius: 220,
      outerRadius: 250,
      imageScaleX: 125,
      imageScaleY: 125,
      imageOffsetX: 12,
      imageOffsetY: -8,
    })
  })

  it('preserves modern independent ring geometry', () => {
    expect(normalizeTokenRingConfig({
      revision: 2,
      designSize: 1024,
      innerRadius: 440,
      outerRadius: 500,
      imageScaleX: 130,
      imageScaleY: 85,
      imageOffsetX: 20,
      imageOffsetY: -15,
    })).toMatchObject({ imageScaleX: 130, imageScaleY: 85, imageOffsetX: 20, imageOffsetY: -15 })
  })

  it('rescales non-standard design sizes to the configured design size', () => {
    expect(migrateTokenRingConfig({
      revision: 3,
      designSize: 1024,
      innerRadius: 450,
      outerRadius: 500,
      imageScaleX: 120,
      imageScaleY: 80,
      imageOffsetX: 40,
      imageOffsetY: -20,
    }, 512)).toEqual({
      config: {
        revision: 4,
        designSize: 512,
        innerRadius: 225,
        outerRadius: 250,
        imageScaleX: 120,
        imageScaleY: 80,
        imageOffsetX: 20,
        imageOffsetY: -10,
      },
      migrated: true,
    })
  })
})
