import type { HandoutLayer, LayerMask, PaintStroke } from './handout'

export type AffineMatrix = [number, number, number, number, number, number]
export type Point = { x: number; y: number }

export function identityMatrix(): AffineMatrix {
  return [1, 0, 0, 1, 0, 0]
}

export function matrixMultiply(left: AffineMatrix, right: AffineMatrix): AffineMatrix {
  const [a1, b1, c1, d1, e1, f1] = left
  const [a2, b2, c2, d2, e2, f2] = right
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ]
}

export function matrixTranslate(x: number, y: number): AffineMatrix {
  return [1, 0, 0, 1, x, y]
}

export function matrixScale(x: number, y: number): AffineMatrix {
  return [x, 0, 0, y, 0, 0]
}

export function matrixRotate(degrees: number): AffineMatrix {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return [cos, sin, -sin, cos, 0, 0]
}

export function matrixFromComponents(input: {
  x: number
  y: number
  rotation?: number
  scaleX?: number
  scaleY?: number
}): AffineMatrix {
  return matrixMultiply(
    matrixMultiply(matrixTranslate(input.x, input.y), matrixRotate(input.rotation ?? 0)),
    matrixScale(input.scaleX ?? 1, input.scaleY ?? 1),
  )
}

export function matrixDecompose(matrix: AffineMatrix) {
  const [a, b, c, d, e, f] = matrix
  const scaleX = Math.hypot(a, b) || 1
  const determinant = a * d - b * c
  const scaleY = determinant / scaleX
  return {
    x: e,
    y: f,
    rotation: Math.atan2(b, a) * 180 / Math.PI,
    scaleX,
    scaleY,
  }
}

export function matrixInverse(matrix: AffineMatrix): AffineMatrix {
  const [a, b, c, d, e, f] = matrix
  const determinant = a * d - b * c
  if (Math.abs(determinant) < 1e-9) return identityMatrix()
  return [
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * f - d * e) / determinant,
    (b * e - a * f) / determinant,
  ]
}

export function matrixApplyToPoint(matrix: AffineMatrix, point: Point): Point {
  const [a, b, c, d, e, f] = matrix
  return {
    x: roundForGeometry(a * point.x + c * point.y + e),
    y: roundForGeometry(b * point.x + d * point.y + f),
  }
}

export function matrixNearlyEqual(left: AffineMatrix, right: AffineMatrix, tolerance = 1e-6) {
  return left.every((value, index) => Math.abs(value - right[index]) <= tolerance)
}

export function layerWorldMatrix(layer: HandoutLayer): AffineMatrix {
  const x = layer.flipX ? layer.x + layer.width : layer.x
  const flip = layer.flipX ? matrixScale(-1, 1) : identityMatrix()
  return matrixMultiply(
    matrixMultiply(matrixTranslate(x, layer.y), matrixRotate(layer.rotation || 0)),
    flip,
  )
}

export function maskTransformFromLayer(layer: HandoutLayer): AffineMatrix {
  return layerWorldMatrix(layer)
}

export function syncMaskWithLayerDelta(
  previousLayer: HandoutLayer,
  nextLayer: HandoutLayer,
  mask: LayerMask,
): LayerMask {
  const delta = matrixMultiply(layerWorldMatrix(nextLayer), matrixInverse(layerWorldMatrix(previousLayer)))
  return {
    ...mask,
    matrix: matrixMultiply(delta, mask.matrix),
    updatedAt: new Date().toISOString(),
  }
}

export function documentPointToMaskLocal(mask: LayerMask, point: Point): Point {
  return matrixApplyToPoint(matrixInverse(mask.matrix), point)
}

export function tilesForStroke(input: {
  points: PaintStroke['points']
  strokeWidth: number
  maskWidth: number
  maskHeight: number
  tileSize: number
}) {
  const points = input.points
  const xs: number[] = []
  const ys: number[] = []
  for (let index = 0; index < points.length; index += 2) {
    xs.push(points[index] ?? 0)
    ys.push(points[index + 1] ?? 0)
  }
  const radius = Math.max(0, input.strokeWidth / 2)
  const minX = clamp(Math.floor((Math.min(...xs) - radius) / input.tileSize), 0, Math.ceil(input.maskWidth / input.tileSize) - 1)
  const maxX = clamp(Math.floor((Math.max(...xs) + radius) / input.tileSize), 0, Math.ceil(input.maskWidth / input.tileSize) - 1)
  const minY = clamp(Math.floor((Math.min(...ys) - radius) / input.tileSize), 0, Math.ceil(input.maskHeight / input.tileSize) - 1)
  const maxY = clamp(Math.floor((Math.max(...ys) + radius) / input.tileSize), 0, Math.ceil(input.maskHeight / input.tileSize) - 1)
  const keys: string[] = []
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      keys.push(`${x}:${y}`)
    }
  }
  return keys
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function roundForGeometry(value: number) {
  const rounded = Math.round(value * 1_000_000) / 1_000_000
  return Object.is(rounded, -0) ? 0 : rounded
}
