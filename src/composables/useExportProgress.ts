import { nextTick, ref } from 'vue'

export function useExportProgress() {
  const exportProgress = ref(0)
  let exportProgressTimer: number | undefined

  function beginExportProgress() {
    if (exportProgressTimer) window.clearInterval(exportProgressTimer)
    exportProgress.value = 1
    exportProgressTimer = window.setInterval(() => {
      const current = exportProgress.value
      if (current < 70) exportProgress.value = Math.min(70, current + Math.max(1, Math.round((70 - current) * 0.16)))
      else if (current < 95) exportProgress.value = Math.min(95, current + 1)
    }, 90)
  }

  function waitForNextPaint() {
    return new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => globalThis.setTimeout(resolve, 0))
      })
    })
  }

  async function prepareExportProgress() {
    beginExportProgress()
    await nextTick()
    await nextTick()
    await waitForNextPaint()
  }

  async function setExportProgress(value: number) {
    exportProgress.value = Math.max(exportProgress.value, value)
    await nextTick()
    await waitForNextPaint()
  }

  function finishExportProgress(success: boolean) {
    if (exportProgressTimer) window.clearInterval(exportProgressTimer)
    exportProgressTimer = undefined
    exportProgress.value = success ? 100 : 0
  }

  function cleanupExportProgress() {
    if (exportProgressTimer) window.clearInterval(exportProgressTimer)
    exportProgressTimer = undefined
  }

  return {
    exportProgress,
    prepareExportProgress,
    setExportProgress,
    finishExportProgress,
    cleanupExportProgress,
  }
}
