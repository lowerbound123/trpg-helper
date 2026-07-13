// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import ExportPanel from './ExportPanel.vue'
import InspectorNumberSlider from './InspectorNumberSlider.vue'

describe('ExportPanel numeric controls', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  it('uses the unified slider input for export scale', () => {
    const wrapper = mount(ExportPanel, {
      props: {
        exportScale: 1,
        exportFormat: 'png',
        exportQuality: 90,
      },
    })

    const scale = wrapper.findAllComponents(InspectorNumberSlider)
      .find((control) => control.props('label') === 'Export scale')

    expect(scale).toBeDefined()
    expect(scale?.props('min')).toBeGreaterThan(0)
    expect(scale?.props('max')).toBe(8)

    scale?.vm.$emit('update:modelValue', 2)
    expect(wrapper.emitted('update:exportScale')).toEqual([[2]])
  })

  it('uses the unified percent control for lossy export quality', () => {
    const wrapper = mount(ExportPanel, {
      props: {
        exportScale: 1,
        exportFormat: 'jpeg',
        exportQuality: 90,
      },
    })

    const quality = wrapper.findAllComponents(InspectorNumberSlider)
      .find((control) => control.props('label') === 'Quality')

    expect(quality?.props('unit')).toBe('%')
    quality?.vm.$emit('update:modelValue', 72)
    expect(wrapper.emitted('update:exportQuality')).toEqual([[72]])
  })
})
