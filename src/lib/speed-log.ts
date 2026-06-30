import { appendDebugLog } from './backend'

function now() {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

export function appendSpeedLog(event: string, data?: Record<string, unknown>) {
  void appendDebugLog('speed', event, data)
}

export async function measureSpeed<T>(
  event: string,
  data: Record<string, unknown> | undefined,
  action: () => Promise<T>,
): Promise<T> {
  const startedAt = now()
  try {
    const result = await action()
    appendSpeedLog(event, {
      ...data,
      ok: true,
      durationMs: Math.round(now() - startedAt),
    })
    return result
  } catch (error) {
    appendSpeedLog(event, {
      ...data,
      ok: false,
      durationMs: Math.round(now() - startedAt),
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    })
    throw error
  }
}
