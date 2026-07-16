// @vitest-environment jsdom

import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { translate } from '@/i18n'

vi.mock('./TokenPreview.vue', () => ({ default: { template: '<div />' } }))

import TokenWorkspace from './TokenWorkspace.vue'

describe('TokenWorkspace', () => {
  it('renders source-aligned file, preview, and control panel headers', () => {
    const wrapper = mount(TokenWorkspace, {
      global: {
        plugins: [createPinia()],
        stubs: {
          ResizablePanelGroup: { template: '<div><slot /></div>' },
          ResizablePanel: { template: '<section><slot /></section>' },
          ResizableHandle: true,
          TokenAssetFinder: true,
          TokenItemsPanel: true,
          TokenParametersPanel: true,
          TokenExportPanel: true,
          TokenPreview: true,
        },
      },
    })

    expect(wrapper.text()).toContain(translate('TOKEN_PROJECT'))
    expect(wrapper.text()).toContain(translate('TOKEN_PREVIEW'))
    expect(wrapper.text()).toContain(translate('TOKEN_CONTROL_PANEL'))
    expect(wrapper.text()).toContain(translate('TOKEN_PREVIEW_DRAG_HELP'))
  })
})
