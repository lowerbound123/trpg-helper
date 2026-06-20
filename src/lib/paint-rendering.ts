import type { PaintLayer, PaintStroke } from './handout'

type PaintBaseConfig = Record<string, unknown>

function drawStroke(context: CanvasRenderingContext2D, stroke: PaintStroke) {
  if (stroke.points.length < 2) return
  context.save()
  context.globalCompositeOperation = stroke.mode === 'eraser' ? 'destination-out' : 'source-over'
  context.strokeStyle = stroke.color
  context.lineWidth = Math.max(1, stroke.strokeWidth)
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  context.moveTo(stroke.points[0], stroke.points[1])
  for (let index = 2; index < stroke.points.length; index += 2) {
    context.lineTo(stroke.points[index], stroke.points[index + 1])
  }
  context.stroke()
  context.restore()
}

export function paintSceneFunc(layer: PaintLayer) {
  return (context: any) => {
    const width = Math.max(1, Math.ceil(layer.width))
    const height = Math.max(1, Math.ceil(layer.height))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const paintContext = canvas.getContext('2d')
    if (!paintContext) return
    for (const stroke of layer.strokes) drawStroke(paintContext, stroke)
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
  return {
    points: stroke.points,
    stroke: stroke.mode === 'eraser' ? 'rgba(255,255,255,0.9)' : stroke.color,
    strokeWidth: Math.max(1, stroke.strokeWidth),
    tension: stroke.tension,
    lineCap: 'round',
    lineJoin: 'round',
    listening: false,
  }
}
