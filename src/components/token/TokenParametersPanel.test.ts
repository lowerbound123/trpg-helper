// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import type { TokenProjectDocument } from '@/lib/token'
import { createDefaultTokenExportSettings, createDefaultTokenVisualStyle } from '@/lib/token'
import { useTokenStore } from '@/stores/token'
import TokenParametersPanel from './TokenParametersPanel.vue'

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

describe('TokenParametersPanel', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('updates split-ring mode through the shared switch model contract', async () => {
    const token = useTokenStore()
    token.document = documentFixture()
    token.selectedItemId = 'item-1'
    const wrapper = mount(TokenParametersPanel, {
      global: {
        stubs: {
          NumericSliderField: true,
          TokenColorPicker: true,
          TokenRingSelector: true,
        },
      },
    })

    const control = wrapper.get('[role="switch"]')
    expect(control.attributes('aria-checked')).toBe('false')
    await control.trigger('click')

    expect(token.selectedItem?.style.splitRing).toBe(true)
  })
})
