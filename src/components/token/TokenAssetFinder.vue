<script setup lang="ts">
import { inject } from 'vue'
import { VueFinder } from 'vuefinder'
import 'vuefinder/dist/vuefinder.css'

const ctx = inject<Record<string, any>>('token-editor-context')!
</script>

<template>
  <div class="h-full min-h-0 p-2">
    <VueFinder
      :key="`token-assets-${ctx.finderRevision.asset}`"
      id="token-asset-finder"
      class="h-full min-h-0 compact-finder"
      :driver="ctx.finderDrivers.asset"
      :features="ctx.finderFeaturesForKind('asset')"
      :config="ctx.finderUploadConfig"
      :context-menu-items="ctx.tokenAssetContextMenuItems"
      selection-mode="multiple"
      selection-filter-type="both"
      @path-change="(path) => ctx.handleFinderPathChange('asset', path)"
      @dragover.capture="ctx.handleDirectFinderDragover('asset', $event as DragEvent)"
      @drop.capture="ctx.handleDirectFinderDrop('asset', $event as DragEvent)"
    >
      <template #status-bar="{ count }">
        <div class="finder-status-bar"><span>{{ count }} items · 右键文件或目录加入项目</span></div>
      </template>
    </VueFinder>
  </div>
</template>
