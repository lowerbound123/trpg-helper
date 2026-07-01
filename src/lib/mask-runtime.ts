import type { HandoutLayer, LayerMask, MaskEditOperation, MaskShapeOperation, PaintStroke } from './handout'
import { appendDebugLog } from './backend'
import { applyLayerMaskToCanvas, createLayerLocalMaskCanvas } from './mask'
import {
  drawMaskOperationToContext,
  maskEditOperations,
  maskShapeContentKey,
  maskStrokeStrength,
  maskStrokeTargetValue,
  normalizeMaskCanvasToSingleChannel,
} from './mask-shapes'
import { appendSpeedLog } from './speed-log'
import {
  layerWorldMatrix,
  matrixInverse,
  matrixMultiply,
  matrixNearlyEqual,
  tilesForStroke,
  type AffineMatrix,
} from './mask-geometry'

export type MaskRuntimeHandle = {
  maskId: string
  revision: number
  width: number
  height: number
  canvas?: HTMLCanvasElement
}

export type MaskRuntimeApplyResult = {
  dirtyTileKeys: string[]
  revision: number
}

type MaskRuntimeState = MaskRuntimeHandle & {
  canvas?: HTMLCanvasElement
  renderedOperationCount: number
  defaultAlpha: number
  sourceKey: string
  contentKey: string
}

export function maskStrokeGrayValue(stroke: PaintStroke) {
  return maskStrokeTargetValue(stroke)
}

export function maskRuntimeContentKey(mask: LayerMask) {
  return [
    mask.version,
    mask.defaultAlpha,
    mask.width,
    mask.height,
    maskEditOperations(mask).map(maskOperationContentKey).join(';'),
  ].join('|')
}

export function maskLayerCompositeSignature(layer: HandoutLayer, zoomBucket: string) {
  const mask = layer.mask
  if (!mask?.enabled) return `${layer.id}:mask-disabled:${zoomBucket}`
  const relativeMaskMatrix = normalizeMatrixForSignature(
    matrixMultiply(matrixInverse(layerWorldMatrix(layer)), mask.matrix),
  )
  return [
    layer.id,
    sourceLayerSignature(layer),
    mask.id,
    mask.version,
    mask.defaultAlpha,
    mask.width,
    mask.height,
    mask.tileSize,
    Object.keys(mask.tiles).sort().join(','),
    relativeMaskMatrix.join(','),
    zoomBucket,
  ].join(':')
}

export class MaskGpuRuntime {
  private readonly masks = new Map<string, MaskRuntimeState>()
  private readonly layerOutputs = new Map<string, HTMLCanvasElement>()
  private readonly maxMaskStates = 128
  private readonly maxLayerOutputs = 64

  ensureMask(mask: LayerMask): MaskRuntimeHandle {
    const state = this.ensureMaskState(mask)
    return {
      maskId: state.maskId,
      revision: state.revision,
      width: state.width,
      height: state.height,
      canvas: state.canvas,
    }
  }

  applyStroke(mask: LayerMask, stroke: PaintStroke): MaskRuntimeApplyResult {
    const dirtyTileKeys = tilesForStroke({
      points: stroke.points,
      strokeWidth: stroke.strokeWidth,
      maskWidth: mask.width,
      maskHeight: mask.height,
      tileSize: mask.tileSize,
    })
    const state = this.syncStrokeApplied(mask, stroke, mask.version + 1)
    return { dirtyTileKeys, revision: state.revision }
  }

