export type IdleTask = () => void

export function requestAppIdleTask(task: IdleTask, timeout = 1500) {
  const win = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number }
  if (win.requestIdleCallback) {
    win.requestIdleCallback(task, { timeout })
    return
  }
  window.setTimeout(task, 250)
}
