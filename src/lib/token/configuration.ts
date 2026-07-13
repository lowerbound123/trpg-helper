import type { TokenExportSettings, TokenVisualStyle } from './types'

export interface TokenFeatureConfiguration {
  defaults: {
    designSize: number
    scale: number
    offsetX: number
    offsetY: number
    backgroundColor: string
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
  limits: {
    scaleMin: number
    scaleMax: number
    scaleStep: number
    offsetMin: number
    offsetMax: number
    ringStretchMin: number
    ringStretchMax: number
    splitAngleMin: number
    splitAngleMax: number
    splitHeightMin: number
    splitHeightMax: number
  }
  export: {
    defaults: {
      format: TokenExportSettings['exportFormat']
      size: number
      pngOptimizationLevel: number
      pngOptimizeAlpha: boolean
      pngPreserveMetadata: boolean
      pngZopfli: boolean
      jpegQuality: number
      jpegProgressive: boolean
      jpegDeringing: boolean
      jpegChromaSubsampling: TokenExportSettings['jpegChromaSubsampling']
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
    limits: {
      sizeMin: number
      sizeMax: number
      pngOptimizationLevelMin: number
      pngOptimizationLevelMax: number
      jpegQualityMin: number
      jpegQualityMax: number
      webpQualityMin: number
      webpQualityMax: number
      jxlDistanceMin: number
      jxlDistanceMax: number
      jxlEffortMin: number
      jxlEffortMax: number
      jxlDecodingSpeedMin: number
      jxlDecodingSpeedMax: number
      maxCanvasSize: number
    }
    rendering: { resampleFilter: string; trimTransparentBounds: boolean; jpegMatteColor: string }
    naming: { collisionSeparator: string; collisionStart: number }
    randomColors: { palette: string[]; minimumContrastRatio: number; minimumOklabDistance: number }
    webpStrengthProfiles: Array<{ id: string; label: string; method: number; passes: number }>
  }
  preview: {
    displayTokenSize: number
    minimumWorldSize: number
    worldSizeStep: number
    renderer: 'webgl'
    antialias: boolean
    devicePixelRatioMax: number
    guide: { dashLength: number; gapLength: number; lineWidth: number; lineColor: string; lineAlpha: number; endpointRadius: number; endpointAlpha: number }
  }
  layout: { leftWidth: number; rightWidth: number; leftMinWidth: number; centerMinWidth: number; rightMinWidth: number; resizeHandleWidth: number }
  files: { thumbnailSize: number; importFormats: string[]; exportFormats: TokenExportSettings['exportFormat'][] }
  history: { maximumEntries: number }
  rings: { thumbnailSize: number; requestDebounceMs: number; frontendCacheEntries: number; backendCacheEntries: number; maxUploadBytes: number; maxSourceDimension: number; customScaleMin: number; customScaleMax: number }
  notifications: { toastDurationMs: number }
}

export const defaultTokenConfiguration: TokenFeatureConfiguration = {
  defaults: {
    designSize: 512, scale: 100, offsetX: 0, offsetY: 0, backgroundColor: '#000000FF',
    ringInnerRadius: 225, ringOuterRadius: 250, ringColor: '#F6C75BFF', ringStyle: 'solid',
    ringStretchX: 1, ringStretchY: 1, splitRing: false, splitAngle: 0, splitHeight: 0,
  },
  limits: {
    scaleMin: 10, scaleMax: 500, scaleStep: 5, offsetMin: -100, offsetMax: 100,
    ringStretchMin: 0.01, ringStretchMax: 4, splitAngleMin: 0, splitAngleMax: 359,
    splitHeightMin: -100, splitHeightMax: 100,
  },
  export: {
    defaults: {
      format: 'png', size: 512, pngOptimizationLevel: 3, pngOptimizeAlpha: true,
      pngPreserveMetadata: false, pngZopfli: false, jpegQuality: 85,
      jpegProgressive: true, jpegDeringing: true, jpegChromaSubsampling: '422',
      webpQuality: 90, webpLossless: false, webpEncodingStrength: 'balanced',
      jxlLossless: false, jxlDistance: 1, jxlEffort: 7, jxlProgressive: true,
      jxlDecodingSpeed: 0, randomBackground: false, randomRingColor: false,
    },
    limits: {
      sizeMin: 64, sizeMax: 2048, pngOptimizationLevelMin: 0, pngOptimizationLevelMax: 6,
      jpegQualityMin: 1, jpegQualityMax: 100, webpQualityMin: 1, webpQualityMax: 100,
      jxlDistanceMin: 0, jxlDistanceMax: 5, jxlEffortMin: 1, jxlEffortMax: 9,
      jxlDecodingSpeedMin: 0, jxlDecodingSpeedMax: 4, maxCanvasSize: 4096,
    },
    rendering: { resampleFilter: 'lanczos3', trimTransparentBounds: true, jpegMatteColor: '#FFFFFFFF' },
    naming: { collisionSeparator: '_', collisionStart: 2 },
    randomColors: {
      palette: ['#0B1020', '#102A43', '#3B0A57', '#5A0B2E', '#5B1A00', '#064E3B', '#164E63', '#3F3F46', '#F8FAFC', '#FFF3BF', '#FFD166', '#FF8FAB', '#FF6B6B', '#C4B5FD', '#7DD3FC', '#5EEAD4', '#86EFAC', '#FDE68A'],
      minimumContrastRatio: 4.5,
      minimumOklabDistance: 0.12,
    },
    webpStrengthProfiles: [
      { id: 'fast', label: 'Fast', method: 2, passes: 1 },
      { id: 'balanced', label: 'Balanced', method: 4, passes: 2 },
      { id: 'strong', label: 'Strong', method: 5, passes: 6 },
      { id: 'maximum', label: 'Maximum', method: 6, passes: 10 },
    ],
  },
  preview: {
    displayTokenSize: 400, minimumWorldSize: 512, worldSizeStep: 128, renderer: 'webgl', antialias: true,
    devicePixelRatioMax: 2,
    guide: { dashLength: 6, gapLength: 4, lineWidth: 1, lineColor: '#FFFFFF', lineAlpha: 0.5, endpointRadius: 3, endpointAlpha: 0.7 },
  },
  layout: { leftWidth: 280, rightWidth: 400, leftMinWidth: 200, centerMinWidth: 400, rightMinWidth: 300, resizeHandleWidth: 4 },
  files: { thumbnailSize: 56, importFormats: ['png', 'jpg', 'jpeg', 'webp', 'bmp'], exportFormats: ['png', 'jpg', 'webp', 'jxl'] },
  history: { maximumEntries: 50 },
  rings: { thumbnailSize: 64, requestDebounceMs: 50, frontendCacheEntries: 32, backendCacheEntries: 64, maxUploadBytes: 33554432, maxSourceDimension: 16384, customScaleMin: 10, customScaleMax: 500 },
  notifications: { toastDurationMs: 3000 },
}

type TomlRecord = Record<string, unknown>

function isRecord(value: unknown): value is TomlRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function snakeCase(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function hydrateFromToml<T>(template: T, source: unknown): T {
  if (Array.isArray(template)) {
    return (Array.isArray(source) ? structuredClone(source) : structuredClone(template)) as T
  }
  if (!isRecord(template) || !isRecord(source)) return structuredClone(template)

  const output: TomlRecord = {}
  for (const [key, fallback] of Object.entries(template)) {
    const candidate = source[snakeCase(key)]
    if (Array.isArray(fallback)) {
      output[key] = Array.isArray(candidate) ? structuredClone(candidate) : structuredClone(fallback)
    } else if (isRecord(fallback)) {
      output[key] = hydrateFromToml(fallback, candidate)
    } else {
      output[key] = typeof candidate === typeof fallback ? candidate : fallback
    }
  }
  return output as T
}

function serializeForToml(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(serializeForToml)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [snakeCase(key), serializeForToml(entry)]))
}

export function tokenConfigurationFromToml(source: unknown): TokenFeatureConfiguration {
  return hydrateFromToml(defaultTokenConfiguration, source)
}

export function tokenConfigurationToToml(config: TokenFeatureConfiguration): TomlRecord {
  return serializeForToml(config) as TomlRecord
}

export function createDefaultTokenVisualStyle(config = defaultTokenConfiguration): TokenVisualStyle {
  const value = config.defaults
  return {
    scale: value.scale, offsetX: value.offsetX, offsetY: value.offsetY,
    background: value.backgroundColor, ringInnerRadius: value.ringInnerRadius,
    ringOuterRadius: value.ringOuterRadius, ringColor: value.ringColor,
    ringStyle: value.ringStyle, ringStretchX: value.ringStretchX,
    ringStretchY: value.ringStretchY, splitRing: value.splitRing,
    splitAngle: value.splitAngle, splitHeight: value.splitHeight,
  }
}

export function createDefaultTokenExportSettings(config = defaultTokenConfiguration): TokenExportSettings {
  const value = config.export.defaults
  return {
    exportFormat: value.format, exportSize: value.size,
    pngOptimizationLevel: value.pngOptimizationLevel, pngOptimizeAlpha: value.pngOptimizeAlpha,
    pngPreserveMetadata: value.pngPreserveMetadata, pngZopfli: value.pngZopfli,
    jpegQuality: value.jpegQuality, jpegProgressive: value.jpegProgressive,
    jpegDeringing: value.jpegDeringing, jpegChromaSubsampling: value.jpegChromaSubsampling,
    webpQuality: value.webpQuality, webpLossless: value.webpLossless,
    webpEncodingStrength: value.webpEncodingStrength, jxlLossless: value.jxlLossless,
    jxlDistance: value.jxlDistance, jxlEffort: value.jxlEffort,
    jxlProgressive: value.jxlProgressive, jxlDecodingSpeed: value.jxlDecodingSpeed,
    randomBackground: value.randomBackground, randomRingColor: value.randomRingColor,
  }
}
