import type { BrushKind, PaintLayer, PaintStroke } from './handout'

type PaintBaseConfig = Record<string, unknown>

type BrushRenderPreset = {
  opacity: number
  widthMultiplier: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
  shadowBlur?: number
}

const brushDefaults: Record<BrushKind, BrushRenderPreset> = {
  pixel: { opacity: 1, widthMultiplier: 1, lineCap: 'round', lineJoin: 'round' },
  pencil: { opacity: 0.72, widthMultiplier: 0.55, lineCap: 'round', lineJoin: 'round' },
  marker: { opacity: 0.88, widthMultiplier: 1.35, lineCap: 'round', lineJoin: 'round' },
  highlighter: { opacity: 0.35, widthMultiplier: 2.2, lineCap: 'square', lineJoin: 'round' },
  airbrush: { opacity: 0.24, widthMultiplier: 1.8, lineCap: 'round', lineJoin: 'round', shadowBlur: 10 },
}

const paintCanvasCache = new Map<string, {
  signature: string
  strokeSignatures: string[]
  width: number
  height: number
  canvas: HTMLCanvasElement
}>()

export function brushRenderPreset(kind: BrushKind = 'pixel') {
  return brushDefaults[kind]
}

function strokeSignature(stroke: PaintStroke) {
  const lastX = stroke.points.at(-2) ?? 0
  const lastY = stroke.points.at(-1) ?? 0
  return [
    stroke.id,
    stroke.points.length,
    lastX.toFixed(2),
    lastY.toFixed(2),
    stroke.strokeWidth,
    stroke.color,
    stroke.tension,
    stroke.mode,
    stroke.brushKind ?? 'pixel',
    stroke.opacity ?? '',
    stroke.eraserOpacity ?? '',
  ].join(':')
}

function layerSignature(layer: PaintLayer) {
  return [
    Math.ceil(layer.width),
    Math.ceil(layer.height),
    layer.strokes.length,
    ...layer.strokes.map(strokeSignature),
  ].join('|')
}

function drawLineStroke(context: CanvasRenderingContext2D, stroke: PaintStroke) {
  if (stroke.points.length < 2) return
  const kind = stroke.brushKind ?? 'pixel'
  const preset = brushDefaults[kind]
  context.strokeStyle = stroke.color
  context.lineWidth = Math.max(1, stroke.strokeWidth * preset.widthMultiplier)
  context.lineCap = preset.lineCap
  context.lineJoin = preset.lineJoin
  if (preset.shadowBlur) {
    context.shadowColor = stroke.color
    context.shadowBlur = preset.shadowBlur
  }
  context.beginPath()
  context.moveTo(stroke.points[0], stroke.points[1])
  if (kind === 'pixel' || stroke.points.length <= 4) {
    for (let index = 2; index < stroke.points.length; index += 2) {
      context.lineTo(stroke.points[index], stroke.points[index + 1])
    }
  } else {
    for (let index = 2; index < stroke.points.length - 2; index += 2) {
      const controlX = stroke.points[index]
      const controlY = stroke.points[index + 1]
      const nextX = stroke.points[index + 2]
      const nextY = stroke.points[index + 3]
      context.quadraticCurveTo(controlX, controlY, (controlX + nextX) / 2, (controlY + nextY) / 2)
    }
    context.lineTo(stroke.points.at(-2) ?? stroke.points[0], stroke.points.at(-1) ?? stroke.points[1])
  }
  context.stroke()
}

function drawStroke(context: CanvasRenderingContext2D, stroke: PaintStroke) {
  const kind = stroke.brushKind ?? 'pixel'
  context.save()
  context.globalCompositeOperation = stroke.mode === 'eraser' ? 'destination-out' : 'source-over'
  context.globalAlpha = stroke.mode === 'eraser'
    ? Math.max(0.01, Math.min(1, stroke.eraserOpacity ?? 1))
    : Math.max(0.01, Math.min(1, stroke.opacity ?? brushDefaults[kind].opacity))
  drawLineStroke(context, stroke)
  context.restore()
}

export function paintSceneFunc(layer: PaintLayer) {
  return (context: any) => {
    const width = Math.max(1, Math.ceil(layer.width))
    const height = Math.max(1, Math.ceil(layer.height))
    const signature = layerSignature(layer)
    const strokeSignatures = layer.strokes.map(strokeSignature)
    const cached = paintCanvasCache.get(layer.id)
    if (cached?.signature === signature) {
      context.drawImage?.(cached.canvas, 0, 0)
      return
    }
    if (
      cached
      && cached.width === width
      && cached.height === height
      && cached.strokeSignatures.length < strokeSignatures.length
      && cached.strokeSignatures.every((item, index) => item === strokeSignatures[index])
    ) {
      const paintContext = cached.canvas.getContext('2d')
      if (paintContext) {
        for (const stroke of layer.strokes.slice(cached.strokeSignatures.length)) {
          drawStroke(paintContext, stroke)
        }
        paintCanvasCache.set(layer.id, {
          signature,
          strokeSignatures,
          width,
          height,
          canvas: cached.canvas,
        })
        context.drawImage?.(cached.canvas, 0, 0)
        return
      }
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const paintContext = canvas.getContext('2d')
    if (!paintContext) return
    for (const stroke of layer.strokes) drawStroke(paintContext, stroke)
    paintCanvasCache.set(layer.id, {
      signature,
      strokeSignatures,
      width,
      height,
      canvas,
    })
    context.drawImage?.(canvas, 0, 0)
  }
}

export function paintKonvaConfig(layer: PaintLayer, base: PaintBaseConfig) {
  return {
    ...base,
    sceneFunc: paintSceneFunc(layer),
    hitFunc: (context: any, shape: unknown) => {
      context.beginPath()
      context.rect(0, 0, layer.width, layer.height)
      context.closePath()
      context.fillStrokeShape(shape)
    },
  }
}

export function paintStrokeLineConfig(stroke: PaintStroke) {
  const kind = stroke.brushKind ?? 'pixel'
  return {
    points: stroke.points,
    stroke: stroke.mode === 'eraser' ? 'rgba(255,255,255,0.9)' : stroke.color,
    strokeWidth: Math.max(1, stroke.strokeWidth * brushDefaults[kind].widthMultiplier),
    opacity: stroke.mode === 'eraser' ? stroke.eraserOpacity : stroke.opacity,
    tension: kind === 'pixel' ? 0 : stroke.tension,
    lineCap: brushDefaults[kind].lineCap,
    lineJoin: brushDefaults[kind].lineJoin,
    shadowColor: stroke.mode === 'eraser' ? undefined : stroke.color,
    shadowBlur: stroke.mode === 'eraser' ? 0 : brushDefaults[kind].shadowBlur ?? 0,
    listening: false,
  }
}
