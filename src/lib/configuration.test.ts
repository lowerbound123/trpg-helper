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
    expect(appConfiguration.finder.managerHeightPx).toBe(1080)
    expect(appConfiguration.finder.handoutGridScale).toBe(2)
    expect(appConfiguration.finder.backgroundGridScale).toBe(2)
    expect(appConfiguration.editor.continuousEditCommitDelayMs).toBeGreaterThan(0)
    expect(appConfiguration.mask.enabled).toBe(true)
    expect(appConfiguration.mask.usePixiPreview).toBe(true)
    expect(appConfiguration.mask.strokePreviewMinOpacity).toBe(0.3)
    expect(appConfiguration.mask.interactiveRefreshDelayMs).toBe(1000)
    expect(appConfiguration.mask.pointerIdleGraceMs).toBe(120)
    expect(appConfiguration.token.defaults.designSize).toBe(512)
    expect(appConfiguration.token.export.webpStrengthProfiles).toHaveLength(4)
  })

  it('round-trips editable configuration fields', () => {
    const source = serializeConfigurationToml({
      ...appConfiguration,
      paths: { dataDir: './custom-data', logFile: './custom-log.txt' },
      mask: {
        enabled: false,
        usePixiPreview: false,
        strokePreviewMinOpacity: 0.45,
        interactiveRefreshDelayMs: 800,
        pointerIdleGraceMs: 90,
      },
      export: { defaultScale: 2, minScale: 0.2 },
    })
    const parsed = configurationFromToml(source)
    expect(parsed.paths.dataDir).toBe('./custom-data')
    expect(parsed.paths.logFile).toBe('./custom-log.txt')
    expect(parsed.mask.enabled).toBe(false)
    expect(parsed.mask.usePixiPreview).toBe(false)
    expect(parsed.mask.strokePreviewMinOpacity).toBe(0.45)
    expect(parsed.mask.interactiveRefreshDelayMs).toBe(800)
    expect(parsed.mask.pointerIdleGraceMs).toBe(90)
    expect(parsed.export.defaultScale).toBe(2)
    expect(parsed.export.minScale).toBe(0.2)
    expect(parsed.token.export.webpStrengthProfiles[1]?.id).toBe('balanced')
  })

  it('round-trips nested token tables and arrays of tables', () => {
    const source = serializeConfigurationToml({
      ...appConfiguration,
      token: {
        ...appConfiguration.token,
        defaults: { ...appConfiguration.token.defaults, scale: 125 },
        export: {
          ...appConfiguration.token.export,
          webpStrengthProfiles: [{ id: 'custom', label: 'Custom', method: 6, passes: 4 }],
        },
      },
    })
    const parsed = configurationFromToml(source)
    expect(parsed.token.defaults.scale).toBe(125)
    expect(parsed.token.export.webpStrengthProfiles).toEqual([
      { id: 'custom', label: 'Custom', method: 6, passes: 4 },
    ])
  })
})
