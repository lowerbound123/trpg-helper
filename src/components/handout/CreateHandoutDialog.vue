<script setup lang="ts">
import { Image, Plus, Upload } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const open = defineModel<boolean>('open', { required: true })
const title = defineModel<string>('title', { required: true })
const mode = defineModel<'blank' | 'upload-background'>('mode', { required: true })
const width = defineModel<number>('width', { required: true })
const height = defineModel<number>('height', { required: true })

defineEmits<{
  blank: []
  backgroundDrop: [event: DragEvent]
  backgroundInput: [event: Event]
}>()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="create-dialog">
      <DialogHeader>
        <DialogTitle>Create handout</DialogTitle>
        <DialogDescription>Start from an uploaded background file or a blank transparent canvas.</DialogDescription>
      </DialogHeader>
      <Input v-model="title" placeholder="New handout title" />
      <div class="create-options">
        <button
          class="create-option"
          :class="{ selected: mode === 'upload-background' }"
          type="button"
          @click="mode = 'upload-background'"
        >
          <Upload />
          <strong>Upload file</strong>
          <span>Use the uploaded image size as the canvas size.</span>
        </button>
        <button
          class="create-option"
          :class="{ selected: mode === 'blank' }"
          type="button"
          @click="mode = 'blank'"
        >
          <Plus />
          <strong>Blank canvas</strong>
          <span>Set the canvas size manually.</span>
        </button>
      </div>

      <section
        v-if="mode === 'upload-background'"
        class="drop-panel compact-drop"
        @dragover.prevent
        @drop="$emit('backgroundDrop', $event)"
      >
        <Image />
        <strong>Drop a background image here</strong>
        <span>The image will be imported and used as the handout background.</span>
        <Button as="label" variant="outline">
          <Upload data-icon="inline-start" />
          Upload background
          <input class="sr-only" type="file" accept="image/*" @change="$emit('backgroundInput', $event)" />
        </Button>
      </section>

      <div v-if="mode === 'blank'" class="create-controls">
        <Input v-model="width" type="number" placeholder="Width" />
        <Input v-model="height" type="number" placeholder="Height" />
        <Button @click="$emit('blank')">Create blank handout</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
