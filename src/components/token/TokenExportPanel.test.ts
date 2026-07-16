// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDefaultTokenExportSettings, createDefaultTokenVisualStyle, type TokenProjectDocument } from '@/lib/token'
import { translate } from '@/i18n'
import { useTokenStore } from '@/stores/token'
import TokenExportPanel from './TokenExportPanel.vue'

function documentFixture(): TokenProjectDocument {
  const now = new Date(0).toISOString()
  return {
    schemaVersion: 1,
    id: 'project-1',
    title: 'Token project',
    items: [{
      id: 'item-1',
      name: 'avatar.png',
      mediaType: 'image/png',
      sourcePath: '/tmp/avatar.png',
      style: createDefaultTokenVisualStyle(),
    }],
    exportSettings: createDefaultTokenExportSettings(),
    createdAt: now,
    updatedAt: now,
  }
}

describe('TokenExportPanel', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('updates PNG alpha optimization through the shared switch model contract', async () => {
    const token = useTokenStore()
    token.document = documentFixture()
    const initial = token.document.exportSettings.pngOptimizeAlpha
    const wrapper = mount(TokenExportPanel, {
      global: { stubs: { NumericSliderField: true } },
    })

    const switches = wrapper.findAll('[role="switch"]')
    expect(switches.length).toBeGreaterThanOrEqual(5)
    await switches[2]!.trigger('click')

    expect(token.document.exportSettings.pngOptimizeAlpha).toBe(!initial)
  })

  it('renders focusable explanations for advanced PNG settings', () => {
    const token = useTokenStore()
    token.document = documentFixture()
    const wrapper = mount(TokenExportPanel, {
      global: { stubs: { NumericSliderField: true } },
    })

    const labels = wrapper.findAll('[data-parameter-label="true"]').map((node) => node.text())
    expect(labels).toEqual(expect.arrayContaining([
      translate('EXPORT_PNG_ALPHA'),
      translate('EXPORT_PNG_METADATA'),
      translate('ZOPFLI'),
    ]))
  })

  it('exposes an observable selected state for export format buttons', () => {
    const token = useTokenStore()
    token.document = documentFixture()
    const wrapper = mount(TokenExportPanel, {
      global: { stubs: { NumericSliderField: true } },
    })

    expect(wrapper.get('button[data-export-format="png"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('button[data-export-format="jpg"]').attributes('aria-pressed')).toBe('false')
  })
})
