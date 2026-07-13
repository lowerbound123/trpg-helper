<script setup lang="ts">
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

defineProps<{
  label: string
  description?: string
  forId?: string
}>()
</script>

<template>
  <label v-if="!description" :for="forId" class="text-xs font-medium text-muted-foreground">
    {{ label }}
  </label>
  <TooltipProvider v-else :delay-duration="300">
    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          data-parameter-label="true"
          :aria-label="`Explain ${label}`"
          class="cursor-help border-b border-dashed border-muted-foreground/60 text-left text-xs font-medium text-muted-foreground outline-none focus-visible:border-foreground focus-visible:text-foreground"
        >
          {{ label }}
        </button>
      </TooltipTrigger>
      <TooltipContent class="max-w-72 text-xs leading-relaxed" side="top">
        {{ description }}
      </TooltipContent>
    </Tooltip>
    <span class="sr-only">{{ description }}</span>
  </TooltipProvider>
</template>
