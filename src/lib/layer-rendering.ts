import type Konva from 'konva'

import { konvaEffectConfig } from './effects'
import type { HandoutLayer, TextLayer } from './handout'

export function layerKonvaConfig(layer: HandoutLayer) {
  const config = {
    id: layer.id,
    x: layer.flipX ? layer.x + layer.width / 2 : layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    offsetX: layer.flipX ? layer.width / 2 : 0,
    scaleX: layer.flipX ? -1 : 1,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    draggable: !layer.locked,
    globalCompositeOperation: layer.blendMode,
    ...konvaEffectConfig(layer.effects),
  }
  if (layer.flipX) {
    console.log('[rotation] layerKonvaConfig FLIPPED — id:', layer.id, 'modelX:', layer.x, 'modelRotation:', layer.rotation, '→ konvaX:', config.x, 'konvaScaleX:', config.scaleX, 'konvaOffsetX:', config.offsetX, 'konvaRotation:', config.rotation)
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
  return {
    x: Math.round(layer.flipX ? node.x() - node.width() / 2 : node.x()),
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
