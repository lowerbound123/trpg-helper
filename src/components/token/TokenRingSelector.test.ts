// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import type { TokenProjectDocument } from '@/lib/token'
import { createDefaultTokenExportSettings, createDefaultTokenVisualStyle } from '@/lib/token'
import { translate } from '@/i18n'
import { useTokenStore } from '@/stores/token'
import TokenRingSelector from './TokenRingSelector.vue'

describe('TokenRingSelector', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows the current ring summary and expands the choices on demand', async () => {
    const token = useTokenStore()
    const now = new Date(0).toISOString()
    token.document = {
      schemaVersion: 1,
      id: 'project-1',
      title: 'Token',
      items: [{
        id: 'item-1', name: 'avatar.png', mediaType: 'image/png', sourcePath: '/tmp/avatar.png',
        style: createDefaultTokenVisualStyle(),
      }],
      exportSettings: createDefaultTokenExportSettings(),
      createdAt: now,
      updatedAt: now,
    } satisfies TokenProjectDocument
    token.selectedItemId = 'item-1'

    const wrapper = mount(TokenRingSelector)
    expect(wrapper.get('[data-testid="ring-selector-trigger"]').text()).toContain(
      translate('TOKEN_RING_STYLE', { name: 'solid' }),
    )
    expect(wrapper.get('[data-testid="ring-selector-content"]').attributes('data-state')).toBe('closed')

    await wrapper.get('[data-testid="ring-selector-trigger"]').trigger('click')
    expect(wrapper.get('[data-testid="ring-selector-content"]').attributes('data-state')).toBe('open')
  })
})
