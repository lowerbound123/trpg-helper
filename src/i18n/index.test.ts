import { describe, expect, it } from 'vitest'

import { enUSMessages } from './en-US'
import { resolveAppLocale } from './index'
import { zhCNMessages } from './zh-CN'

describe('application locale', () => {
  it('resolves auto from the system locale and falls back to English', () => {
    expect(resolveAppLocale('auto', 'zh-CN')).toBe('zh-CN')
    expect(resolveAppLocale('auto', 'zh-Hant-TW')).toBe('zh-CN')
    expect(resolveAppLocale('auto', 'en-GB')).toBe('en-US')
    expect(resolveAppLocale('auto', 'ja-JP')).toBe('en-US')
  })

  it('honors explicit supported locales', () => {
    expect(resolveAppLocale('zh-CN', 'en-US')).toBe('zh-CN')
    expect(resolveAppLocale('en-US', 'zh-CN')).toBe('en-US')
  })

  it('keeps locale catalogs complete and uppercase', () => {
    const englishKeys = Object.keys(enUSMessages).sort()
    expect(Object.keys(zhCNMessages).sort()).toEqual(englishKeys)
    expect(englishKeys.length).toBeGreaterThan(0)
    expect(englishKeys.every((key) => /^[A-Z][A-Z0-9_]*$/.test(key))).toBe(true)
  })
})
