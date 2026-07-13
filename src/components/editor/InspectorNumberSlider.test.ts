// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import { Slider } from '@/components/ui/slider'

import InspectorNumberSlider from './InspectorNumberSlider.vue'

describe('InspectorNumberSlider', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  it('renders a title, editable number input, unit, and shadcn slider', () => {
    const wrapper = mount(InspectorNumberSlider, {
      props: {
        label: 'Opacity',
        modelValue: 75,
        min: 0,
        max: 100,
        step: 1,
        unit: '%',
      },
    })

    expect(wrapper.get('[data-slot="inspector-number-label"]').text()).toBe('Opacity')
    expect(wrapper.get('input').element.value).toBe('75')
    expect(wrapper.get('[data-slot="inspector-number-unit"]').text()).toBe('%')
    expect(wrapper.findComponent(Slider).exists()).toBe(true)
  })

  it('emits live slider updates and a scalar commit value', async () => {
    const wrapper = mount(InspectorNumberSlider, {
      props: {
        label: 'Blur',
        modelValue: 4,
        min: 0,
        max: 40,
        step: 1,
      },
    })
    const slider = wrapper.findComponent(Slider)

    slider.vm.$emit('update:modelValue', [9])
    slider.vm.$emit('valueCommit', [9])
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')).toEqual([[9]])
    expect(wrapper.emitted('value-commit')).toEqual([[9]])
  })

  it('clamps and rounds precise input values on commit', async () => {
    const wrapper = mount(InspectorNumberSlider, {
      props: {
        label: 'Scale',
        modelValue: 1,
        min: 0.1,
        max: 8,
        step: 0.25,
      },
    })
    const input = wrapper.get('input')

    await input.setValue('4.13')
    await input.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([4.1])
    expect(wrapper.emitted('value-commit')?.at(-1)).toEqual([4.1])

    await input.setValue('99')
    await input.trigger('blur')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([8])
    expect(wrapper.emitted('value-commit')?.at(-1)).toEqual([8])
  })

  it('shows Mixed and disables only the slider until a valid value is entered', async () => {
    const wrapper = mount(InspectorNumberSlider, {
      props: {
        label: 'Rotation',
        modelValue: undefined,
        min: 0,
        max: 359,
        step: 1,
        placeholder: 'Mixed',
      },
    })

    expect(wrapper.get('input').attributes('placeholder')).toBe('Mixed')
    expect(wrapper.get('input').element.value).toBe('')
    expect(wrapper.findComponent(Slider).props('disabled')).toBe(true)

    await wrapper.get('input').setValue('42')
    await wrapper.get('input').trigger('blur')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([42])
    expect(wrapper.emitted('value-commit')?.at(-1)).toEqual([42])
  })

  it('restores the current value when editing is cancelled with Escape', async () => {
    const wrapper = mount(InspectorNumberSlider, {
      props: {
        label: 'Width',
        modelValue: 120,
        min: 1,
        max: 16384,
        step: 1,
      },
    })
    const input = wrapper.get('input')

    await input.setValue('900')
    await input.trigger('keydown', { key: 'Escape' })

    expect(input.element.value).toBe('120')
    expect(wrapper.emitted('value-commit')).toBeUndefined()
  })

  it('does not normalize or emit when focus leaves without an edit', async () => {
    const wrapper = mount(InspectorNumberSlider, {
      props: {
        label: 'Export scale',
        modelValue: 1,
        min: 0.1,
        max: 8,
        step: 0.25,
      },
    })
    const input = wrapper.get('input')

    await input.trigger('focus')
    await input.trigger('blur')

    expect(input.element.value).toBe('1')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('value-commit')).toBeUndefined()
  })

  it('labels the actual slider thumb with the business field name', () => {
    const wrapper = mount(InspectorNumberSlider, {
      props: {
        label: 'Document brightness',
        modelValue: 0,
        min: -100,
        max: 100,
        step: 1,
      },
    })

    expect(wrapper.get('[role="slider"]').attributes('aria-label')).toBe('Document brightness')
  })
})
