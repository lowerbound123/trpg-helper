// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import ConfigurationDialog from './ConfigurationDialog.vue'
import { i18n } from '@/i18n'

vi.mock('@/lib/backend', () => ({
  readConfiguration: vi.fn(),
  writeConfiguration: vi.fn(),
}))

describe('ConfigurationDialog', () => {
  it('groups settings into six functional tabs and gives every field hover help', async () => {
    const wrapper = mount(ConfigurationDialog, {
      props: { open: true },
      global: {
        plugins: [i18n],
        stubs: {
          Dialog: { template: '<div><slot /></div>' },
          DialogContent: { template: '<section class="dialog-content"><slot /></section>' },
          DialogHeader: { template: '<header><slot /></header>' },
          DialogTitle: { template: '<h2><slot /></h2>' },
          DialogDescription: { template: '<p><slot /></p>' },
          DialogFooter: { template: '<footer><slot /></footer>' },
          Tabs: { template: '<div data-slot="tabs"><slot /></div>' },
          TabsList: { template: '<nav><slot /></nav>' },
          TabsTrigger: { props: ['value'], template: '<button :data-value="value"><slot /></button>' },
          TabsContent: { props: ['value'], template: '<div :data-tab-content="value"><slot /></div>' },
          Input: true,
          Switch: true,
          Select: { template: '<div><slot /></div>' },
          SelectTrigger: { template: '<button><slot /></button>' },
          SelectValue: true,
          SelectContent: { template: '<div><slot /></div>' },
          SelectItem: { template: '<div><slot /></div>' },
          Button: { template: '<button><slot /></button>' },
        },
      },
    })

    expect(wrapper.find('.configuration-dialog').exists()).toBe(true)
    expect(wrapper.findAll('[data-value]').map((node) => node.text())).toEqual([
      'General', 'Library', 'Handout', 'Token', 'Export', 'AI',
    ])
    expect(wrapper.get('[data-tab-content="ai"]').text()).toContain('Foreground segmentation')
    await Promise.resolve()
    const fields = wrapper.findAll('.configuration-section label')
    expect(fields.length).toBeGreaterThan(50)
    expect(fields.every((field) => field.attributes('title')?.trim())).toBe(true)
  })
})