  syncStrokeApplied(mask: LayerMask, stroke: PaintStroke, nextVersion: number): MaskRuntimeHandle {
    const state = this.ensureMaskState(mask)
    const nextOperations: MaskEditOperation[] = [
      ...maskEditOperations(mask),
      { id: stroke.id, kind: 'stroke', stroke },
    ]
    const nextContentKey = maskRuntimeContentKey({
      ...mask,
      version: nextVersion,
      strokes: [...mask.strokes, stroke],
      operations: nextOperations,
    })
    if (state.contentKey === nextContentKey && state.revision >= nextVersion && state.renderedOperationCount >= nextOperations.length) {
      void appendDebugLog('mask', 'mask-runtime-stroke-skip-current', {
        maskId: mask.id,
        strokeId: stroke.id,
        revision: state.revision,
        nextVersion,
        renderedOperationCount: state.renderedOperationCount,
      })
      return {
        maskId: state.maskId,
        revision: state.revision,
        width: state.width,
        height: state.height,
        canvas: state.canvas,
      }
    }
    if (state.canvas) {
      const context = state.canvas.getContext('2d')
      if (context) drawMaskOperationToContext(context, { id: stroke.id, kind: 'stroke', stroke })
    }
    state.renderedOperationCount = Math.max(state.renderedOperationCount + 1, nextOperations.length)
    state.revision = Math.max(state.revision, nextVersion)
    state.contentKey = nextContentKey
    void appendDebugLog('mask', 'mask-runtime-stroke-synced', {
      maskId: mask.id,
      strokeId: stroke.id,
      mode: stroke.mode,
      targetValue: maskStrokeTargetValue(stroke),
      strength: maskStrokeStrength(stroke),
      pointCount: Math.floor((stroke.points?.length ?? 0) / 2),
      nextVersion,
      revision: state.revision,
      renderedOperationCount: state.renderedOperationCount,
      hasCanvas: Boolean(state.canvas),
    })
    return {
      maskId: state.maskId,
      revision: state.revision,
      width: state.width,
      height: state.height,
      canvas: state.canvas,
    }
  }

  syncShapeApplied(mask: LayerMask, shape: MaskShapeOperation, nextVersion: number): MaskRuntimeHandle {
    const state = this.ensureMaskState(mask)
    const nextOperations: MaskEditOperation[] = [
      ...maskEditOperations(mask),
      { id: shape.id, kind: 'shape', shape },
    ]
    const nextContentKey = maskRuntimeContentKey({
      ...mask,
      version: nextVersion,
      shapes: [...(mask.shapes ?? []), shape],
      operations: nextOperations,
    })
    if (state.contentKey === nextContentKey && state.revision >= nextVersion && state.renderedOperationCount >= nextOperations.length) {
      void appendDebugLog('mask', 'mask-runtime-shape-skip-current', {
        maskId: mask.id,
        shapeId: shape.id,
        revision: state.revision,
        nextVersion,
        renderedOperationCount: state.renderedOperationCount,
      })
      return {
        maskId: state.maskId,
        revision: state.revision,
        width: state.width,
        height: state.height,
        canvas: state.canvas,
      }
    }
    if (state.canvas) {
      const context = state.canvas.getContext('2d')
      if (context) drawMaskOperationToContext(context, { id: shape.id, kind: 'shape', shape })
    }
    state.renderedOperationCount = Math.max(state.renderedOperationCount + 1, nextOperations.length)
    state.revision = Math.max(state.revision, nextVersion)
    state.contentKey = nextContentKey
    void appendDebugLog('mask', 'mask-runtime-shape-synced', {
      maskId: mask.id,
      shapeId: shape.id,
      shape: shape.shape,
      value: shape.value,
      bounds: { x: shape.x, y: shape.y, width: shape.width, height: shape.height },
      pointCount: shape.polygonPoints?.length ?? 0,
      nextVersion,
      revision: state.revision,
      renderedOperationCount: state.renderedOperationCount,
      hasCanvas: Boolean(state.canvas),
    })
    return {
      maskId: state.maskId,
      revision: state.revision,
      width: state.width,
      height: state.height,
      canvas: state.canvas,
    }
  }

  hasMaskSource(mask: LayerMask, sourceKey: string) {
    const current = this.masks.get(mask.id)
    return Boolean(
      current
      && current.width === mask.width
      && current.height === mask.height
      && current.revision === mask.version
      && current.renderedOperationCount === maskEditOperations(mask).length
      && current.contentKey === maskRuntimeContentKey(mask)
      && current.sourceKey === sourceKey,
    )
  }

