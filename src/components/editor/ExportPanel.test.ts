// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { appConfiguration } from '@/lib/configuration'
import type { HandoutEncodingOptions } from '@/lib/handout-export'
import ExportPanel from './ExportPanel.vue'

describe('ExportPanel', () => {
  it('emits updated Handout encoding options when a boolean setting is toggled', async () => {
    const encoding = structuredClone(appConfiguration.export.defaults) as HandoutEncodingOptions
    const wrapper = mount(ExportPanel, {
      props: {
        exportScale: 1,
        exportEncoding: encoding,
        'onUpdate:exportEncoding': (value: HandoutEncodingOptions) => wrapper.setProps({ exportEncoding: value }),
      },
      global: { stubs: { NumericSliderField: true } },
    })

    const initial = encoding.pngOptimizeAlpha
    await wrapper.findAll('[role="switch"]')[0]!.trigger('click')

    expect((wrapper.props('exportEncoding') as HandoutEncodingOptions).pngOptimizeAlpha).toBe(!initial)
  })
})
