/// <reference lib="webworker" />
import { mapRingPixelsToBand } from './radialMap'

const sources = new Map<string, { pixels: Uint8ClampedArray; size: number }>()

self.onmessage = (event: MessageEvent) => {
  const { requestId, id, source, sourceSize, targetSize, inner, outer } = event.data
  if (source) sources.set(id, { pixels: new Uint8ClampedArray(source), size: sourceSize })
  const cached = sources.get(id)
  if (!cached) {
    self.postMessage({ requestId, error: 'Worker 缺少内置环素材' })
    return
  }
  try {
    const pixels = mapRingPixelsToBand({
      pixels: cached.pixels,
      sourceSize: cached.size,
      targetSize,
      inner,
      outer,
    })
    self.postMessage({ requestId, pixels: pixels.buffer }, [pixels.buffer])
  } catch (error) {
    self.postMessage({ requestId, error: String(error) })
  }
}