  hasCurrentMask(mask: LayerMask) {
    const current = this.masks.get(mask.id)
    return Boolean(
      current
      && current.width === mask.width
      && current.height === mask.height
      && current.defaultAlpha === mask.defaultAlpha
      && current.revision === mask.version
      && current.renderedOperationCount === maskEditOperations(mask).length
      && current.contentKey === maskRuntimeContentKey(mask),
    )
  }

  seedMask(mask: LayerMask, source: CanvasImageSource, sourceKey: string, strokesAlreadyApplied = false) {
    const canvas = createRuntimeCanvas(mask.width, mask.height)
    const context = canvas?.getContext('2d')
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(source, 0, 0, canvas.width, canvas.height)
      normalizeMaskCanvasToSingleChannel(context, canvas.width, canvas.height)
      if (!strokesAlreadyApplied) {
        for (const operation of maskEditOperations(mask)) drawMaskOperationToContext(context, operation)
      }
    }
    const state: MaskRuntimeState = {
      maskId: mask.id,
      revision: mask.version,
      width: mask.width,
      height: mask.height,
      canvas,
      renderedOperationCount: maskEditOperations(mask).length,
      defaultAlpha: mask.defaultAlpha,
      sourceKey,
      contentKey: maskRuntimeContentKey(mask),
    }
    this.setMaskState(mask.id, state)
    return state
  }

  composeLayer(layer: HandoutLayer, sourceCanvas: HTMLCanvasElement, sourceScale = 1): HTMLCanvasElement {
    if (!layer.mask?.enabled) return sourceCanvas
    const state = this.ensureMaskState(layer.mask)
    if (!state.canvas) return sourceCanvas
    const composed = applyLayerMaskToCanvas(
      sourceCanvas,
      state.canvas as unknown as HTMLImageElement,
      layer,
      layer.mask,
      sourceScale,
    )
    const output = this.ensureLayerOutput(layer.id, composed.width, composed.height)
    const context = output.getContext('2d')
    if (!context) return composed
    context.clearRect(0, 0, output.width, output.height)
    context.drawImage(composed, 0, 0)
    return output
  }

  async composeLayerAsync(layer: HandoutLayer, sourceCanvas: HTMLCanvasElement, sourceScale = 1): Promise<HTMLCanvasElement> {
    if (!layer.mask?.enabled) return sourceCanvas
    const state = this.ensureMaskState(layer.mask)
    if (!state.canvas) return sourceCanvas
    try {
      const localMask = createLayerLocalMaskCanvas(
        state.canvas as unknown as HTMLImageElement,
        layer,
        layer.mask,
        sourceCanvas.width,
        sourceCanvas.height,
        sourceScale,
      )
      const { composeMaskPreview } = await import('./pixi/PixiMaskBridge')
      const result = await composeMaskPreview({
        layerId: layer.id,
        maskId: layer.mask.id,
        sourceCanvas,
        localMaskCanvas: localMask,
        sourceVersion: layer.mask.sourceVersion,
        maskVersion: layer.mask.version,
        maskMatrixKey: layer.mask.matrix.join(','),
      })
      appendSpeedLog('mask-gpu-compose-detail', {
        layerId: layer.id,
        maskId: layer.mask.id,
        loadMs: result.durationMs.load,
        renderMs: result.durationMs.render,
        extractMs: result.durationMs.extract,
        totalMs: result.durationMs.total,
      })
      const output = this.ensureLayerOutput(layer.id, result.canvas.width, result.canvas.height)
      const context = output.getContext('2d')
      if (!context) return result.canvas
      context.clearRect(0, 0, output.width, output.height)
      context.drawImage(result.canvas, 0, 0)
      return output
    } catch (error) {
      appendSpeedLog('mask-compose-fallback', {
        layerId: layer.id,
        maskId: layer.mask.id,
        error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      })
      return this.composeLayer(layer, sourceCanvas, sourceScale)
    }
  }

  thumbnail(mask: LayerMask, size: number): string {
    const state = this.ensureMaskState(mask)
    if (!state.canvas || typeof document === 'undefined') return ''
    const largest = Math.max(mask.width, mask.height)
    const scale = largest > 0 ? Math.min(1, size / largest) : 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(mask.width * scale))
    canvas.height = Math.max(1, Math.round(mask.height * scale))
    canvas.getContext('2d')?.drawImage(state.canvas, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  }

  maskCanvas(mask: LayerMask): HTMLCanvasElement | undefined {
    return this.ensureMaskState(mask).canvas
  }

  materialize(mask: LayerMask): string {
    const canvas = this.ensureMaskState(mask).canvas
    return canvas ? canvas.toDataURL('image/png') : ''
  }

  materializeMaskDataUrl(mask: LayerMask): string {
    return this.materialize(mask)
  }

  disposeMissing(maskIds: Iterable<string>, layerIds: Iterable<string>) {
    const masks = new Set(maskIds)
    const layers = new Set(layerIds)
    for (const key of this.masks.keys()) {
      if (!masks.has(key)) this.masks.delete(key)
    }
    for (const key of this.layerOutputs.keys()) {
      if (!layers.has(key)) this.layerOutputs.delete(key)
    }
  }

  maskStateCount() {
    return this.masks.size
  }

  layerOutputCount() {
    return this.layerOutputs.size
  }

  private ensureMaskState(mask: LayerMask): MaskRuntimeState {
    const current = this.masks.get(mask.id)
    const contentKey = maskRuntimeContentKey(mask)
    if (current && current.width === mask.width && current.height === mask.height && current.defaultAlpha === mask.defaultAlpha) {
      if (current.contentKey === contentKey && current.revision === mask.version && current.renderedOperationCount === maskEditOperations(mask).length) return current
      if (canAppendMaskRuntimeOperations(current, mask)) {
        const context = current.canvas?.getContext('2d')
        const appendedOperations = maskEditOperations(mask).slice(current.renderedOperationCount)
        if (context) {
          for (const operation of appendedOperations) {
            drawMaskOperationToContext(context, operation)
          }
        }
        current.renderedOperationCount = maskEditOperations(mask).length
        current.revision = mask.version
        current.contentKey = contentKey
        void appendDebugLog('mask', 'mask-runtime-append-operations', {
          maskId: mask.id,
          appendedCount: appendedOperations.length,
          appended: appendedOperations.map(maskOperationSummary),
          revision: current.revision,
          renderedOperationCount: current.renderedOperationCount,
          hasCanvas: Boolean(current.canvas),
        })
        return current
      }
    }
    const state = current && current.width === mask.width && current.height === mask.height
      ? current
      : {
          maskId: mask.id,
          revision: 0,
          width: mask.width,
          height: mask.height,
          canvas: createRuntimeCanvas(mask.width, mask.height),
          renderedOperationCount: 0,
          defaultAlpha: mask.defaultAlpha,
          sourceKey: defaultMaskSourceKey(mask),
          contentKey: '',
        }
    state.revision = mask.version
    state.defaultAlpha = mask.defaultAlpha
    state.sourceKey = defaultMaskSourceKey(mask)
    state.contentKey = contentKey
    if (state.canvas) {
      resetMaskCanvas(state.canvas, mask.defaultAlpha)
      const context = state.canvas.getContext('2d')
      if (context) {
        for (const operation of maskEditOperations(mask)) drawMaskOperationToContext(context, operation)
      }
    }
    state.renderedOperationCount = maskEditOperations(mask).length
    this.setMaskState(mask.id, state)
    void appendDebugLog('mask', 'mask-runtime-rebuild-state', {
      maskId: mask.id,
      width: mask.width,
      height: mask.height,
      revision: state.revision,
      defaultAlpha: mask.defaultAlpha,
      operationCount: state.renderedOperationCount,
      hasCanvas: Boolean(state.canvas),
      reusedCanvas: Boolean(current && current.width === mask.width && current.height === mask.height),
    })
    return state
  }

  private ensureLayerOutput(layerId: string, width: number, height: number) {
    const existing = this.layerOutputs.get(layerId)
    if (existing && existing.width === width && existing.height === height) {
      this.layerOutputs.delete(layerId)
      this.layerOutputs.set(layerId, existing)
      return existing
    }
    const canvas = createRuntimeCanvas(width, height) ?? document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    this.layerOutputs.delete(layerId)
    this.layerOutputs.set(layerId, canvas)
    this.trimLayerOutputs()
    return canvas
  }

  private setMaskState(maskId: string, state: MaskRuntimeState) {
    this.masks.delete(maskId)
    this.masks.set(maskId, state)
    while (this.masks.size > this.maxMaskStates) {
      const oldest = this.masks.keys().next().value
      if (!oldest) break
      this.masks.delete(oldest)
    }
  }

  private trimLayerOutputs() {
    while (this.layerOutputs.size > this.maxLayerOutputs) {
      const oldest = this.layerOutputs.keys().next().value
      if (!oldest) break
      this.layerOutputs.delete(oldest)
    }
  }
}

