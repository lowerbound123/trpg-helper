// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { translate } from '@/i18n'
import BooleanSettingField from './BooleanSettingField.vue'

describe('BooleanSettingField', () => {
  it('exposes an accessible tooltip and emits the Reka switch model value', async () => {
    const wrapper = mount(BooleanSettingField, {
      props: {
        id: 'alpha-optimization',
        label: 'Alpha 优化',
        description: '优化完全透明像素。',
        modelValue: false,
      },
    })

    expect(wrapper.get('[data-parameter-label="true"]').attributes('aria-label')).toBe(
      translate('EXPLAIN_PARAMETER', { label: 'Alpha 优化' }),
    )
    const control = wrapper.get('[role="switch"]')
    expect(control.attributes('aria-checked')).toBe('false')

    await control.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })
})
