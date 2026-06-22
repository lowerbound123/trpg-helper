import type { HandoutDocument } from '../document'
import { touch } from '../document'

import { groupForLayer, layersByIds, normalizeZIndex } from './shared'
import type { LayerGroup } from './types'

export function moveLayer(
  document: HandoutDocument,
  layerId: string,
  targetIndex: number,
): HandoutDocument {
  const group = groupForLayer(document, layerId)
  if (group) return moveLayerGroup(document, group.id, targetIndex)

  const layers = [...document.layers]
  const currentIndex = layers.findIndex((layer) => layer.id === layerId)
  if (currentIndex < 0) return document

  const [layer] = layers.splice(currentIndex, 1)
  const boundedIndex = Math.max(0, Math.min(targetIndex, layers.length))
  layers.splice(boundedIndex, 0, layer)

  return touch({
    ...document,
    layers: normalizeZIndex(layers),
  })
}

export function moveLayerGroup(
  document: HandoutDocument,
  groupId: string,
  targetIndex: number,
): HandoutDocument {
  const group = document.groups.find((item) => item.id === groupId)
  if (!group) return document
  const groupIds = new Set(group.layerIds)
  const groupLayers = layersByIds(document, group.layerIds)
  if (!groupLayers.length) return document
  const remaining = document.layers.filter((layer) => !groupIds.has(layer.id))
  const boundedIndex = Math.max(0, Math.min(targetIndex, remaining.length))
  remaining.splice(boundedIndex, 0, ...groupLayers)
  return touch({
    ...document,
    layers: normalizeZIndex(remaining),
  })
}

// ── Internal helpers ──────────────────────────────────────────────

function swapArrayElements<T>(arr: T[], i: number, j: number): T[] {
  if (i < 0 || j < 0 || i >= arr.length || j >= arr.length) return arr
  const result = [...arr]
  const tmp = result[i]
  result[i] = result[j]
  result[j] = tmp
  return result
}

function swapLayersAndSyncGroup(
  document: HandoutDocument,
  layerIdA: string,
  layerIdB: string,
  groupId: string,
): HandoutDocument {
  const layers = swapArrayElements(
    document.layers,
    document.layers.findIndex((l) => l.id === layerIdA),
    document.layers.findIndex((l) => l.id === layerIdB),
  )
  const normalized = normalizeZIndex(layers)
  const group = document.groups.find((g) => g.id === groupId)
  if (!group) return touch({ ...document, layers: normalized })
  const newOrder = normalized
    .filter((l) => group.layerIds.includes(l.id))
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((l) => l.id)
  return touch({
    ...document,
    layers: normalized,
    groups: document.groups.map((g) => (g.id === groupId ? { ...g, layerIds: newOrder } : g)),
  })
}

/**
 * Computes the contiguous span of a group's layers in `document.layers`.
 * Returns `{ startIndex, endIndex }` or `null` if the group is empty
 * or its layers are not contiguous (should not happen in normal operation).
 */
function computeGroupContiguousSpan(
  document: HandoutDocument,
  group: LayerGroup,
): { startIndex: number; endIndex: number } | null {
  const gLayers = layersByIds(document, group.layerIds).sort((a, b) => a.zIndex - b.zIndex)
  if (gLayers.length === 0) return null
  const sortedIds = gLayers.map((l) => l.id)
  const startIndex = document.layers.findIndex((l) => l.id === sortedIds[0])
  const endIndex = document.layers.findIndex((l) => l.id === sortedIds[sortedIds.length - 1])
  // Verify contiguity: every layer between startIndex and endIndex must belong to this group
  for (let i = startIndex; i <= endIndex; i++) {
    if (!group.layerIds.includes(document.layers[i].id)) return null
  }
  return { startIndex, endIndex }
}

/**
 * Moves an entire group block one position in the given direction.
 * If the neighbor is also a group, swaps the two group blocks.
 */
