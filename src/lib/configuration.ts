import configurationToml from '../../configuration.toml?raw'
import { dump, load } from 'js-toml'

import {
  defaultTokenConfiguration,
  tokenConfigurationFromToml,
  tokenConfigurationToToml,
  type TokenFeatureConfiguration,
} from './token/configuration'

const CONFIGURATION_OVERRIDE_STORAGE_KEY = 'handout-generator.configuration.toml'

type TomlObject = Record<string, unknown>

export type LocalePreference = 'auto' | 'zh-CN' | 'en-US'
export type SegmentationModelId = 'birefnet-general' | 'u2net' | 'ben2' | 'macos-vision'
export type SegmentationDevice = 'auto' | 'cpu' | 'coreml' | 'directml' | 'cuda'

function localePreference(value: string): LocalePreference {
  return value === 'zh-CN' || value === 'en-US' ? value : 'auto'
}

function segmentationModel(value: string): SegmentationModelId {
  return ['birefnet-general', 'u2net', 'ben2', 'macos-vision'].includes(value)
    ? value as SegmentationModelId
    : 'birefnet-general'
}

function segmentationDevice(value: string): SegmentationDevice {
  return ['auto', 'cpu', 'coreml', 'directml', 'cuda'].includes(value)
    ? value as SegmentationDevice
    : 'auto'
}

export function parseConfigurationToml(source: string): TomlObject {
  return load(source) as TomlObject
}

export function runtimeConfigurationToml() {
  if (typeof window === 'undefined') return configurationToml
  try {
    return window.localStorage.getItem(CONFIGURATION_OVERRIDE_STORAGE_KEY) || configurationToml
  } catch {
    return configurationToml
  }
}

export function storeRuntimeConfigurationOverride(source: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CONFIGURATION_OVERRIDE_STORAGE_KEY, source)
}

const parsed = parseConfigurationToml(runtimeConfigurationToml())

