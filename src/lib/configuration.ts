import configurationToml from '../../configuration.toml?raw'

const CONFIGURATION_OVERRIDE_STORAGE_KEY = 'handout-generator.configuration.toml'

type TomlValue = string | number | boolean
type TomlObject = Record<string, Record<string, TomlValue>>

function parseScalar(value: string): TomlValue {
  const trimmed = value.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  return trimmed.replace(/^"|"$/g, '')
}

export function parseConfigurationToml(source: string): TomlObject {
  const result: TomlObject = {}
  let section = ''

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const sectionMatch = line.match(/^\[([^\]]+)]$/)
    if (sectionMatch) {
      section = sectionMatch[1]
      result[section] = result[section] || {}
      continue
    }
    const separator = line.indexOf('=')
    if (separator < 0 || !section) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1)
    result[section][key] = parseScalar(value)
  }

  return result
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

function numberValue(section: string, key: string, fallback: number) {
  const value = parsed[section]?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function unitValue(section: string, key: string, fallback: number) {
  return clamp(numberValue(section, key, fallback), 0, 1)
}

function stringValue(section: string, key: string, fallback: string) {
  const value = parsed[section]?.[key]
  return typeof value === 'string' ? value : fallback
}

export type AppConfiguration = {
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
  export: {
    defaultScale: number
    minScale: number
  }
  debug: {
    fileLogEnabled: boolean
    renderPerfLogEnabled: boolean
  }
}

export const appConfiguration = {
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
    enabled: parsed.mask?.enabled !== false,
    usePixiPreview: parsed.mask?.use_pixi_preview !== false,
    strokePreviewMinOpacity: unitValue('mask', 'stroke_preview_min_opacity', 0.3),
    interactiveRefreshDelayMs: numberValue('mask', 'interactive_refresh_delay_ms', 1000),
    pointerIdleGraceMs: numberValue('mask', 'pointer_idle_grace_ms', 120),
  },
  export: {
    defaultScale: numberValue('export', 'default_scale', 1),
    minScale: numberValue('export', 'min_scale', 0.1),
  },
  debug: {
    fileLogEnabled: parsed.debug?.file_log_enabled !== false,
    renderPerfLogEnabled: parsed.debug?.render_perf_log_enabled !== false,
  },
} satisfies AppConfiguration

function tomlString(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function serializeConfigurationToml(config: AppConfiguration) {
  return [
    '# Handout Generator local configuration.',
    '# Values here are read by the Vue/Tauri app at build time unless noted otherwise.',
    '',
    '[paths]',
    `data_dir = ${tomlString(config.paths.dataDir)}`,
    `log_file = ${tomlString(config.paths.logFile)}`,
    '',
    '[uploads]',
    `max_file_size = ${tomlString(config.uploads.maxFileSize)}`,
    '',
    '[previews]',
    `thumbnail_max_edge_px = ${config.previews.thumbnailMaxEdgePx}`,
    `thumbnail_quality = ${config.previews.thumbnailQuality}`,
    `target_max_bytes = ${config.previews.targetMaxBytes}`,
    '',
    '[finder]',
    `manager_height_px = ${config.finder.managerHeightPx}`,
    `compact_height_px = ${config.finder.compactHeightPx}`,
    `handout_grid_scale = ${config.finder.handoutGridScale}`,
    `background_grid_scale = ${config.finder.backgroundGridScale}`,
    '',
    '[editor]',
    `snap_threshold_screen_px = ${config.editor.snapThresholdScreenPx}`,
    `max_snap_candidates = ${config.editor.maxSnapCandidates}`,
    `continuous_edit_commit_delay_ms = ${config.editor.continuousEditCommitDelayMs}`,
    '',
    '[mask]',
    '# Set to false to disable all layer mask UI, editing, preview composition,',
    '# project preview masks, and export/flat mask application.',
    `enabled = ${config.mask.enabled}`,
    '# Use PixiJS for low-frequency layer mask preview composition. Final export',
    '# still uses the Canvas2D/Konva path so the output is deterministic.',
    `use_pixi_preview = ${config.mask.usePixiPreview}`,
    '# Minimum opacity used only for in-progress brush/eraser stroke previews while',
    '# editing a mask. Final mask pixels still use the configured brush/eraser value.',
    `stroke_preview_min_opacity = ${clamp(config.mask.strokePreviewMinOpacity, 0, 1)}`,
    '# Delay secondary mask preview work after brush/eraser/shape edits. Target layer',
    '# recomposition starts on the next frame.',
    `interactive_refresh_delay_ms = ${Math.max(0, Math.round(config.mask.interactiveRefreshDelayMs))}`,
    '# Keep secondary/full mask recomposition out of pointer down/drag hot paths.',
    `pointer_idle_grace_ms = ${Math.max(0, Math.round(config.mask.pointerIdleGraceMs))}`,
    '',
    '[export]',
    `default_scale = ${config.export.defaultScale}`,
    `min_scale = ${config.export.minScale}`,
    '',
    '[debug]',
    `file_log_enabled = ${config.debug.fileLogEnabled}`,
    `render_perf_log_enabled = ${config.debug.renderPerfLogEnabled}`,
    '',
  ].join('\n')
}

export function configurationFromToml(source: string): AppConfiguration {
  const config = parseConfigurationToml(source)
  const numberFrom = (section: string, key: string, fallback: number) => {
    const value = config[section]?.[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
  }
  const unitFrom = (section: string, key: string, fallback: number) => clamp(numberFrom(section, key, fallback), 0, 1)
  const stringFrom = (section: string, key: string, fallback: string) => {
    const value = config[section]?.[key]
    return typeof value === 'string' ? value : fallback
  }
  return {
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
      enabled: config.mask?.enabled !== false,
      usePixiPreview: config.mask?.use_pixi_preview !== false,
      strokePreviewMinOpacity: unitFrom('mask', 'stroke_preview_min_opacity', appConfiguration.mask.strokePreviewMinOpacity),
      interactiveRefreshDelayMs: numberFrom('mask', 'interactive_refresh_delay_ms', appConfiguration.mask.interactiveRefreshDelayMs),
      pointerIdleGraceMs: numberFrom('mask', 'pointer_idle_grace_ms', appConfiguration.mask.pointerIdleGraceMs),
    },
    export: {
      defaultScale: numberFrom('export', 'default_scale', appConfiguration.export.defaultScale),
      minScale: numberFrom('export', 'min_scale', appConfiguration.export.minScale),
    },
    debug: {
      fileLogEnabled: config.debug?.file_log_enabled !== false,
      renderPerfLogEnabled: config.debug?.render_perf_log_enabled !== false,
    },
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
