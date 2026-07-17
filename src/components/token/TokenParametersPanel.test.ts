// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TokenProjectDocument } from '@/lib/token'
import { createDefaultTokenExportSettings, createDefaultTokenVisualStyle } from '@/lib/token'
import { translate } from '@/i18n'
import { useTokenStore } from '@/stores/token'
import { useEditorStore } from '@/stores/editor'
import { useTokenRingStore } from '@/stores/token-rings'
import TokenParametersPanel from './TokenParametersPanel.vue'

const backend = vi.hoisted(() => ({ updateTokenRingConfig: vi.fn(), updateTokenBackgroundConfig: vi.fn() }))
vi.mock('@/lib/backend', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/backend')>(),
  updateTokenRingConfig: backend.updateTokenRingConfig,
  updateTokenBackgroundConfig: backend.updateTokenBackgroundConfig,
}))

function documentFixture(): TokenProjectDocument {
  const now = new Date(0).toISOString()
  return {
    schemaVersion: 1,
    id: 'project-1',
    title: 'Token project',
    items: [{
      id: 'item-1',
      name: 'avatar.png',
      mediaType: 'image/png',
      sourcePath: '/tmp/avatar.png',
      style: createDefaultTokenVisualStyle(),
    }],
    exportSettings: createDefaultTokenExportSettings(),
    createdAt: now,
    updatedAt: now,
  }
}

