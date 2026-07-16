<script setup lang="ts">
import { Redo2, Save, Undo2 } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'

defineProps<{ canUndo: boolean; canRedo: boolean }>()
defineEmits<{ save: []; undo: []; redo: [] }>()
</script>

<template>
  <header class="panel-topbar panel-topbar-actions">
    <ButtonGroup :aria-label="$t('HISTORY_ACTIONS_ARIA')">
      <Button variant="outline" size="icon" :title="$t('UNDO')" :disabled="!canUndo" @click="$emit('undo')"><Undo2 /></Button>
      <Button variant="outline" size="icon" :title="$t('REDO')" :disabled="!canRedo" @click="$emit('redo')"><Redo2 /></Button>
    </ButtonGroup>
    <Button size="sm" @click="$emit('save')"><Save data-icon="inline-start" />{{ $t('SAVE') }}</Button>
  </header>
</template>
