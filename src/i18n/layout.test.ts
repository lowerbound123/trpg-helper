import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('localized manager and settings layout', () => {
  it('keeps status before the settings action', () => {
    const source = readFileSync('src/components/ManagerShell.vue', 'utf8')
    expect(source.indexOf('data-testid="manager-status"')).toBeGreaterThan(-1)
    expect(source.indexOf('data-testid="manager-settings"')).toBeGreaterThan(-1)
    expect(source.indexOf('data-testid="manager-status"')).toBeLessThan(
      source.indexOf('data-testid="manager-settings"'),
    )
  })

  it('widens settings and exposes the restart-applied locale preference', () => {
    const source = readFileSync('src/components/settings/ConfigurationDialog.vue', 'utf8')
    expect(source).toContain('width: min(1440px, calc(100vw - 32px))')
    expect(source).toContain('draft.application.locale')
    expect(source).toContain("t('LANGUAGE_RESTART_NOTICE')")
  })
})
