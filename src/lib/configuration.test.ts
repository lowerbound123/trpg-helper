import { describe, expect, it } from 'vitest'

import { appConfiguration, parseConfigurationToml } from './configuration'

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
  })
})