function sectionValue(section: string) {
  const value = parsed[section]
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function numberValue(section: string, key: string, fallback: number) {
  const value = sectionValue(section)[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function unitValue(section: string, key: string, fallback: number) {
  return clamp(numberValue(section, key, fallback), 0, 1)
}

function stringValue(section: string, key: string, fallback: string) {
  const value = sectionValue(section)[key]
  return typeof value === 'string' ? value : fallback
}

type HandoutExportFormat = 'png' | 'jpg' | 'webp' | 'jxl'

export type HandoutExportConfiguration = {
  defaultScale: number
  minScale: number
  rawRgbaIpcMaxBytes: number
  defaults: {
    format: HandoutExportFormat
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
  }
  limits: {
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
    maxCanvasDimension: number
    maxCanvasPixels: number
  }
  rendering: { jpegMatteColor: string }
  webpStrengthProfiles: Array<{ id: string; label: string; method: number; passes: number }>
}

const defaultHandoutExportConfiguration: HandoutExportConfiguration = {
  defaultScale: 1,
  minScale: 0.1,
  rawRgbaIpcMaxBytes: 134217728,
  defaults: {
    format: 'png', pngOptimizationLevel: 3, pngOptimizeAlpha: true,
    pngPreserveMetadata: false, pngZopfli: false, jpegQuality: 85,
    jpegProgressive: true, jpegDeringing: true, jpegChromaSubsampling: '422',
    webpQuality: 90, webpLossless: false, webpEncodingStrength: 'balanced',
    jxlLossless: false, jxlDistance: 1, jxlEffort: 7, jxlProgressive: true,
    jxlDecodingSpeed: 0,
  },
  limits: {
    pngOptimizationLevelMin: 0, pngOptimizationLevelMax: 6,
    jpegQualityMin: 1, jpegQualityMax: 100, webpQualityMin: 1, webpQualityMax: 100,
    jxlDistanceMin: 0, jxlDistanceMax: 5, jxlEffortMin: 1, jxlEffortMax: 9,
    jxlDecodingSpeedMin: 0, jxlDecodingSpeedMax: 4,
    maxCanvasDimension: 16384, maxCanvasPixels: 67108864,
  },
  rendering: { jpegMatteColor: '#FFFFFFFF' },
  webpStrengthProfiles: [
    { id: 'fast', label: '快速', method: 2, passes: 1 },
    { id: 'balanced', label: '均衡', method: 4, passes: 2 },
    { id: 'strong', label: '高压缩', method: 5, passes: 6 },
    { id: 'maximum', label: '极限', method: 6, passes: 10 },
  ],
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function handoutExportConfigurationFromValue(source: unknown, fallback = defaultHandoutExportConfiguration): HandoutExportConfiguration {
  const root = recordValue(source)
  const defaults = recordValue(root.defaults)
  const limits = recordValue(root.limits)
  const rendering = recordValue(root.rendering)
  const number = (object: Record<string, unknown>, key: string, value: number) => typeof object[key] === 'number' && Number.isFinite(object[key]) ? object[key] as number : value
  const boolean = (object: Record<string, unknown>, key: string, value: boolean) => typeof object[key] === 'boolean' ? object[key] as boolean : value
  const string = (object: Record<string, unknown>, key: string, value: string) => typeof object[key] === 'string' ? object[key] as string : value
  return {
    defaultScale: number(root, 'default_scale', fallback.defaultScale),
    minScale: number(root, 'min_scale', fallback.minScale),
    rawRgbaIpcMaxBytes: number(root, 'raw_rgba_ipc_max_bytes', fallback.rawRgbaIpcMaxBytes),
    defaults: {
      format: string(defaults, 'format', fallback.defaults.format) as HandoutExportFormat,
      pngOptimizationLevel: number(defaults, 'png_optimization_level', fallback.defaults.pngOptimizationLevel),
      pngOptimizeAlpha: boolean(defaults, 'png_optimize_alpha', fallback.defaults.pngOptimizeAlpha),
      pngPreserveMetadata: boolean(defaults, 'png_preserve_metadata', fallback.defaults.pngPreserveMetadata),
      pngZopfli: boolean(defaults, 'png_zopfli', fallback.defaults.pngZopfli),
      jpegQuality: number(defaults, 'jpeg_quality', fallback.defaults.jpegQuality),
      jpegProgressive: boolean(defaults, 'jpeg_progressive', fallback.defaults.jpegProgressive),
      jpegDeringing: boolean(defaults, 'jpeg_deringing', fallback.defaults.jpegDeringing),
      jpegChromaSubsampling: string(defaults, 'jpeg_chroma_subsampling', fallback.defaults.jpegChromaSubsampling) as '444' | '422' | '420',
      webpQuality: number(defaults, 'webp_quality', fallback.defaults.webpQuality),
      webpLossless: boolean(defaults, 'webp_lossless', fallback.defaults.webpLossless),
      webpEncodingStrength: string(defaults, 'webp_encoding_strength', fallback.defaults.webpEncodingStrength),
      jxlLossless: boolean(defaults, 'jxl_lossless', fallback.defaults.jxlLossless),
      jxlDistance: number(defaults, 'jxl_distance', fallback.defaults.jxlDistance),
      jxlEffort: number(defaults, 'jxl_effort', fallback.defaults.jxlEffort),
      jxlProgressive: boolean(defaults, 'jxl_progressive', fallback.defaults.jxlProgressive),
      jxlDecodingSpeed: number(defaults, 'jxl_decoding_speed', fallback.defaults.jxlDecodingSpeed),
    },
    limits: {
      pngOptimizationLevelMin: number(limits, 'png_optimization_level_min', fallback.limits.pngOptimizationLevelMin),
      pngOptimizationLevelMax: number(limits, 'png_optimization_level_max', fallback.limits.pngOptimizationLevelMax),
      jpegQualityMin: number(limits, 'jpeg_quality_min', fallback.limits.jpegQualityMin),
      jpegQualityMax: number(limits, 'jpeg_quality_max', fallback.limits.jpegQualityMax),
      webpQualityMin: number(limits, 'webp_quality_min', fallback.limits.webpQualityMin),
      webpQualityMax: number(limits, 'webp_quality_max', fallback.limits.webpQualityMax),
      jxlDistanceMin: number(limits, 'jxl_distance_min', fallback.limits.jxlDistanceMin),
      jxlDistanceMax: number(limits, 'jxl_distance_max', fallback.limits.jxlDistanceMax),
      jxlEffortMin: number(limits, 'jxl_effort_min', fallback.limits.jxlEffortMin),
      jxlEffortMax: number(limits, 'jxl_effort_max', fallback.limits.jxlEffortMax),
      jxlDecodingSpeedMin: number(limits, 'jxl_decoding_speed_min', fallback.limits.jxlDecodingSpeedMin),
      jxlDecodingSpeedMax: number(limits, 'jxl_decoding_speed_max', fallback.limits.jxlDecodingSpeedMax),
      maxCanvasDimension: number(limits, 'max_canvas_dimension', fallback.limits.maxCanvasDimension),
      maxCanvasPixels: number(limits, 'max_canvas_pixels', fallback.limits.maxCanvasPixels),
    },
    rendering: { jpegMatteColor: string(rendering, 'jpeg_matte_color', fallback.rendering.jpegMatteColor) },
    webpStrengthProfiles: Array.isArray(root.webp_strength_profiles)
      ? structuredClone(root.webp_strength_profiles) as HandoutExportConfiguration['webpStrengthProfiles']
      : structuredClone(fallback.webpStrengthProfiles),
  }
}

export type AppConfiguration = {
  schemaVersion: number
  application: { title: string; locale: LocalePreference }
  window: { width: number; height: number; minWidth: number; minHeight: number; resizable: boolean }
  diagnostics: { logDirectory: string }
  paths: {
    dataDir: string
    logFile: string
  }
  uploads: {
    maxFileSize: string
  }
  previews: {
    thumbnailMaxEdgePx: number
    thumbnailQuality: number
    targetMaxBytes: number
  }
  finder: {
    managerHeightPx: number
    compactHeightPx: number
    handoutGridScale: number
    backgroundGridScale: number
  }
  editor: {
    snapThresholdScreenPx: number
    maxSnapCandidates: number
    continuousEditCommitDelayMs: number
  }
  mask: {
    enabled: boolean
    usePixiPreview: boolean
    strokePreviewMinOpacity: number
    interactiveRefreshDelayMs: number
    pointerIdleGraceMs: number
  }
  foregroundSegmentation: {
    enabled: boolean
    model: SegmentationModelId
    device: SegmentationDevice
    workerThreads: number
    intraThreads: number
    interThreads: number
    downloadMissingModels: boolean
    downloadTimeoutSeconds: number
    modelCacheDirectory: string
    outputSuffix: string
    maxSourceDimension: number
    maxSourcePixels: number
  }
  export: HandoutExportConfiguration
  debug: {
    fileLogEnabled: boolean
    renderPerfLogEnabled: boolean
  }
  token: TokenFeatureConfiguration
}

export const appConfiguration = {
  schemaVersion: typeof parsed.schema_version === 'number' ? parsed.schema_version : 1,
  application: {
    title: stringValue('application', 'title', 'Handout Generator'),
    locale: localePreference(stringValue('application', 'locale', 'auto')),
  },
  window: {
    width: numberValue('window', 'width', 1440),
    height: numberValue('window', 'height', 920),
    minWidth: numberValue('window', 'min_width', 1180),
    minHeight: numberValue('window', 'min_height', 760),
    resizable: sectionValue('window').resizable !== false,
  },
  diagnostics: { logDirectory: stringValue('diagnostics', 'log_directory', './logs') },
  paths: {
    dataDir: stringValue('paths', 'data_dir', './data'),
    logFile: stringValue('paths', 'log_file', './logs/app.log'),
  },
  uploads: {
    maxFileSize: stringValue('uploads', 'max_file_size', '100mb'),
  },
  previews: {
    thumbnailMaxEdgePx: numberValue('previews', 'thumbnail_max_edge_px', 256),
    thumbnailQuality: numberValue('previews', 'thumbnail_quality', 80),
    targetMaxBytes: numberValue('previews', 'target_max_bytes', 524288),
  },
  finder: {
    managerHeightPx: numberValue('finder', 'manager_height_px', 1080),
    compactHeightPx: numberValue('finder', 'compact_height_px', 300),
    handoutGridScale: numberValue('finder', 'handout_grid_scale', 2),
    backgroundGridScale: numberValue('finder', 'background_grid_scale', 2),
  },
  editor: {
    snapThresholdScreenPx: numberValue('editor', 'snap_threshold_screen_px', 5),
    maxSnapCandidates: numberValue('editor', 'max_snap_candidates', 24),
    continuousEditCommitDelayMs: numberValue('editor', 'continuous_edit_commit_delay_ms', 450),
  },
  mask: {
    enabled: sectionValue('mask').enabled !== false,
    usePixiPreview: sectionValue('mask').use_pixi_preview !== false,
    strokePreviewMinOpacity: unitValue('mask', 'stroke_preview_min_opacity', 0.3),
    interactiveRefreshDelayMs: numberValue('mask', 'interactive_refresh_delay_ms', 1000),
    pointerIdleGraceMs: numberValue('mask', 'pointer_idle_grace_ms', 120),
  },
  foregroundSegmentation: {
    enabled: sectionValue('foreground_segmentation').enabled !== false,
    model: segmentationModel(stringValue('foreground_segmentation', 'model', stringValue('foreground_segmentation', 'model_id', 'birefnet-general'))),
    device: segmentationDevice(stringValue('foreground_segmentation', 'device', 'auto')),
    workerThreads: numberValue('foreground_segmentation', 'worker_threads', 1),
    intraThreads: numberValue('foreground_segmentation', 'intra_threads', 0),
    interThreads: numberValue('foreground_segmentation', 'inter_threads', 1),
    downloadMissingModels: sectionValue('foreground_segmentation').download_missing_models !== false,
    downloadTimeoutSeconds: numberValue('foreground_segmentation', 'download_timeout_seconds', 600),
    modelCacheDirectory: stringValue('foreground_segmentation', 'model_cache_directory', './models/foreground-segmentation'),
    outputSuffix: stringValue('foreground_segmentation', 'output_suffix', '-foreground'),
    maxSourceDimension: numberValue('foreground_segmentation', 'max_source_dimension', 16384),
    maxSourcePixels: numberValue('foreground_segmentation', 'max_source_pixels', 67108864),
  },
  export: handoutExportConfigurationFromValue(parsed.export),
  debug: {
    fileLogEnabled: sectionValue('debug').file_log_enabled !== false,
    renderPerfLogEnabled: sectionValue('debug').render_perf_log_enabled !== false,
  },
  token: tokenConfigurationFromToml(parsed.token),
} satisfies AppConfiguration

export function serializeConfigurationToml(config: AppConfiguration) {
  return `# Handout Generator local configuration.\n${dump({
    schema_version: config.schemaVersion,
    application: { title: config.application.title, locale: config.application.locale },
    window: { width: config.window.width, height: config.window.height, min_width: config.window.minWidth, min_height: config.window.minHeight, resizable: config.window.resizable },
    diagnostics: { log_directory: config.diagnostics.logDirectory },
    paths: { data_dir: config.paths.dataDir, log_file: config.paths.logFile },
    uploads: { max_file_size: config.uploads.maxFileSize },
    previews: {
      thumbnail_max_edge_px: config.previews.thumbnailMaxEdgePx,
      thumbnail_quality: config.previews.thumbnailQuality,
      target_max_bytes: config.previews.targetMaxBytes,
    },
    finder: {
      manager_height_px: config.finder.managerHeightPx,
      compact_height_px: config.finder.compactHeightPx,
      handout_grid_scale: config.finder.handoutGridScale,
      background_grid_scale: config.finder.backgroundGridScale,
    },
    editor: {
      snap_threshold_screen_px: config.editor.snapThresholdScreenPx,
      max_snap_candidates: config.editor.maxSnapCandidates,
      continuous_edit_commit_delay_ms: config.editor.continuousEditCommitDelayMs,
    },
    mask: {
      enabled: config.mask.enabled,
      use_pixi_preview: config.mask.usePixiPreview,
      stroke_preview_min_opacity: clamp(config.mask.strokePreviewMinOpacity, 0, 1),
      interactive_refresh_delay_ms: Math.max(0, Math.round(config.mask.interactiveRefreshDelayMs)),
      pointer_idle_grace_ms: Math.max(0, Math.round(config.mask.pointerIdleGraceMs)),
    },
    foreground_segmentation: {
      enabled: config.foregroundSegmentation.enabled,
      model: config.foregroundSegmentation.model,
      device: config.foregroundSegmentation.device,
      worker_threads: Math.max(1, Math.round(config.foregroundSegmentation.workerThreads)),
      intra_threads: Math.max(0, Math.round(config.foregroundSegmentation.intraThreads)),
      inter_threads: Math.max(1, Math.round(config.foregroundSegmentation.interThreads)),
      download_missing_models: config.foregroundSegmentation.downloadMissingModels,
      download_timeout_seconds: Math.max(1, Math.round(config.foregroundSegmentation.downloadTimeoutSeconds)),
      model_cache_directory: config.foregroundSegmentation.modelCacheDirectory,
      output_suffix: config.foregroundSegmentation.outputSuffix,
      max_source_dimension: Math.max(1, Math.round(config.foregroundSegmentation.maxSourceDimension)),
      max_source_pixels: Math.max(1, Math.round(config.foregroundSegmentation.maxSourcePixels)),
    },
    export: {
      default_scale: config.export.defaultScale,
      min_scale: config.export.minScale,
      raw_rgba_ipc_max_bytes: config.export.rawRgbaIpcMaxBytes,
      defaults: serializeExportDefaults(config.export.defaults),
      limits: serializeExportLimits(config.export.limits),
      rendering: { jpeg_matte_color: config.export.rendering.jpegMatteColor },
      webp_strength_profiles: config.export.webpStrengthProfiles,
    },
    debug: {
      file_log_enabled: config.debug.fileLogEnabled,
      render_perf_log_enabled: config.debug.renderPerfLogEnabled,
    },
    token: tokenConfigurationToToml(config.token),
  })}`
}

export function configurationFromToml(source: string): AppConfiguration {
  const config = parseConfigurationToml(source)
  const section = (name: string) => {
    const value = config[name]
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  }
  const numberFrom = (sectionName: string, key: string, fallback: number) => {
    const value = section(sectionName)[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
  }
  const unitFrom = (section: string, key: string, fallback: number) => clamp(numberFrom(section, key, fallback), 0, 1)
  const stringFrom = (sectionName: string, key: string, fallback: string) => {
    const value = section(sectionName)[key]
    return typeof value === 'string' ? value : fallback
  }
  return {
    schemaVersion: typeof config.schema_version === 'number' ? config.schema_version : appConfiguration.schemaVersion,
    application: {
      title: stringFrom('application', 'title', appConfiguration.application.title),
      locale: localePreference(stringFrom('application', 'locale', appConfiguration.application.locale)),
    },
    window: {
      width: numberFrom('window', 'width', appConfiguration.window.width),
      height: numberFrom('window', 'height', appConfiguration.window.height),
      minWidth: numberFrom('window', 'min_width', appConfiguration.window.minWidth),
      minHeight: numberFrom('window', 'min_height', appConfiguration.window.minHeight),
      resizable: typeof section('window').resizable === 'boolean' ? section('window').resizable as boolean : appConfiguration.window.resizable,
    },
    diagnostics: { logDirectory: stringFrom('diagnostics', 'log_directory', appConfiguration.diagnostics.logDirectory) },
    paths: {
      dataDir: stringFrom('paths', 'data_dir', appConfiguration.paths.dataDir),
      logFile: stringFrom('paths', 'log_file', appConfiguration.paths.logFile),
    },
    uploads: {
      maxFileSize: stringFrom('uploads', 'max_file_size', appConfiguration.uploads.maxFileSize),
    },
    previews: {
      thumbnailMaxEdgePx: numberFrom('previews', 'thumbnail_max_edge_px', appConfiguration.previews.thumbnailMaxEdgePx),
      thumbnailQuality: numberFrom('previews', 'thumbnail_quality', appConfiguration.previews.thumbnailQuality),
      targetMaxBytes: numberFrom('previews', 'target_max_bytes', appConfiguration.previews.targetMaxBytes),
    },
    finder: {
      managerHeightPx: numberFrom('finder', 'manager_height_px', appConfiguration.finder.managerHeightPx),
      compactHeightPx: numberFrom('finder', 'compact_height_px', appConfiguration.finder.compactHeightPx),
      handoutGridScale: numberFrom('finder', 'handout_grid_scale', appConfiguration.finder.handoutGridScale),
      backgroundGridScale: numberFrom('finder', 'background_grid_scale', appConfiguration.finder.backgroundGridScale),
    },
    editor: {
      snapThresholdScreenPx: numberFrom('editor', 'snap_threshold_screen_px', appConfiguration.editor.snapThresholdScreenPx),
      maxSnapCandidates: numberFrom('editor', 'max_snap_candidates', appConfiguration.editor.maxSnapCandidates),
      continuousEditCommitDelayMs: numberFrom('editor', 'continuous_edit_commit_delay_ms', appConfiguration.editor.continuousEditCommitDelayMs),
    },
    mask: {
      enabled: section('mask').enabled !== false,
      usePixiPreview: section('mask').use_pixi_preview !== false,
      strokePreviewMinOpacity: unitFrom('mask', 'stroke_preview_min_opacity', appConfiguration.mask.strokePreviewMinOpacity),
      interactiveRefreshDelayMs: numberFrom('mask', 'interactive_refresh_delay_ms', appConfiguration.mask.interactiveRefreshDelayMs),
      pointerIdleGraceMs: numberFrom('mask', 'pointer_idle_grace_ms', appConfiguration.mask.pointerIdleGraceMs),
    },
    foregroundSegmentation: {
      enabled: section('foreground_segmentation').enabled !== false,
      model: segmentationModel(stringFrom('foreground_segmentation', 'model', stringFrom('foreground_segmentation', 'model_id', appConfiguration.foregroundSegmentation.model))),
      device: segmentationDevice(stringFrom('foreground_segmentation', 'device', appConfiguration.foregroundSegmentation.device)),
      workerThreads: numberFrom('foreground_segmentation', 'worker_threads', appConfiguration.foregroundSegmentation.workerThreads),
      intraThreads: numberFrom('foreground_segmentation', 'intra_threads', appConfiguration.foregroundSegmentation.intraThreads),
      interThreads: numberFrom('foreground_segmentation', 'inter_threads', appConfiguration.foregroundSegmentation.interThreads),
      downloadMissingModels: section('foreground_segmentation').download_missing_models !== false,
      downloadTimeoutSeconds: numberFrom('foreground_segmentation', 'download_timeout_seconds', appConfiguration.foregroundSegmentation.downloadTimeoutSeconds),
      modelCacheDirectory: stringFrom('foreground_segmentation', 'model_cache_directory', appConfiguration.foregroundSegmentation.modelCacheDirectory),
      outputSuffix: stringFrom('foreground_segmentation', 'output_suffix', appConfiguration.foregroundSegmentation.outputSuffix),
      maxSourceDimension: numberFrom('foreground_segmentation', 'max_source_dimension', appConfiguration.foregroundSegmentation.maxSourceDimension),
      maxSourcePixels: numberFrom('foreground_segmentation', 'max_source_pixels', appConfiguration.foregroundSegmentation.maxSourcePixels),
    },
    export: handoutExportConfigurationFromValue(config.export, appConfiguration.export),
    debug: {
      fileLogEnabled: section('debug').file_log_enabled !== false,
      renderPerfLogEnabled: section('debug').render_perf_log_enabled !== false,
    },
    token: tokenConfigurationFromToml(config.token ?? defaultTokenConfiguration),
  }
}

function serializeExportDefaults(value: HandoutExportConfiguration['defaults']) {
  return {
    format: value.format, png_optimization_level: value.pngOptimizationLevel,
    png_optimize_alpha: value.pngOptimizeAlpha, png_preserve_metadata: value.pngPreserveMetadata,
    png_zopfli: value.pngZopfli, jpeg_quality: value.jpegQuality,
    jpeg_progressive: value.jpegProgressive, jpeg_deringing: value.jpegDeringing,
    jpeg_chroma_subsampling: value.jpegChromaSubsampling, webp_quality: value.webpQuality,
    webp_lossless: value.webpLossless, webp_encoding_strength: value.webpEncodingStrength,
    jxl_lossless: value.jxlLossless, jxl_distance: value.jxlDistance,
    jxl_effort: value.jxlEffort, jxl_progressive: value.jxlProgressive,
    jxl_decoding_speed: value.jxlDecodingSpeed,
  }
}

function serializeExportLimits(value: HandoutExportConfiguration['limits']) {
  return {
    png_optimization_level_min: value.pngOptimizationLevelMin,
    png_optimization_level_max: value.pngOptimizationLevelMax,
    jpeg_quality_min: value.jpegQualityMin, jpeg_quality_max: value.jpegQualityMax,
    webp_quality_min: value.webpQualityMin, webp_quality_max: value.webpQualityMax,
    jxl_distance_min: value.jxlDistanceMin, jxl_distance_max: value.jxlDistanceMax,
    jxl_effort_min: value.jxlEffortMin, jxl_effort_max: value.jxlEffortMax,
    jxl_decoding_speed_min: value.jxlDecodingSpeedMin,
    jxl_decoding_speed_max: value.jxlDecodingSpeedMax,
    max_canvas_dimension: value.maxCanvasDimension, max_canvas_pixels: value.maxCanvasPixels,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
