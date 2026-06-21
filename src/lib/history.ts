import { computed, ref, type ComputedRef } from 'vue'

export type HistoryMutator<T> = (current: T) => T
export type HistoryCommitOptions = { merge?: boolean }

export interface CommandHistory<T> {
  readonly canRedo: ComputedRef<boolean>
  readonly canUndo: ComputedRef<boolean>
  readonly current: T
  commit: (mutator: HistoryMutator<T>, options?: HistoryCommitOptions) => void
  replace: (next: T) => void
  redo: () => void
  undo: () => void
}

export function createHistory<T>(initial: T, maxSteps = 100): CommandHistory<T> {
  const past = ref<T[]>([])
  const present = ref(initial)
  const future = ref<T[]>([])

  return {
    get canRedo() {
      return computed(() => future.value.length > 0)
    },
    get canUndo() {
      return computed(() => past.value.length > 0)
    },
    get current() {
      return present.value
    },
    commit(mutator, options) {
      const next = mutator(present.value)
      if (Object.is(next, present.value)) return

      if (!options?.merge) past.value = [...past.value, present.value].slice(-maxSteps)
      present.value = next
      future.value = []
    },
    replace(next) {
      present.value = next
      past.value = []
      future.value = []
    },
    undo() {
      const previous = past.value.at(-1)
      if (!previous) return

      past.value = past.value.slice(0, -1)
      future.value = [present.value, ...future.value].slice(0, maxSteps)
      present.value = previous
    },
    redo() {
      const next = future.value[0]
      if (!next) return

      past.value = [...past.value, present.value].slice(-maxSteps)
      future.value = future.value.slice(1)
      present.value = next
    },
  }
}
