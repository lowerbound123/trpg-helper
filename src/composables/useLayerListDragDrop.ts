import { ref } from 'vue'
import type { Ref } from 'vue'

import type { HandoutLayer, LayerGroup } from '@/lib/handout'
import { useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>

export function useLayerListDragDrop(options: {
  editor: EditorStore
  draggedMaskLayerId: Ref<string>
  handleMaskDrop: (targetLayer: HandoutLayer, event: DragEvent) => Promise<void>
  updateTransformer: () => void
}) {
  const { editor, draggedMaskLayerId, handleMaskDrop, updateTransformer } = options

  const draggedLayerId = ref('')
  const draggedGroupId = ref('')
  const collapsedGroupIds = ref<string[]>([])
  let lastLayerListSelectionId = ''

  function startLayerListDrag(layer: HandoutLayer, event: DragEvent) {
    draggedLayerId.value = layer.id
    draggedGroupId.value = ''
    event.dataTransfer?.setData('application/x-handout-layer', layer.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  function startGroupListDrag(group: LayerGroup, event: DragEvent) {
    draggedGroupId.value = group.id
    draggedLayerId.value = ''
    event.dataTransfer?.setData('application/x-handout-group', group.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  async function handleLayerListDrop(targetLayer: HandoutLayer, event: DragEvent) {
    event.preventDefault()
    const maskLayerId = event.dataTransfer?.getData('application/x-handout-mask-layer') || draggedMaskLayerId.value
    if (maskLayerId) {
      await handleMaskDrop(targetLayer, event)
      return
    }
    const groupId = event.dataTransfer?.getData('application/x-handout-group') || draggedGroupId.value
    if (groupId) {
      editor.moveGroupToIndex(groupId, targetLayer.zIndex)
      draggedGroupId.value = ''
      return
    }
    const layerId = event.dataTransfer?.getData('application/x-handout-layer') || draggedLayerId.value
    if (!layerId || layerId === targetLayer.id) return
    const targetGroup = groupForLayer(targetLayer.id)
    const sourceGroup = groupForLayer(layerId)
    if (targetGroup) {
      editor.addLayerToGroupAt(layerId, targetGroup.id, targetLayer.id)
      draggedLayerId.value = ''
      return
    }
    if (sourceGroup) {
      editor.moveLayerOutOfGroupToIndex(layerId, targetLayer.zIndex)
      draggedLayerId.value = ''
      return
    }
    editor.moveLayerToIndex(layerId, targetLayer.zIndex)
    draggedLayerId.value = ''
  }

  function handleGroupDrop(group: LayerGroup, event: DragEvent) {
    event.preventDefault()
    const groupId = event.dataTransfer?.getData('application/x-handout-group') || draggedGroupId.value
    if (groupId) {
      if (groupId !== group.id) {
        const topLayer = layersForGroup(group).at(-1)
        editor.moveGroupToIndex(groupId, topLayer?.zIndex ?? editor.document.layers.length)
      }
      draggedGroupId.value = ''
      return
    }
    const layerId = event.dataTransfer?.getData('application/x-handout-layer') || draggedLayerId.value
    if (!layerId || group.layerIds.includes(layerId)) return
    editor.addLayerToGroupAt(layerId, group.id)
    draggedLayerId.value = ''
  }

  function groupForLayer(layerId: string) {
    return editor.groups.find((group) => group.layerIds.includes(layerId))
  }

  function layersForGroup(group: LayerGroup) {
    const byId = new Map(editor.document.layers.map((layer) => [layer.id, layer]))
    return group.layerIds
      .map((id) => byId.get(id))
      .filter((layer): layer is HandoutLayer => Boolean(layer))
  }

  function groupIsCollapsed(groupId: string) {
    return collapsedGroupIds.value.includes(groupId)
  }

  function toggleGroupCollapsed(groupId: string) {
    collapsedGroupIds.value = groupIsCollapsed(groupId)
      ? collapsedGroupIds.value.filter((id) => id !== groupId)
      : [...collapsedGroupIds.value, groupId]
  }

  function clearLayerDragState() {
    draggedLayerId.value = ''
    draggedGroupId.value = ''
    draggedMaskLayerId.value = ''
  }

  function selectLayerFromList(layerId: string, event?: MouseEvent | KeyboardEvent) {
    if (event?.shiftKey && lastLayerListSelectionId) {
      const layerIds = editor.layers.map((layer) => layer.id)
      const from = layerIds.indexOf(lastLayerListSelectionId)
      const to = layerIds.indexOf(layerId)
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from]
        editor.setLayerSelection(layerIds.slice(start, end + 1))
      } else {
        editor.setLayerSelection([layerId])
      }
    } else if (event?.metaKey) {
      editor.toggleLayerSelection(layerId)
    } else {
      editor.selectLayer(layerId)
    }
    lastLayerListSelectionId = layerId
    void updateTransformer()
  }

  function toggleLayerVisibility(layer: HandoutLayer) {
    editor.patchLayer(layer.id, { visible: !layer.visible })
    void updateTransformer()
  }

  return {
    draggedLayerId,
    draggedGroupId,
    collapsedGroupIds,
    startLayerListDrag,
    startGroupListDrag,
    handleLayerListDrop,
    handleGroupDrop,
    groupForLayer,
    layersForGroup,
    groupIsCollapsed,
    toggleGroupCollapsed,
    clearLayerDragState,
    selectLayerFromList,
    toggleLayerVisibility,
  }
}
