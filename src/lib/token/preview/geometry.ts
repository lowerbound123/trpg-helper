import type { TokenParams } from '../types'
import {
  PREVIEW_DISPLAY_TOKEN_SIZE,
  PREVIEW_MIN_WORLD_SIZE,
  PREVIEW_WORLD_SIZE_STEP,
} from './config'

export interface ImageSize {
  width: number
  height: number
}

export interface AvatarLayout {
  width: number
  height: number
  x: number
  y: number
}

export interface CustomRingLayout {
  x: number
  y: number
  width: number
  height: number
}

export function calculateCustomRingLayout(
  params: Pick<
    TokenParams,
    | 'size'
    | 'ringOuterRadius'
    | 'ringImageScaleX'
    | 'ringImageScaleY'
    | 'ringImageOffsetX'
    | 'ringImageOffsetY'
  >,
  source: { width: number; height: number },
  center: number,
  referenceSize: number,
): CustomRingLayout {
  const projection = referenceSize / Math.max(params.size, 1)
  const outerRadius = params.ringOuterRadius * projection
  const fit = (2 * outerRadius) / Math.max(source.width, source.height, 1)
  const width = source.width * fit * (params.ringImageScaleX / 100)
  const height = source.height * fit * (params.ringImageScaleY / 100)
  return {
    x: center + params.ringImageOffsetX * projection,
    y: center + params.ringImageOffsetY * projection,
    width,
    height,
  }
}

export interface PreviewPoint {
  x: number
  y: number
}

export interface GuideGeometry {
  start: PreviewPoint
  end: PreviewPoint
}

export interface PreviewCameraTransform {
  scale: number
  x: number
  y: number
}

