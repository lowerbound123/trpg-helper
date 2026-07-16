// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import EditableProjectTitle from './EditableProjectTitle.vue'

describe('EditableProjectTitle', () => {
  it('commits a trimmed title on Enter', async () => {
    const wrapper = mount(EditableProjectTitle, { props: { title: 'Old title' } })
    await wrapper.get('button').trigger('click')
    const input = wrapper.get('input')
    await input.setValue('  New title  ')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('commit')).toEqual([['New title']])
  })

  it('cancels editing on Escape without committing', async () => {
    const wrapper = mount(EditableProjectTitle, { props: { title: 'Old title' } })
    await wrapper.get('button').trigger('click')
    await wrapper.get('input').setValue('Discard me')
    await wrapper.get('input').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('commit')).toBeUndefined()
    expect(wrapper.get('button').text()).toContain('Old title')
  })
})
