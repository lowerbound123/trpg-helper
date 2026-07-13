// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import { Slider } from '@/components/ui/slider'
import NumericSliderField from './NumericSliderField.vue'

describe('NumericSliderField', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  it('renders a label, editable display value, unit, and slider', () => {
    const wrapper = mount(NumericSliderField, {
      props: { label: 'Opacity', modelValue: 75, min: 0, max: 100, unit: '%' },
    })

    expect(wrapper.text()).toContain('Opacity')
    expect(wrapper.get('button[aria-label="Edit Opacity value"]').text()).toBe('75')
    expect(wrapper.get('[data-unit="true"]').text()).toBe('%')
    expect(wrapper.findComponent(Slider).exists()).toBe(true)
  })

  it('emits one interaction start, live values, and commit', async () => {
    const wrapper = mount(NumericSliderField, {
      props: { label: 'Blur', modelValue: 4, min: 0, max: 40 },
    })
    const slider = wrapper.findComponent(Slider)

    slider.vm.$emit('update:modelValue', [9])
    slider.vm.$emit('valueCommit', [9])
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('edit-start')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toEqual([[9], [9]])
    expect(wrapper.emitted('commit')).toEqual([[9]])
  })

  it('clamps and aligns precise input values', async () => {
    const wrapper = mount(NumericSliderField, {
      props: { label: 'Scale', modelValue: 1, min: 0.1, max: 8, step: 0.25 },
    })

    await wrapper.get('button').trigger('click')
    const input = wrapper.get('input')
    await input.setValue('4.13')
    await input.trigger('blur')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([4.1])
    expect(wrapper.emitted('commit')?.at(-1)).toEqual([4.1])
  })

  it('shows Mixed, disables the slider, and accepts an explicit value', async () => {
    const wrapper = mount(NumericSliderField, {
      props: { label: 'Rotation', modelValue: undefined, min: 0, max: 359 },
    })

    expect(wrapper.get('button').text()).toBe('Mixed')
    expect(wrapper.findComponent(Slider).props('disabled')).toBe(true)

    await wrapper.get('button').trigger('click')
    await wrapper.get('input').setValue('42')
    await wrapper.get('input').trigger('blur')
    expect(wrapper.emitted('commit')?.at(-1)).toEqual([42])
  })

  it('exposes a tooltip description', () => {
    const wrapper = mount(NumericSliderField, {
      props: {
        label: 'JXL Distance',
        description: 'Lower values preserve more detail.',
        modelValue: 1,
        min: 0,
        max: 5,
        step: 0.01,
      },
    })
    expect(wrapper.get('[data-parameter-label="true"]').attributes('aria-label')).toBe('Explain JXL Distance')
  })
})
