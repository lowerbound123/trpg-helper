import { appendDebugLog } from './backend'
import { appConfiguration } from './configuration'

const HIGH_FREQUENCY_LOG_PATTERN = /(drag|pointer|wheel|resize|mousemove|pan|zoom|snap)/i

function shouldWriteFileLog(scope: string, message: string) {
  if (!appConfiguration.debug.fileLogEnabled) return false
  if (HIGH_FREQUENCY_LOG_PATTERN.test(`${scope}:${message}`)) return false
  if (/^(render|mask|export|thumbnail|background-render|text)$/.test(scope)) {
    return appConfiguration.debug.renderPerfLogEnabled
  }
  return true
}

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
  if (!shouldWriteFileLog(scope, message)) return
  void appendDebugLog(scope, message, payload)
}

export function createDebugLogger(scope: string) {
  return (message: string, data?: Record<string, unknown>) => writeDebugLog(scope, message, data)
}
