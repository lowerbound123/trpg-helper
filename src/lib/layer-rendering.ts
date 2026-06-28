import type Konva from 'konva'

import { konvaEffectConfig } from './effects'
import type { HandoutLayer, TextLayer } from './handout'

export function layerKonvaConfig(layer: HandoutLayer) {
  // For flipped layers, use right-edge alignment (x+width, scaleX=-1, offsetX=0)
  // instead of center-offset (x+width/2, scaleX=-1, offsetX=width/2).
  // offsetX shifts the Konva local origin and causes the Transformer to
  // miscompute the bounding-box rotation (off by 180°).
  const x = layer.flipX ? layer.x + layer.width : layer.x
  const scaleX = layer.flipX ? -1 : 1

  const config = {
    id: layer.id,
    x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    offsetX: 0,
    scaleX,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    draggable: !layer.locked,
    globalCompositeOperation: layer.blendMode,
    ...konvaEffectConfig(layer.effects),
  }
  return config
}

export function layerPositionFromNode(layer: HandoutLayer, node: Konva.Node) {
  if (layer.type === 'shape' && layer.shape === 'ellipse') {
    return {
      x: Math.round(node.x() - layer.width / 2),
      y: Math.round(node.y() - layer.height / 2),
    }
  }
  // For flipped layers: Konva x is at the right edge (x + width, scaleX=-1).
  // Convert back to model x (left edge) by subtracting full width.
  // Non-flipped: Konva x is at left edge, return directly.
  return {
    x: Math.round(layer.flipX ? node.x() - node.width() : node.x()),
    y: Math.round(node.y()),
  }
}

export function textKonvaConfig(layer: TextLayer, fontFamily: string) {
  return {
    ...layerKonvaConfig(layer),
    text: layer.text,
    fontFamily,
    fontSize: layer.fontSize,
    fontStyle: `${layer.italic ? 'italic ' : ''}${layer.fontWeight || 400}`,
    textDecoration: [
      layer.underline ? 'underline' : '',
      layer.strikethrough ? 'line-through' : '',
    ].filter(Boolean).join(' '),
    fill: layer.fill,
    align: layer.align,
    lineHeight: layer.lineHeight,
    verticalAlign: 'top',
  }
}
