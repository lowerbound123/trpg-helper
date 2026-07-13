// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import ExportPanel from './ExportPanel.vue'
import NumericSliderField from '@/components/controls/NumericSliderField.vue'
import { appConfiguration } from '@/lib/configuration'

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
        exportEncoding: structuredClone(appConfiguration.export.defaults),
      },
    })

    const scale = wrapper.findAllComponents(NumericSliderField)
      .find((control) => control.props('label') === '导出缩放')

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
        exportEncoding: { ...structuredClone(appConfiguration.export.defaults), format: 'jpg' as const },
      },
    })

    const quality = wrapper.findAllComponents(NumericSliderField)
      .find((control) => control.props('label') === 'JPEG 质量')

    expect(quality?.props('unit')).toBe('%')
    quality?.vm.$emit('update:modelValue', 72)
    expect(wrapper.emitted('update:exportEncoding')?.at(-1)?.[0]).toMatchObject({ jpegQuality: 72 })
  })
})
