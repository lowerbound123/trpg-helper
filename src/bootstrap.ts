import { createApp } from 'vue'
import { createPinia } from 'pinia'
import VueKonva from 'vue-konva'
import VueFinderPlugin from 'vuefinder'
import './style.css'
import App from './App.vue'
import { appendDebugLog, readConfiguration } from './lib/backend'
import { appConfiguration, configurationFromToml } from './lib/configuration'
import { activateConfiguredLocale, i18n } from './i18n'

try {
  Object.assign(appConfiguration, configurationFromToml(await readConfiguration()))
} catch (error) {
  void appendDebugLog('app', 'startup-configuration-load-failed', { error: String(error) })
}

const activeLocale = activateConfiguredLocale()

const app = createApp(App)

// Suppress vue-konva extraneous-emits warnings: vue-konva components
// receive Konva-native event listeners not declared as Vue emits.
app.config.warnHandler = (msg, _instance, _trace) => {
  if (typeof msg === 'string' && msg.includes('Extraneous non-emits event listeners') && msg.includes('transform')) {
    return
  }
  void appendDebugLog('app', 'vue-warning', { message: String(msg) })
}

app.config.errorHandler = (error, instance, info) => {
  const normalized = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: String(error) }
  const component = instance?.$options.name ?? instance?.$options.__name ?? 'anonymous'
  void appendDebugLog('app', 'vue-error', { ...normalized, component, info })
}

app
  .use(createPinia())
  .use(i18n)
  .use(VueKonva)
  .use(VueFinderPlugin, { i18n: {}, locale: activeLocale === 'zh-CN' ? 'zhCN' : 'en' })
  .mount('#app')
