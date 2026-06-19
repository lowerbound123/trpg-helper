import { appendDebugLog } from './backend'

export function serializableLogData(data?: Record<string, unknown>) {
  if (!data) return undefined
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value,
    ]),
  )
}

export function writeDebugLog(scope: string, message: string, data?: Record<string, unknown>) {
  const payload = serializableLogData(data)
  console.debug(`[${scope}] ${message}`, payload)
  void appendDebugLog(scope, message, payload)
}

export function createDebugLogger(scope: string) {
  return (message: string, data?: Record<string, unknown>) => writeDebugLog(scope, message, data)
}
