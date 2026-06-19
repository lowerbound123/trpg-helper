import configurationToml from '../../configuration.toml?raw'

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

const parsed = parseConfigurationToml(configurationToml)

function numberValue(section: string, key: string, fallback: number) {
  const value = parsed[section]?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringValue(section: string, key: string, fallback: string) {
  const value = parsed[section]?.[key]
  return typeof value === 'string' ? value : fallback
}

export const appConfiguration = {
  uploads: {
    maxFileSize: stringValue('uploads', 'max_file_size', '100mb'),
  },
  finder: {
    handoutGridScale: numberValue('finder', 'handout_grid_scale', 2),
    backgroundGridScale: numberValue('finder', 'background_grid_scale', 2),
  },
  editor: {
    continuousEditCommitDelayMs: numberValue('editor', 'continuous_edit_commit_delay_ms', 450),
  },
  export: {
    defaultScale: numberValue('export', 'default_scale', 1),
    minScale: numberValue('export', 'min_scale', 0.1),
  },
}
