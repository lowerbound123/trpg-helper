import { createApp } from 'vue'
import { createPinia } from 'pinia'
import VueKonva from 'vue-konva'
import VueFinderPlugin from 'vuefinder'
import './style.css'
import App from './App.vue'
import { appendDebugLog } from './lib/backend'

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

app.use(createPinia()).use(VueKonva).use(VueFinderPlugin, { i18n: {}, locale: 'zhCN' }).mount('#app')
