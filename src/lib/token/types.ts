export const TOKEN_DESIGN_SIZE = 512
export const TOKEN_SCALE_MIN = 10
export const TOKEN_SCALE_MAX = 500
export const TOKEN_SCALE_WHEEL_STEP = 5

export interface TokenVisualStyle {
  scale: number
  offsetX: number
  offsetY: number
  background: string
  ringInnerRadius: number
  ringOuterRadius: number
  ringColor: string
  ringStyle: string
  ringStretchX: number
  ringStretchY: number
  splitRing: boolean
  splitAngle: number
  splitHeight: number
}

export interface TokenExportSettings {
  exportFormat: 'png' | 'jpg' | 'webp' | 'jxl'
  exportSize: number
  pngOptimizationLevel: number
  pngOptimizeAlpha: boolean
  pngPreserveMetadata: boolean
  pngZopfli: boolean
  jpegQuality: number
  jpegProgressive: boolean
  jpegDeringing: boolean
  jpegChromaSubsampling: '444' | '422' | '420'
  webpQuality: number
  webpLossless: boolean
  webpEncodingStrength: string
  jxlLossless: boolean
  jxlDistance: number
  jxlEffort: number
  jxlProgressive: boolean
  jxlDecodingSpeed: number
  randomBackground: boolean
  randomRingColor: boolean
}

export interface TokenParams extends TokenVisualStyle, TokenExportSettings {
  size: number
  ringImageScaleX: number
  ringImageScaleY: number
  ringImageOffsetX: number
  ringImageOffsetY: number
  ringAssetPath?: string
}

export interface TokenRingConfig {
  revision: number
  designSize: number
  innerRadius: number
  outerRadius: number
  assetScale: number
  offsetX: number
  offsetY: number
}

export interface CustomRingConfig {
  designSize: number
  innerRadius: number
  outerRadius: number
  imageScaleX: number
  imageScaleY: number
  imageOffsetX: number
  imageOffsetY: number
}

export interface RingDescriptor {
  id: string
  label: string
  kind: 'builtin' | 'custom'
  revision: number
  customConfig?: CustomRingConfig
  assetPath?: string
}

export interface TokenProjectItem {
  id: string
  assetId?: string
  name: string
  mediaType: string
  sourcePath: string
  fallbackSource?: string
  style: TokenVisualStyle
}

export interface TokenProjectDocument {
  schemaVersion: 1
  id: string
  title: string
  items: TokenProjectItem[]
  exportSettings: TokenExportSettings
  createdAt: string
  updatedAt: string
}

export interface TokenProjectPayload {
  document: TokenProjectDocument
  metadata: Record<string, unknown>
  resolvedSources: Record<string, string>
}

export interface TokenProjectSummary {
  id: string
  title: string
  projectDir: string
  folder: string
  previewPath?: string | null
  previewSizeBytes?: number | null
  itemCount: number
  updatedAt: string
}

export interface TokenBatchGenerateItem {
  input: string
  params: TokenParams
}

export interface TokenGenerateResult {
  success: boolean
  outputPath: string
  error: string | null
}

export type TokenExportProgressPhase = 'preparing' | 'decoding' | 'rendering' | 'compositing' | 'encoding'

export type TokenExportProgressEvent =
  | { event: 'started'; data: { total: number } }
  | { event: 'itemProgress'; data: { index: number; total: number; input: string; phase: TokenExportProgressPhase; itemProgress: number } }
  | { event: 'itemFinished'; data: { index: number; completed: number; total: number; success: boolean } }
  | { event: 'finished'; data: { completed: number; total: number; successCount: number; failureCount: number } }

export const TOKEN_VISUAL_STYLE_KEYS = [
  'scale', 'offsetX', 'offsetY', 'background', 'ringInnerRadius', 'ringOuterRadius',
  'ringColor', 'ringStyle', 'ringStretchX', 'ringStretchY', 'splitRing', 'splitAngle',
  'splitHeight',
] as const satisfies readonly (keyof TokenVisualStyle)[]

export const TOKEN_EXPORT_SETTING_KEYS = [
  'exportFormat', 'exportSize', 'pngOptimizationLevel', 'pngOptimizeAlpha',
  'pngPreserveMetadata', 'pngZopfli', 'jpegQuality', 'jpegProgressive',
  'jpegDeringing', 'jpegChromaSubsampling', 'webpQuality', 'webpLossless',
  'webpEncodingStrength', 'jxlLossless', 'jxlDistance', 'jxlEffort',
  'jxlProgressive', 'jxlDecodingSpeed', 'randomBackground', 'randomRingColor',
] as const satisfies readonly (keyof TokenExportSettings)[]