describe('TokenParametersPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('updates split-ring mode through the shared switch model contract', async () => {
    const token = useTokenStore()
    token.document = documentFixture()
    token.selectedItemId = 'item-1'
    const wrapper = mount(TokenParametersPanel, {
      global: {
        stubs: {
          NumericSliderField: true,
          TokenColorPicker: true,
          TokenRingSelector: true,
          TokenBackgroundSelector: true,
        },
      },
    })

    const control = wrapper.get('[role="switch"]')
    expect(control.attributes('aria-checked')).toBe('false')
    await control.trigger('click')

    expect(token.selectedItem?.style.splitRing).toBe(true)
  })

  it('keeps custom ring geometry collapsed until requested', async () => {
    const token = useTokenStore()
    const editor = useEditorStore()
    token.document = documentFixture()
    token.selectedItemId = 'item-1'
    token.selectedItem!.style.ringStyle = 'asset:ring-1'
    editor.library.assets = [{
      id: 'ring-1', name: 'ring.png', fileName: 'ring.png', path: '/tmp/ring.png',
      mediaType: 'image/png', tags: [], folder: 'rings', createdAt: '', updatedAt: '',
      tokenRing: {
        revision: 1, designSize: 512, innerRadius: 225, outerRadius: 250,
        imageScaleX: 100, imageScaleY: 100, imageOffsetX: 0, imageOffsetY: 0,
      },
    }]
    const wrapper = mount(TokenParametersPanel, {
      global: {
        stubs: {
          NumericSliderField: { props: ['label'], template: '<div class="numeric-field">{{ label }}</div>' },
          TokenColorPicker: true,
          TokenRingSelector: true,
        },
      },
    })

    expect(wrapper.text()).toContain(translate('TOKEN_CUSTOM_RING_GEOMETRY'))
    expect(wrapper.findAll('.numeric-field')).toHaveLength(4)

    await wrapper.get('[data-testid="custom-ring-geometry-trigger"]').trigger('click')
    const labels = wrapper.findAll('.numeric-field').map((node) => node.text())
    expect(labels).toEqual(expect.arrayContaining([
      translate('TOKEN_RING_INNER_RADIUS'),
      translate('TOKEN_RING_OUTER_RADIUS'),
      translate('TOKEN_RING_SCALE_X'),
      translate('TOKEN_RING_SCALE_Y'),
      translate('TOKEN_RING_OFFSET_X'),
      translate('TOKEN_RING_OFFSET_Y'),
    ]))
    expect(labels).not.toContain('设计尺寸')
    expect(wrapper.text()).not.toContain('更新圆环几何')
  })

  it('does not expose stretch controls for built-in rings', () => {
    const token = useTokenStore()
    token.document = documentFixture()
    token.selectedItemId = 'item-1'
    const wrapper = mount(TokenParametersPanel, {
      global: { stubs: {
        NumericSliderField: { props: ['label'], template: '<div class="numeric-field">{{ label }}</div>' },
        TokenColorPicker: true, TokenRingSelector: true,
      } },
    })
    const labels = wrapper.findAll('.numeric-field').map((node) => node.text())
    expect(labels).not.toContain(translate('TOKEN_RING_SCALE_X'))
    expect(labels).not.toContain(translate('TOKEN_RING_SCALE_Y'))
  })

  it('shows only offset controls for a custom background', async () => {
    const token = useTokenStore()
    const editor = useEditorStore()
    token.document = documentFixture()
    token.selectedItemId = 'item-1'
    token.selectedItem!.style.backgroundStyle = 'asset:background-1'
    editor.library.assets = [{
      id: 'background-1', name: 'background.png', fileName: 'background.png', path: '/tmp/background.png',
      mediaType: 'image/png', tags: [], folder: 'token-backgrounds', createdAt: '', updatedAt: '',
      tokenBackground: { revision: 1, designSize: 512, imageOffsetX: 0, imageOffsetY: 0 },
    }]
    const wrapper = mount(TokenParametersPanel, {
      global: {
        stubs: {
          NumericSliderField: { props: ['label'], template: '<div class="numeric-field">{{ label }}</div>' },
          TokenColorPicker: true,
          TokenRingSelector: true,
          TokenBackgroundSelector: true,
        },
      },
    })

    await wrapper.get('[data-testid="custom-background-geometry-trigger"]').trigger('click')
    const labels = wrapper.findAll('.numeric-field').map((node) => node.text())
    expect(labels).toContain(translate('TOKEN_BACKGROUND_OFFSET_X'))
    expect(labels).toContain(translate('TOKEN_BACKGROUND_OFFSET_Y'))
    expect(labels).not.toContain(translate('TOKEN_RING_SCALE_X'))
  })

  it('keeps the live ring preview draft until commit', async () => {
    const token = useTokenStore()
    const editor = useEditorStore()
    const rings = useTokenRingStore()
    token.document = documentFixture()
    token.selectedItemId = 'item-1'
    token.selectedItem!.style.ringStyle = 'asset:ring-1'
    editor.library.assets = [{
      id: 'ring-1', name: 'ring.png', fileName: 'ring.png', path: '/tmp/ring.png',
      mediaType: 'image/png', tags: [], folder: 'rings', createdAt: '', updatedAt: '',
      tokenRing: { revision: 1, designSize: 512, innerRadius: 225, outerRadius: 250,
        imageScaleX: 100, imageScaleY: 100, imageOffsetX: 0, imageOffsetY: 0 },
    }]
    const wrapper = mount(TokenParametersPanel, {
      global: { stubs: {
        NumericSliderField: {
          props: ['label', 'modelValue'],
          emits: ['edit-start', 'update:modelValue', 'commit'],
          template: '<button class="numeric-field" @click="$emit(\'edit-start\'); $emit(\'update:modelValue\', 130)">{{ label }}:{{ modelValue }}</button>',
        },
        TokenColorPicker: true, TokenRingSelector: true,
      } },
    })

    await wrapper.get('[data-testid="custom-ring-geometry-trigger"]').trigger('click')
    const scale = wrapper.findAll('.numeric-field').find((node) => node.text().startsWith(translate('TOKEN_RING_SCALE_X')))!
    await scale.trigger('click')
    await wrapper.vm.$nextTick()

    expect(rings.descriptor('asset:ring-1')?.customConfig?.imageScaleX).toBe(130)
    expect(scale.text()).toContain('130')
  })
})
