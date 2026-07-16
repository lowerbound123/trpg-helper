import { createI18n } from 'vue-i18n'

import { appConfiguration, type LocalePreference } from '@/lib/configuration'
import { enUSMessages, type MessageKey } from './en-US'
import { zhCNMessages } from './zh-CN'

export type AppLocale = 'zh-CN' | 'en-US'

export function resolveAppLocale(preference: LocalePreference, systemLocale: string): AppLocale {
  if (preference === 'zh-CN' || preference === 'en-US') return preference
  return systemLocale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

function systemLocale() {
  return typeof navigator === 'undefined' ? 'en-US' : navigator.language
}

export const i18n = createI18n({
  legacy: false,
  locale: resolveAppLocale(appConfiguration.application.locale, systemLocale()),
  fallbackLocale: 'en-US',
  messages: {
    'en-US': enUSMessages,
    'zh-CN': zhCNMessages,
  },
})

export function activateConfiguredLocale() {
  const locale = resolveAppLocale(appConfiguration.application.locale, systemLocale())
  i18n.global.locale.value = locale
  return locale
}

export function translate(key: MessageKey, values?: Record<string, unknown>) {
  return values ? i18n.global.t(key, values) : i18n.global.t(key)
}

export type { MessageKey }
