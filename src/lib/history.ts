import { computed, ref, type ComputedRef } from 'vue'

export type HistoryMutator<T> = (current: T) => T

export interface CommandHistory<T> {
  readonly canRedo: ComputedRef<boolean>
  readonly canUndo: ComputedRef<boolean>
  readonly current: T
  commit: (mutator: HistoryMutator<T>) => void
  replace: (next: T) => void
  redo: () => void
  undo: () => void
}

export function createHistory<T>(initial: T): CommandHistory<T> {
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
    commit(mutator) {
      const next = mutator(present.value)
      if (Object.is(next, present.value)) return

      past.value = [...past.value, present.value]
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
      future.value = [present.value, ...future.value]
      present.value = previous
    },
    redo() {
      const next = future.value[0]
      if (!next) return

      past.value = [...past.value, present.value]
      future.value = future.value.slice(1)
      present.value = next
    },
  }
}
