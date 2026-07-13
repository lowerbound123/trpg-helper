<script setup lang="ts">
import { inject } from 'vue'
import { VueFinder } from 'vuefinder'
import 'vuefinder/dist/vuefinder.css'

import { tokenEditorContextKey } from './token-editor-context'

const ctx = inject(tokenEditorContextKey)
if (!ctx) throw new Error('Token editor context is unavailable')
</script>

<template>
  <div class="token-asset-finder h-full min-h-0 overflow-hidden">
    <VueFinder
      :key="`token-assets-${ctx.finderRevision.asset}`"
      id="token-asset-finder"
      class="token-asset-finder h-full min-h-0"
      :driver="ctx.assetDriver"
      :features="ctx.assetFeatures"
      :config="ctx.uploadConfig"
      :context-menu-items="ctx.assetContextMenuItems"
      selection-mode="multiple"
      selection-filter-type="both"
      @path-change="ctx.onPathChange"
      @dragover.capture="ctx.onDragover($event as DragEvent)"
      @drop.capture="ctx.onDrop($event as DragEvent)"
    >
      <template #status-bar="{ count }">
        <div class="finder-status-bar"><span>{{ count }} items · 右键文件或目录加入项目</span></div>
      </template>
    </VueFinder>
  </div>
</template>
