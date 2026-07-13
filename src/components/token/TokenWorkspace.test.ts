// @vitest-environment jsdom

import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

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

    expect(wrapper.text()).toContain('文件列表')
    expect(wrapper.text()).toContain('实时预览')
    expect(wrapper.text()).toContain('控制面板')
    expect(wrapper.text()).toContain('拖动预览区域可移动 Token，滚轮可缩放')
  })
})
