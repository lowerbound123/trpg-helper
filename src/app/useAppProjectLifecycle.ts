export type ProjectLifecycleHooks = {
  save: () => Promise<boolean> | boolean
}

export function createProjectLifecycle(hooks: ProjectLifecycleHooks) {
  return {
    saveProject: hooks.save,
  }
}
