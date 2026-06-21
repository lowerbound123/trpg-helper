export type DirtyReason =
  | 'source-changed'
  | 'transform-changed'
  | 'effect-changed'
  | 'mask-changed'
  | 'paint-changed'
  | 'visibility-changed'

export type DirtyFlags = {
  layerIds: Set<string>
  maskLayerIds: Set<string>
  paintLayerIds: Set<string>
  projectPreview: boolean
}

export function createDirtyFlags(): DirtyFlags {
  return {
    layerIds: new Set(),
    maskLayerIds: new Set(),
    paintLayerIds: new Set(),
    projectPreview: false,
  }
}

export function markLayerDirty(flags: DirtyFlags, layerId: string, reason: DirtyReason) {
  flags.layerIds.add(layerId)
  flags.projectPreview = true
  if (reason === 'mask-changed') flags.maskLayerIds.add(layerId)
  if (reason === 'paint-changed') flags.paintLayerIds.add(layerId)
}

export function markProjectPreviewDirty(flags: DirtyFlags) {
  flags.projectPreview = true
}
