// @vitest-environment jsdom

import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import TokenAssetFinder from './TokenAssetFinder.vue'
import { tokenEditorContextKey } from './token-editor-context'

const VueFinderStub = defineComponent({
  name: 'VueFinderStub',
  inheritAttrs: false,
  props: {
    driver: { type: Object, required: false },
    contextMenuItems: { type: Array, required: false },
  },
  template: '<div data-testid="vuefinder-stub" />',
})

describe('TokenAssetFinder', () => {
  it('passes the typed asset driver and context menu items to VueFinder', () => {
    const driver = { init: vi.fn() }
    const contextMenuItems = [{ id: 'add-to-token' }]
    const wrapper = mount(TokenAssetFinder, {
      global: {
        provide: {
          [tokenEditorContextKey as symbol]: {
            finderRevision: { asset: 0 },
            uploadConfig: {},
            assetDriver: driver,
            assetFeatures: {},
            assetContextMenuItems: contextMenuItems,
            onPathChange: vi.fn(),
            onDrop: vi.fn(),
            onDragover: vi.fn(),
          },
        },
        stubs: {
          VueFinderProvider: VueFinderStub,
        },
      },
    })

    const finder = wrapper.findComponent(VueFinderStub)
    expect(finder.props('driver')).toBe(driver)
    expect(finder.props('contextMenuItems')).toBe(contextMenuItems)
  })
})