function defaultMaskSourceKey(mask: LayerMask) {
  return `default:${mask.defaultAlpha}`
}

function maskStrokeContentKey(stroke: PaintStroke) {
  const points = stroke.points ?? []
  return [
    stroke.id,
    points.length,
    points[0] ?? '',
    points[1] ?? '',
    points.at(-2) ?? '',
    points.at(-1) ?? '',
    stroke.mode,
    stroke.strokeWidth,
    stroke.opacity ?? '',
    stroke.eraserOpacity ?? '',
  ].join(':')
}

function maskOperationContentKey(operation: MaskEditOperation) {
  if (operation.kind === 'shape') return `shape:${maskShapeContentKey(operation.shape)}`
  return `stroke:${maskStrokeContentKey(operation.stroke)}`
}

function maskOperationSummary(operation: MaskEditOperation) {
  if (operation.kind === 'shape') {
    return {
      id: operation.id,
      kind: operation.kind,
      shape: operation.shape.shape,
      value: operation.shape.value,
      bounds: {
        x: operation.shape.x,
        y: operation.shape.y,
        width: operation.shape.width,
        height: operation.shape.height,
      },
      pointCount: operation.shape.polygonPoints?.length ?? 0,
    }
  }
  return {
    id: operation.id,
    kind: operation.kind,
    mode: operation.stroke.mode,
    targetValue: maskStrokeTargetValue(operation.stroke),
    strokeWidth: operation.stroke.strokeWidth,
    pointCount: Math.floor((operation.stroke.points?.length ?? 0) / 2),
  }
}

