import Konva from 'konva'

import { fontRecordFamily, type LibraryRecord } from '@/lib/backend'
import { appendDebugLog } from '@/lib/backend'
import { hasVisibleEffects, konvaEffectConfig } from '@/lib/effects'
import type { HandoutLayer, TextLayer } from '@/lib/handout'

export function fontFamily(font: LibraryRecord) {
  return fontRecordFamily(font)
}

export function logText(message: string, data?: Record<string, unknown>) {
  console.debug(`[text] ${message}`, data)
  void appendDebugLog('text', message, data)
}

export function textDecoration(layer: TextLayer) {
  return [
    layer.underline ? 'underline' : '',
    layer.strikethrough ? 'line-through' : '',
  ].filter(Boolean).join(' ')
}

export function fontStyle(layer: TextLayer) {
  return [
    layer.italic ? 'italic' : '',
    `${layer.fontWeight || 400}`,
  ].filter(Boolean).join(' ')
}

export function commonConfig(layer: HandoutLayer) {
  return {
    x: layer.flipX ? layer.x + layer.width / 2 : layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    offsetX: layer.flipX ? layer.width / 2 : 0,
    scaleX: layer.flipX ? -1 : 1,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    globalCompositeOperation: layer.blendMode,
    ...konvaEffectConfig(layer.effects),
  }
}

export function localLayer(layer: HandoutLayer): HandoutLayer {
  return {
    ...layer,
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    visible: true,
    blendMode: 'source-over',
    flipX: false,
  } as HandoutLayer
}

export function maskedImageConfig(layer: HandoutLayer, canvas: HTMLCanvasElement) {
  return {
    x: layer.flipX ? layer.x + layer.width / 2 : layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    offsetX: layer.flipX ? layer.width / 2 : 0,
    scaleX: layer.flipX ? -1 : 1,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    globalCompositeOperation: layer.blendMode,
    image: canvas,
  }
}

export function prepareEffectNode<T extends Konva.Shape | Konva.Group>(node: T, effects?: HandoutLayer['effects']) {
  if (hasVisibleEffects(effects)) node.cache()
  return node
}
