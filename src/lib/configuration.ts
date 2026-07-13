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
  token: TokenFeatureConfiguration
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
    enabled: sectionValue('mask').enabled !== false,
    usePixiPreview: sectionValue('mask').use_pixi_preview !== false,
    strokePreviewMinOpacity: unitValue('mask', 'stroke_preview_min_opacity', 0.3),
    interactiveRefreshDelayMs: numberValue('mask', 'interactive_refresh_delay_ms', 1000),
    pointerIdleGraceMs: numberValue('mask', 'pointer_idle_grace_ms', 120),
  },
  export: {
    defaultScale: numberValue('export', 'default_scale', 1),
    minScale: numberValue('export', 'min_scale', 0.1),
  },
  debug: {
    fileLogEnabled: sectionValue('debug').file_log_enabled !== false,
    renderPerfLogEnabled: sectionValue('debug').render_perf_log_enabled !== false,
  },
  token: tokenConfigurationFromToml(parsed.token),
} satisfies AppConfiguration

export function serializeConfigurationToml(config: AppConfiguration) {
  return `# Handout Generator local configuration.\n${dump({
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
    export: { default_scale: config.export.defaultScale, min_scale: config.export.minScale },
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
    export: {
      defaultScale: numberFrom('export', 'default_scale', appConfiguration.export.defaultScale),
      minScale: numberFrom('export', 'min_scale', appConfiguration.export.minScale),
    },
    debug: {
      fileLogEnabled: section('debug').file_log_enabled !== false,
      renderPerfLogEnabled: section('debug').render_perf_log_enabled !== false,
    },
    token: tokenConfigurationFromToml(config.token ?? defaultTokenConfiguration),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
