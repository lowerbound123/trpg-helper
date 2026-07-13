import type { HandoutEncodingOptions, HandoutExportFormat } from './handout-export'

export type ExportFormat = HandoutExportFormat

export function normalizeExportFormat(format: ExportFormat | 'jpeg'): ExportFormat {
  return format === 'jpeg' ? 'jpg' : format
}

export function exportMimeType(format: ExportFormat) {
  if (format === 'jpg') return 'image/jpeg'
  if (format === 'webp') return 'image/webp'
  if (format === 'jxl') return 'image/jxl'
  return 'image/png'
}

export function exportExtension(format: ExportFormat) {
  return format
}

export function browserQualityForEncoding(options: HandoutEncodingOptions) {
  if (options.format === 'jpg') return options.jpegQuality / 100
  if (options.format === 'webp') return options.webpQuality / 100
  return undefined
}

export function exportQualityValue(format: ExportFormat, quality: number) {
  return format === 'png'
    ? undefined
    : Math.min(1, Math.max(0.01, quality / 100))
}
