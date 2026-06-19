export type ExportFormat = 'png' | 'jpeg' | 'webp'

export function exportMimeType(format: ExportFormat) {
  if (format === 'jpeg') return 'image/jpeg'
  if (format === 'webp') return 'image/webp'
  return 'image/png'
}

export function exportExtension(format: ExportFormat) {
  if (format === 'jpeg') return 'jpg'
  return format
}

export function exportQualityValue(format: ExportFormat, quality: number) {
  return format === 'png'
    ? undefined
    : Math.min(1, Math.max(0.01, quality / 100))
}
