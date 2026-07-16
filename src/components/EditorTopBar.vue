<script setup lang="ts">
import { Brush, Eraser, MousePointer2, Spline } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import type { EditorTool } from '@/lib/editor-tools'

defineProps<{
  activeTool: EditorTool
}>()

defineEmits<{
  'set-tool': [tool: EditorTool]
}>()
</script>

<template>
  <header class="panel-topbar panel-topbar-tools">
    <ButtonGroup class="topbar-actions tool-actions" :aria-label="$t('EDITOR_TOOLS_ARIA')">
      <Button size="sm" variant="outline" :data-active="activeTool === 'select'" @click="$emit('set-tool', 'select')">
        <MousePointer2 data-icon="inline-start" />
        {{ $t('SELECT_TOOL') }}
      </Button>
      <Button size="sm" variant="outline" :data-active="activeTool === 'brush'" @click="$emit('set-tool', 'brush')">
        <Brush data-icon="inline-start" />
        {{ $t('BRUSH') }}
      </Button>
      <Button size="sm" variant="outline" :data-active="activeTool === 'eraser'" @click="$emit('set-tool', 'eraser')">
        <Eraser data-icon="inline-start" />
        {{ $t('ERASER_TOOL') }}
      </Button>
      <Button size="sm" variant="outline" :data-active="activeTool === 'polygon'" @click="$emit('set-tool', 'polygon')">
        <Spline data-icon="inline-start" />
        {{ $t('POLYGON_TOOL') }}
      </Button>
    </ButtonGroup>
  </header>
</template>
