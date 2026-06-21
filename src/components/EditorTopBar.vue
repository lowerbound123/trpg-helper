<script setup lang="ts">
import { Brush, Eraser, MousePointer2, Redo2, Save, Undo2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

type EditorTool = 'select' | 'brush' | 'eraser'

defineProps<{
  activeTool: EditorTool
  canUndo: boolean
  canRedo: boolean
}>()

defineEmits<{
  save: []
  'set-tool': [tool: EditorTool]
  undo: []
  redo: []
}>()
</script>

<template>
  <header class="topbar">
    <div class="topbar-actions">
      <Button @click="$emit('save')">
        <Save data-icon="inline-start" />
        Save
      </Button>
    </div>
    <Separator orientation="vertical" />
    <div class="topbar-actions tool-actions">
      <Button size="sm" variant="outline" :data-active="activeTool === 'select'" @click="$emit('set-tool', 'select')">
        <MousePointer2 data-icon="inline-start" />
        Select
      </Button>
      <Button size="sm" variant="outline" :data-active="activeTool === 'brush'" @click="$emit('set-tool', 'brush')">
        <Brush data-icon="inline-start" />
        Brush
      </Button>
      <Button size="sm" variant="outline" :data-active="activeTool === 'eraser'" @click="$emit('set-tool', 'eraser')">
        <Eraser data-icon="inline-start" />
        Eraser
      </Button>
    </div>
    <Separator orientation="vertical" />
    <div class="topbar-actions">
      <Button variant="outline" :disabled="!canUndo" @click="$emit('undo')">
        <Undo2 data-icon="inline-start" />
        Undo
      </Button>
      <Button variant="outline" :disabled="!canRedo" @click="$emit('redo')">
        <Redo2 data-icon="inline-start" />
        Redo
      </Button>
    </div>
  </header>
</template>
