// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { EditorTool } from '@/lib/editor-tools'
import { useEditorStore } from '@/stores/editor'

import InspectorNumberSlider from './InspectorNumberSlider.vue'
import RightInspector from './RightInspector.vue'

function mountInspector(activeTool: EditorTool) {
  return mount(RightInspector, {
    props: {
      activeTool,
      exportScale: 1,
      exportFormat: 'png',
      exportQuality: 90,
      'onUpdate:exportScale': () => undefined,
      'onUpdate:exportFormat': () => undefined,
      'onUpdate:exportQuality': () => undefined,
    },
    global: {
      stubs: {
        ExportPanel: true,
      },
    },
  })
}

function activeTabText(wrapper: ReturnType<typeof mount>) {
  const active = wrapper.find('[data-slot="tabs-trigger"][data-state="active"]')
  return active.exists() ? active.text() : ''
}

describe('RightInspector tool tab routing', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  it('routes select and polygon tools to Inspect, and brush and eraser tools to Brush', async () => {
    const wrapper = mountInspector('select')

    expect(activeTabText(wrapper)).toBe('Inspect')

    await wrapper.setProps({ activeTool: 'brush' })
    expect(activeTabText(wrapper)).toBe('Brush')

    await wrapper.setProps({ activeTool: 'eraser' })
    expect(activeTabText(wrapper)).toBe('Brush')

    await wrapper.setProps({ activeTool: 'polygon' })
    expect(activeTabText(wrapper)).toBe('Inspect')

    await wrapper.setProps({ activeTool: 'select' })
    expect(activeTabText(wrapper)).toBe('Inspect')
  })

  it('uses the unified control for inspect values and preserves percent conversion', async () => {
    const editor = useEditorStore()
    editor.addShape('rect')
    const wrapper = mountInspector('select')
    const controls = wrapper.findAllComponents(InspectorNumberSlider)
    const opacity = controls.find((control) => control.props('label') === 'Opacity')

    expect(controls.some((control) => control.props('label') === 'X')).toBe(true)
    expect(controls.some((control) => control.props('label') === 'Rotation')).toBe(true)
    expect(opacity).toBeDefined()

    opacity?.vm.$emit('update:modelValue', 40)
    await wrapper.vm.$nextTick()

    expect(editor.selectedLayer?.opacity).toBe(0.4)
  })

  it('uses the unified control for brush settings and converts opacity percentages', async () => {
    const editor = useEditorStore()
    const wrapper = mountInspector('brush')
    const controls = wrapper.findAllComponents(InspectorNumberSlider)
    const brushOpacity = controls.find((control) => control.props('label') === 'Brush opacity')

    expect(controls.some((control) => control.props('label') === 'Brush width')).toBe(true)
    expect(controls.some((control) => control.props('label') === 'Eraser width')).toBe(true)
    expect(brushOpacity).toBeDefined()

    brushOpacity?.vm.$emit('update:modelValue', 35)
    await wrapper.vm.$nextTick()

    expect(editor.toolSettings.brushOpacity).toBe(0.35)
  })
})
