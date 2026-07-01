<script setup lang="ts">
import { Brush, Eraser, MousePointer2, Redo2, Save, Spline, Undo2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Separator } from '@/components/ui/separator'
import type { EditorTool } from '@/lib/editor-tools'

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
    <ButtonGroup class="topbar-actions tool-actions" aria-label="Editor tools">
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
      <Button size="sm" variant="outline" :data-active="activeTool === 'polygon'" @click="$emit('set-tool', 'polygon')">
        <Spline data-icon="inline-start" />
        Polygon
      </Button>
    </ButtonGroup>
    <Separator orientation="vertical" />
    <ButtonGroup class="topbar-actions" aria-label="History actions">
      <Button variant="outline" :disabled="!canUndo" @click="$emit('undo')">
        <Undo2 data-icon="inline-start" />
        Undo
      </Button>
      <Button variant="outline" :disabled="!canRedo" @click="$emit('redo')">
        <Redo2 data-icon="inline-start" />
        Redo
      </Button>
    </ButtonGroup>
  </header>
</template>