export interface PixiColor {
  color: number
  alpha: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function splitNormal(angle: number): PreviewPoint {
  const radians = ((angle - 90) * Math.PI) / 180
  return { x: Math.cos(radians), y: Math.sin(radians) }
}

function calculateDisplaySize(
  params: TokenParams,
  imageSize: ImageSize,
  refSize: number,
): { width: number; height: number } {
  const aspect = imageSize.width / Math.max(imageSize.height, 1)
  const innerDiameter = params.ringInnerRadius * 2
  const baseShortSide = (refSize * innerDiameter) / Math.max(params.size, 1)
  const requestedShortSide = Math.max(1, Math.round((baseShortSide * params.scale) / 100))

  if (aspect >= 1) {
    return {
      width: requestedShortSide,
      height: Math.max(1, Math.round(requestedShortSide / aspect)),
    }
  }

  return {
    width: Math.max(1, Math.round(requestedShortSide * aspect)),
    height: requestedShortSide,
  }
}

function calculateOffsetPixels(params: TokenParams, refSize: number): { x: number; y: number } {
  const innerDiameter = params.ringInnerRadius * 2
  const scale = refSize / Math.max(params.size, 1)
  return {
    x: (params.offsetX / 100) * innerDiameter * scale,
    y: (params.offsetY / 100) * innerDiameter * scale,
  }
}

interface PointBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function clipRectangleToAllowedHalfPlane(
  width: number,
  height: number,
  offset: PreviewPoint,
  angle: number,
  heightPercent: number,
  referenceSize: number,
): PreviewPoint[] {
  const normal = splitNormal(angle)
  const heightOffset = (heightPercent / 100) * referenceSize
  const rectangle = [
    { x: -width / 2 + offset.x, y: -height / 2 + offset.y },
    { x: width / 2 + offset.x, y: -height / 2 + offset.y },
    { x: width / 2 + offset.x, y: height / 2 + offset.y },
    { x: -width / 2 + offset.x, y: height / 2 + offset.y },
  ]

  const side = (point: PreviewPoint) => normal.x * point.x + normal.y * point.y + heightOffset
  const clipped: PreviewPoint[] = []

  for (const [index, current] of rectangle.entries()) {
    const previous = rectangle[(index + rectangle.length - 1) % rectangle.length]!
    const currentSide = side(current)
    const previousSide = side(previous)
    const currentInside = currentSide >= 0
    const previousInside = previousSide >= 0

    if (currentInside !== previousInside) {
      const ratio = previousSide / (previousSide - currentSide)
      clipped.push({
        x: previous.x + (current.x - previous.x) * ratio,
        y: previous.y + (current.y - previous.y) * ratio,
      })
    }
    if (currentInside) clipped.push(current)
  }

  return clipped
}

function boundsOf(points: PreviewPoint[]): PointBounds | null {
  if (points.length === 0) return null

  return points.reduce<PointBounds>(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    {
      minX: points[0]!.x,
      minY: points[0]!.y,
      maxX: points[0]!.x,
      maxY: points[0]!.y,
    },
  )
}

export function parseRgbaHex(hex: string): PixiColor {
  const normalized = hex.replace('#', '')
  const rgb = Number.parseInt(normalized.slice(0, 6).padEnd(6, '0'), 16)
  const alphaByte = normalized.length >= 8 ? Number.parseInt(normalized.slice(6, 8), 16) : 255

  return {
    color: Number.isNaN(rgb) ? 0 : rgb,
    alpha: (Number.isNaN(alphaByte) ? 255 : alphaByte) / 255,
  }
}

export function calculateAvatarLayout(
  params: TokenParams,
  imageSize: ImageSize,
  canvasSize: number,
  refSize: number,
): AvatarLayout {
  const display = calculateDisplaySize(params, imageSize, refSize)
  const offset = calculateOffsetPixels(params, refSize)

  return {
    width: display.width,
    height: display.height,
    x: (canvasSize - display.width) / 2 + offset.x,
    y: (canvasSize - display.height) / 2 + offset.y,
  }
}

/**
 * Calculates the square world frame needed for all visible preview content.
 * The frame is centred on the Token and rounded up to stable 128px buckets.
 */
export function calculatePreviewWorldSize(
  params: TokenParams,
  imageSize: ImageSize | null,
): number {
  if (!params.splitRing || !imageSize) return PREVIEW_MIN_WORLD_SIZE

  const display = calculateDisplaySize(params, imageSize, PREVIEW_DISPLAY_TOKEN_SIZE)
  const offset = calculateOffsetPixels(params, PREVIEW_DISPLAY_TOKEN_SIZE)
  const allowedBounds = boundsOf(
    clipRectangleToAllowedHalfPlane(
      display.width,
      display.height,
      offset,
      params.splitAngle,
      params.splitHeight,
      PREVIEW_DISPLAY_TOKEN_SIZE,
    ),
  )
  const ringExtent =
    params.ringOuterRadius * (PREVIEW_DISPLAY_TOKEN_SIZE / Math.max(params.size, 1))
  const contentExtent = allowedBounds
    ? Math.max(
        ringExtent,
        Math.abs(allowedBounds.minX),
        Math.abs(allowedBounds.maxX),
        Math.abs(allowedBounds.minY),
        Math.abs(allowedBounds.maxY),
      )
    : ringExtent
  const requiredSize = Math.max(PREVIEW_MIN_WORLD_SIZE, Math.ceil(contentExtent * 2))

  return Math.ceil(requiredSize / PREVIEW_WORLD_SIZE_STEP) * PREVIEW_WORLD_SIZE_STEP
}

/** Maps a centred square preview world into the available visible viewport. */
export function calculatePreviewCameraTransform(
  viewportWidth: number,
  viewportHeight: number,
  worldSize: number,
  viewportZoom = 1,
): PreviewCameraTransform {
  const safeWorldSize = Math.max(worldSize, 1)
  const fitScale = Math.min(
    1,
    Math.max(viewportWidth, 1) / safeWorldSize,
    Math.max(viewportHeight, 1) / safeWorldSize,
  )
  const scale = fitScale * Math.min(8, Math.max(0.1, viewportZoom))

  return {
    scale,
    x: (viewportWidth - safeWorldSize * scale) / 2,
    y: (viewportHeight - safeWorldSize * scale) / 2,
  }
}

export function calculateHalfPlanePolygon(
  angle: number,
  height: number,
  canvasSize: number,
  referenceSize: number,
  invert: boolean,
): number[] {
  const normal = splitNormal(angle)
  const perpendicular = { x: -normal.y, y: normal.x }
  const heightOffset = (height / 100) * referenceSize
  const point = {
    x: canvasSize / 2 - normal.x * heightOffset,
    y: canvasSize / 2 - normal.y * heightOffset,
  }
  const extent = canvasSize * 3
  const sign = invert ? -1 : 1

  const start = {
    x: point.x - perpendicular.x * extent * sign,
    y: point.y - perpendicular.y * extent * sign,
  }
  const end = {
    x: point.x + perpendicular.x * extent * sign,
    y: point.y + perpendicular.y * extent * sign,
  }
  const normalOffset = {
    x: normal.x * extent * sign,
    y: normal.y * extent * sign,
  }

  return [
    start.x,
    start.y,
    end.x,
    end.y,
    end.x + normalOffset.x,
    end.y + normalOffset.y,
    start.x + normalOffset.x,
    start.y + normalOffset.y,
  ]
}

export function calculateGuideSegment(
  angle: number,
  height: number,
  canvasSize: number,
  referenceSize: number,
): GuideGeometry {
  const normal = splitNormal(angle)
  const perpendicular = { x: -normal.y, y: normal.x }
  const heightOffset = (height / 100) * referenceSize
  const point = {
    x: canvasSize / 2 - normal.x * heightOffset,
    y: canvasSize / 2 - normal.y * heightOffset,
  }
  const length = canvasSize / 2 + 40

  return {
    start: {
      x: point.x - perpendicular.x * length,
      y: point.y - perpendicular.y * length,
    },
    end: {
      x: point.x + perpendicular.x * length,
      y: point.y + perpendicular.y * length,
    },
  }
}

export function offsetFromDragDelta(
  params: TokenParams,
  deltaX: number,
  deltaY: number,
  refSize: number,
): { offsetX: number; offsetY: number } {
  const logicalInnerDiameter = params.ringInnerRadius * 2 * (refSize / Math.max(params.size, 1))
  if (logicalInnerDiameter <= 0) {
    return { offsetX: params.offsetX, offsetY: params.offsetY }
  }

  const factor = 100 / logicalInnerDiameter
  return {
    offsetX: clamp(params.offsetX + deltaX * factor, -100, 100),
    offsetY: clamp(params.offsetY + deltaY * factor, -100, 100),
  }
}
