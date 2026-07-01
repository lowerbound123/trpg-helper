import { describe, expect, it } from 'vitest'

import { appConfiguration, configurationFromToml, parseConfigurationToml, serializeConfigurationToml } from './configuration'

describe('configuration', () => {
  it('parses simple TOML sections used by the app', () => {
    expect(parseConfigurationToml(`
      [finder]
      handout_grid_scale = 2
      enabled = true
      label = "Preview"
    `)).toEqual({
      finder: {
        handout_grid_scale: 2,
        enabled: true,
        label: 'Preview',
      },
    })
  })

  it('loads app configuration defaults from configuration.toml', () => {
    expect(appConfiguration.finder.handoutGridScale).toBe(2)
    expect(appConfiguration.finder.backgroundGridScale).toBe(2)
    expect(appConfiguration.editor.continuousEditCommitDelayMs).toBeGreaterThan(0)
    expect(appConfiguration.mask.enabled).toBe(true)
    expect(appConfiguration.mask.usePixiPreview).toBe(true)
    expect(appConfiguration.mask.strokePreviewMinOpacity).toBe(0.3)
  })

  it('round-trips editable configuration fields', () => {
    const source = serializeConfigurationToml({
      ...appConfiguration,
      paths: { dataDir: './custom-data', logFile: './custom-log.txt' },
      mask: { enabled: false, usePixiPreview: false, strokePreviewMinOpacity: 0.45 },
      export: { defaultScale: 2, minScale: 0.2 },
    })
    const parsed = configurationFromToml(source)
    expect(parsed.paths.dataDir).toBe('./custom-data')
    expect(parsed.paths.logFile).toBe('./custom-log.txt')
    expect(parsed.mask.enabled).toBe(false)
    expect(parsed.mask.usePixiPreview).toBe(false)
    expect(parsed.mask.strokePreviewMinOpacity).toBe(0.45)
    expect(parsed.export.defaultScale).toBe(2)
    expect(parsed.export.minScale).toBe(0.2)
  })
})
