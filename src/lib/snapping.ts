export type GuideLine = { orientation: 'vertical' | 'horizontal'; value: number }
export type SnapLine = { value: number; source: 'canvas' | 'layer'; layerId?: string }
export type SnapMatch = {
  target: number
  source: number
  index: 0 | 1 | 2
  distance: number
  layerId?: string
}

export type SnapLayer = {
  id: string
  x: number
  y: number
  width: number
  height: number
  visible: boolean
  locked: boolean
}

type SnapAxis = 'x' | 'y'

export type SnapGuideInput = {
  movingLayer: SnapLayer
  layers: SnapLayer[]
  canvas: { width: number; height: number }
  stageScale: number
}

export type SnapGuideResult = {
  x?: SnapMatch
  y?: SnapMatch
  lines: GuideLine[]
  nextPosition: { x: number; y: number }
  thresholdCanvas: number
}

export const SNAP_THRESHOLD_SCREEN_PX = 5
export const MAX_SNAP_CANDIDATES = 24

function centerDistance(a: SnapLayer, b: SnapLayer) {
  const ax = a.x + a.width / 2
  const ay = a.y + a.height / 2
  const bx = b.x + b.width / 2
  const by = b.y + b.height / 2
  return Math.hypot(ax - bx, ay - by)
}

function candidateLayers(input: SnapGuideInput) {
  const distanceLimit = Math.max(input.canvas.width, input.canvas.height) * 0.25
  return input.layers
    .filter((layer) => layer.id !== input.movingLayer.id && layer.visible && !layer.locked)
    .map((layer) => ({ layer, distance: centerDistance(input.movingLayer, layer) }))
    .filter((item) => item.distance <= distanceLimit)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_SNAP_CANDIDATES)
    .map((item) => item.layer)
}

function guideLinesForAxis(axis: SnapAxis, input: SnapGuideInput): SnapLine[] {
  const canvasLines = axis === 'x'
    ? [0, input.canvas.width / 2, input.canvas.width]
    : [0, input.canvas.height / 2, input.canvas.height]
  const lines: SnapLine[] = canvasLines.map((value) => ({ value, source: 'canvas' }))

  for (const layer of candidateLayers(input)) {
    if (axis === 'x') {
      lines.push(
        { value: layer.x, source: 'layer', layerId: layer.id },
        { value: layer.x + layer.width / 2, source: 'layer', layerId: layer.id },
        { value: layer.x + layer.width, source: 'layer', layerId: layer.id },
      )
    } else {
      lines.push(
        { value: layer.y, source: 'layer', layerId: layer.id },
        { value: layer.y + layer.height / 2, source: 'layer', layerId: layer.id },
        { value: layer.y + layer.height, source: 'layer', layerId: layer.id },
      )
    }
  }

  return lines
}

function selfLinesForAxis(axis: SnapAxis, layer: SnapLayer) {
  return axis === 'x'
    ? [layer.x, layer.x + layer.width / 2, layer.x + layer.width]
    : [layer.y, layer.y + layer.height / 2, layer.y + layer.height]
}

function findBestMatch(axis: SnapAxis, input: SnapGuideInput, thresholdCanvas: number): SnapMatch | undefined {
  return guideLinesForAxis(axis, input)
    .flatMap((line) =>
      selfLinesForAxis(axis, input.movingLayer).map((source, index) => ({
        target: line.value,
        source,
        index: index as 0 | 1 | 2,
        distance: Math.abs(line.value - source),
        layerId: line.layerId,
      })),
    )
    .filter((match) => match.distance <= thresholdCanvas)
    .sort((a, b) => a.distance - b.distance)[0]
}

function offsetForIndex(index: 0 | 1 | 2, length: number) {
  if (index === 0) return 0
  if (index === 1) return length / 2
  return length
}

export function calculateSnapGuides(input: SnapGuideInput): SnapGuideResult {
  const safeScale = Number.isFinite(input.stageScale) && input.stageScale > 0 ? input.stageScale : 1
  const thresholdCanvas = SNAP_THRESHOLD_SCREEN_PX / safeScale
  const x = findBestMatch('x', input, thresholdCanvas)
  const y = findBestMatch('y', input, thresholdCanvas)
  const nextPosition = {
    x: x ? Math.round(x.target - offsetForIndex(x.index, input.movingLayer.width)) : input.movingLayer.x,
    y: y ? Math.round(y.target - offsetForIndex(y.index, input.movingLayer.height)) : input.movingLayer.y,
  }
  const lines: GuideLine[] = []
  if (x) lines.push({ orientation: 'vertical', value: x.target })
  if (y) lines.push({ orientation: 'horizontal', value: y.target })

  return {
    x,
    y,
    lines,
    nextPosition,
    thresholdCanvas,
  }
}
