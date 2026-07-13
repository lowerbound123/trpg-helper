export interface RadialMapRequest {
  pixels: Uint8ClampedArray
  sourceSize: number
  targetSize: number
  inner: number
  outer: number
}

function alphaBounds(pixels: Uint8ClampedArray, size: number): [number, number] {
  const center = size / 2
  let inner = Number.POSITIVE_INFINITY
  let outer = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (pixels[(y * size + x) * 4 + 3] === 0) continue
      const radius = Math.hypot(x + 0.5 - center, y + 0.5 - center)
      inner = Math.min(inner, radius)
      outer = Math.max(outer, radius)
    }
  }
  if (!Number.isFinite(inner) || outer <= inner) throw new Error('圆环素材没有有效 Alpha 环带')
  return [inner, outer]
}

function sample(pixels: Uint8ClampedArray, size: number, x: number, y: number, channel: number) {
  const x0 = Math.max(0, Math.min(size - 1, Math.floor(x)))
  const y0 = Math.max(0, Math.min(size - 1, Math.floor(y)))
  const x1 = Math.min(size - 1, x0 + 1)
  const y1 = Math.min(size - 1, y0 + 1)
  const tx = x - Math.floor(x)
  const ty = y - Math.floor(y)
  const at = (px: number, py: number) => pixels[(py * size + px) * 4 + channel]!
  return Math.round(
    (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) +
      (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty,
  )
}

/** Pure RGBA radial remapping shared by the worker and its main-thread fallback. */
export function mapRingPixelsToBand(request: RadialMapRequest): Uint8ClampedArray {
  const { pixels, sourceSize, targetSize, inner, outer } = request
  if (sourceSize <= 0 || targetSize <= 0 || inner < 0 || outer <= inner) {
    throw new Error('圆环半径或纹理尺寸无效')
  }
  if (pixels.length !== sourceSize * sourceSize * 4) throw new Error('圆环 RGBA 数据长度无效')

  const [sourceInner, sourceOuter] = alphaBounds(pixels, sourceSize)
  const sourceBand = sourceOuter - sourceInner
  const targetBand = outer - inner
  const targetCenter = targetSize / 2
  const sourceCenter = sourceSize / 2
  const output = new Uint8ClampedArray(targetSize * targetSize * 4)

  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      const dx = x + 0.5 - targetCenter
      const dy = y + 0.5 - targetCenter
      const radius = Math.hypot(dx, dy)
      if (radius < inner || radius > outer) continue
      const sourceRadius = sourceInner + ((radius - inner) / targetBand) * sourceBand
      const ratio = radius === 0 ? 0 : sourceRadius / radius
      const sx = sourceCenter + dx * ratio - 0.5
      const sy = sourceCenter + dy * ratio - 0.5
      const outputOffset = (y * targetSize + x) * 4
      for (let channel = 0; channel < 4; channel++) {
        output[outputOffset + channel] = sample(pixels, sourceSize, sx, sy, channel)
      }
    }
  }
  return output
}
