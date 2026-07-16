import { describe, expect, it } from 'vitest'

import { createDefaultTokenExportSettings, createDefaultTokenVisualStyle } from '../configuration'
import type { TokenParams } from '../types'
import {
  calculateAvatarLayout,
  calculateCustomRingLayout,
  calculateGuideSegment,
  calculateHalfPlanePolygon,
  calculatePreviewCameraTransform,
  offsetFromDragDelta,
  parseRgbaHex,
} from './geometry'
import { PREVIEW_DISPLAY_TOKEN_SIZE, PREVIEW_MIN_WORLD_SIZE } from './config'

const defaultTokenParams: TokenParams = {
  size: 512,
  ...createDefaultTokenVisualStyle(),
  ...createDefaultTokenExportSettings(),
  ringImageScaleX: 100,
  ringImageScaleY: 100,
  ringImageOffsetX: 0,
  ringImageOffsetY: 0,
}
const params = () => ({ ...defaultTokenParams })

describe('preview geometry', () => {
  it('projects the 512px Token design space to a 250px preview reference', () => {
    const image = { width: 1000, height: 1000 }

    expect(PREVIEW_DISPLAY_TOKEN_SIZE).toBe(250)
    expect(PREVIEW_MIN_WORLD_SIZE).toBe(512)
    expect(
      calculateAvatarLayout(params(), image, PREVIEW_MIN_WORLD_SIZE, PREVIEW_DISPLAY_TOKEN_SIZE),
    ).toEqual({
      width: 220,
      height: 220,
      x: 146,
      y: 146,
    })
  })

  it.each([
    [10, 22],
    [100, 220],
    [500, 1099],
  ])('maps %i%% scale to a %ipx square avatar', (scale, expectedSize) => {
    const p = params()
    p.scale = scale

    const layout = calculateAvatarLayout(
      p,
      { width: 1000, height: 1000 },
      PREVIEW_MIN_WORLD_SIZE,
      PREVIEW_DISPLAY_TOKEN_SIZE,
    )

    expect(layout.width).toBe(expectedSize)
    expect(layout.height).toBe(expectedSize)
  })

  it('preserves aspect ratio for landscape and portrait images', () => {
    expect(
      calculateAvatarLayout(
        params(),
        { width: 2000, height: 1000 },
        PREVIEW_MIN_WORLD_SIZE,
        PREVIEW_DISPLAY_TOKEN_SIZE,
      ),
    ).toMatchObject({ width: 220, height: 110 })
    expect(
      calculateAvatarLayout(
        params(),
        { width: 1000, height: 2000 },
        PREVIEW_MIN_WORLD_SIZE,
        PREVIEW_DISPLAY_TOKEN_SIZE,
      ),
    ).toMatchObject({ width: 110, height: 220 })
  })

  it('converts drag deltas to clamped percentage offsets', () => {
    const p = params()

    expect(offsetFromDragDelta(p, 220, -220, PREVIEW_DISPLAY_TOKEN_SIZE)).toEqual({
      offsetX: 100,
      offsetY: -100,
    })
  })

  it('fits a custom ring long side to the outer diameter before scale and offset', () => {
    const layout = calculateCustomRingLayout(
      {
        ...params(),
        ringImageScaleX: 200,
        ringImageScaleY: 50,
        ringImageOffsetX: 20,
        ringImageOffsetY: -10,
      },
      { width: 400, height: 200 },
      256,
      PREVIEW_DISPLAY_TOKEN_SIZE,
    )
    expect(layout.x).toBeCloseTo(265.765625)
    expect(layout.y).toBeCloseTo(251.1171875)
    expect(layout.width).toBeCloseTo(488.28125)
    expect(layout.height).toBeCloseTo(61.03515625)
  })

  it('builds complementary top and bottom half-plane polygons at zero degrees', () => {
    const allowed = calculateHalfPlanePolygon(
      0,
      0,
      PREVIEW_MIN_WORLD_SIZE,
      PREVIEW_DISPLAY_TOKEN_SIZE,
      false,
    )
    const restricted = calculateHalfPlanePolygon(
      0,
      0,
      PREVIEW_MIN_WORLD_SIZE,
      PREVIEW_DISPLAY_TOKEN_SIZE,
      true,
    )

    expect(Math.max(allowed[1]!, allowed[3]!, allowed[5]!, allowed[7]!)).toBeCloseTo(256)
    expect(Math.min(restricted[1]!, restricted[3]!, restricted[5]!, restricted[7]!)).toBeCloseTo(
      256,
    )
  })

  it('places the allowed half-plane on the right at ninety degrees', () => {
    const allowed = calculateHalfPlanePolygon(
      90,
      0,
      PREVIEW_MIN_WORLD_SIZE,
      PREVIEW_DISPLAY_TOKEN_SIZE,
      false,
    )
    const xs = [allowed[0]!, allowed[2]!, allowed[4]!, allowed[6]!]

    expect(Math.min(...xs)).toBeCloseTo(256)
    expect(Math.max(...xs)).toBeGreaterThan(PREVIEW_MIN_WORLD_SIZE)
  })

  it.each([
    [-100, 6],
    [0, 256],
    [100, 506],
  ])('moves the zero-degree guide for a %i%% height to y=%i', (height, expectedY) => {
    const guide = calculateGuideSegment(
      0,
      height,
      PREVIEW_MIN_WORLD_SIZE,
      PREVIEW_DISPLAY_TOKEN_SIZE,
    )

    expect(guide.start.y).toBeCloseTo(expectedY)
    expect(guide.end.y).toBeCloseTo(expectedY)
  })

  it('parses RGB and RGBA colors for Pixi', () => {
    expect(parseRgbaHex('#FF8040')).toEqual({ color: 0xff8040, alpha: 1 })
    expect(parseRgbaHex('#FF804080')).toEqual({ color: 0xff8040, alpha: 128 / 255 })
  })

  it('applies an independent viewport zoom around the world centre', () => {
    expect(calculatePreviewCameraTransform(800, 600, 512, 2)).toEqual({
      scale: 2,
      x: -112,
      y: -212,
    })
    expect(calculatePreviewCameraTransform(800, 600, 512, 1)).toEqual({
      scale: 1,
      x: 144,
      y: 44,
    })
  })
})