function moveGroupBlock(
  document: HandoutDocument,
  group: LayerGroup,
  delta: number,
): HandoutDocument {
  const span = computeGroupContiguousSpan(document, group)
  if (!span) return document

  const dir = delta > 0 ? 1 : -1
  const neighborIdx = dir > 0 ? span.endIndex + 1 : span.startIndex - 1

  if (neighborIdx < 0 || neighborIdx >= document.layers.length) return document

  const neighborId = document.layers[neighborIdx].id
  const neighborGroup = groupForLayer(document, neighborId)

  if (neighborGroup) {
    return swapGroupBlocks(document, group, neighborGroup)
  }

  // Group block swaps with a single independent neighbor
  const layers = [...document.layers]
  if (dir > 0) {
    // Move up: extract layer above the block, insert before the block
    const [neighbor] = layers.splice(span.endIndex + 1, 1)
    layers.splice(span.startIndex, 0, neighbor)
  } else {
    // Move down: extract layer below the block, insert after the block
    const [neighbor] = layers.splice(span.startIndex - 1, 1)
    layers.splice(span.endIndex, 0, neighbor)
  }

  return touch({ ...document, layers: normalizeZIndex(layers) })
}

/**
 * Swaps two adjacent group blocks in the layers array.
 * Group memberships are NOT changed — only array positions.
 */
function swapGroupBlocks(
  document: HandoutDocument,
  groupA: LayerGroup,
  groupB: LayerGroup,
): HandoutDocument {
  const spanA = computeGroupContiguousSpan(document, groupA)
  const spanB = computeGroupContiguousSpan(document, groupB)
  if (!spanA || !spanB) return document

  // Determine which block is leftmost
  const leftSpan = spanA.startIndex < spanB.startIndex ? spanA : spanB
  const rightSpan = spanA.startIndex < spanB.startIndex ? spanB : spanA

  const sizeLeft = leftSpan.endIndex - leftSpan.startIndex + 1
  const sizeRight = rightSpan.endIndex - rightSpan.startIndex + 1

  const layers = [...document.layers]

  // Remove right block first (to preserve left index), then left block
  const rightBlock = layers.splice(rightSpan.startIndex, sizeRight)
  const leftBlock = layers.splice(leftSpan.startIndex, sizeLeft)

  // Insert right block where left was, then left block after it
  layers.splice(leftSpan.startIndex, 0, ...rightBlock)
  layers.splice(leftSpan.startIndex + sizeRight, 0, ...leftBlock)

  return touch({ ...document, layers: normalizeZIndex(layers) })
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Moves a layer by `delta` steps in z-order, with group-aware behavior:
 *
 * 1. Independent ↔ Independent: simple swap.
 * 2. Independent adjacent to a group: moves the entire group as a block
 *    in the opposite direction — group composition is never changed.
 * 3. Group interior: swaps with the adjacent sibling within the group.
 * 4. Group boundary moving outward: moves the entire group as a block.
 */
export function moveLayerInGroupAware(
  document: HandoutDocument,
  layerId: string,
  delta: number,
): HandoutDocument {
  const layers = document.layers
  const currentIndex = layers.findIndex((l) => l.id === layerId)
  if (currentIndex < 0) return document

  const dir = delta > 0 ? 1 : -1
  const targetIndex = currentIndex + dir

  // Boundary check — cannot cross background (bottom) or top of stack
  if (targetIndex < 0 || targetIndex >= layers.length) return document

  const group = groupForLayer(document, layerId)

  // ── Case: Independent layer ──────────────────────────────────────
  if (!group) {
    const neighborId = layers[targetIndex].id
    const neighborGroup = groupForLayer(document, neighborId)

    if (!neighborGroup) {
      // Requirement 1: Simple swap with adjacent independent layer
      return touch({
        ...document,
        layers: normalizeZIndex(swapArrayElements(layers, currentIndex, targetIndex)),
      })
    }

    // Requirement 2: Independent layer blocked by a group.
    // Treat the group as a whole unit — move the group block in the
    // opposite direction. Group composition is never changed.
    return moveGroupBlock(document, neighborGroup, -delta)
  }

  // ── Case: Layer is in a group ────────────────────────────────────
  const gLayers = layersByIds(document, group.layerIds).sort((a, b) => a.zIndex - b.zIndex)
  const sortedIds = gLayers.map((l) => l.id)
  const posInGroup = sortedIds.indexOf(layerId)

  // Requirement 3: Interior swap within group
  if ((delta > 0 && posInGroup < sortedIds.length - 1) || (delta < 0 && posInGroup > 0)) {
    const targetPos = posInGroup + (delta > 0 ? 1 : -1)
    return swapLayersAndSyncGroup(document, layerId, sortedIds[targetPos], group.id)
  }

  // Requirement 4: Group boundary moving outward → move entire group as a block
  return moveGroupBlock(document, group, delta)
}