function canAppendMaskRuntimeOperations(current: MaskRuntimeState, mask: LayerMask) {
  const operations = maskEditOperations(mask)
  if (current.renderedOperationCount > operations.length) return false
  const prefixKey = maskRuntimeContentKey({
    ...mask,
    version: current.revision,
    operations: operations.slice(0, current.renderedOperationCount),
  })
  return current.contentKey === prefixKey
}

export const editorMaskGpuRuntime = new MaskGpuRuntime()

function sourceLayerSignature(layer: HandoutLayer) {
  const {
    x: _x,
    y: _y,
    rotation: _rotation,
    flipX: _flipX,
    opacity: _opacity,
    visible: _visible,
    blendMode: _blendMode,
    zIndex: _zIndex,
    locked: _locked,
    mask: _mask,
    ...source
  } = layer as unknown as Record<string, unknown>
  return JSON.stringify(source)
}

function normalizeMatrixForSignature(matrix: AffineMatrix) {
  const rounded = matrix.map((value) => {
    const next = Math.round(value * 1_000_000) / 1_000_000
    return Object.is(next, -0) ? 0 : next
  }) as AffineMatrix
  return matrixNearlyEqual(rounded, [1, 0, 0, 1, 0, 0]) ? [1, 0, 0, 1, 0, 0] : rounded
}

function createRuntimeCanvas(width: number, height: number) {
  if (typeof document === 'undefined') return undefined
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function resetMaskCanvas(canvas: HTMLCanvasElement, defaultAlpha: number) {
  const context = canvas.getContext('2d')
  if (!context) return
  const gray = Math.max(0, Math.min(255, Math.round(defaultAlpha)))
  context.globalCompositeOperation = 'source-over'
  context.fillStyle = `rgb(${gray},${gray},${gray})`
  context.fillRect(0, 0, canvas.width, canvas.height)
}
