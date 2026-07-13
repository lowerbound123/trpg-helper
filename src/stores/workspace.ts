import { defineStore } from 'pinia'
import { ref } from 'vue'

export type WorkspaceView = 'manager' | 'handout-editor' | 'token-editor'

export const useWorkspaceStore = defineStore('workspace', () => {
  const activeView = ref<WorkspaceView>('manager')

  function openManager() {
    activeView.value = 'manager'
  }

  function openHandoutEditor() {
    activeView.value = 'handout-editor'
  }

  function openTokenEditor() {
    activeView.value = 'token-editor'
  }

  return { activeView, openManager, openHandoutEditor, openTokenEditor }
})
