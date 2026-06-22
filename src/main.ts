import { createApp } from 'vue'
import { createPinia } from 'pinia'
import VueKonva from 'vue-konva'
import VueFinderPlugin from 'vuefinder'
import './style.css'
import App from './App.vue'

const app = createApp(App)

// Suppress vue-konva extraneous-emits warnings: vue-konva components
// receive Konva-native event listeners not declared as Vue emits.
app.config.warnHandler = (msg, _instance, _trace) => {
  if (typeof msg === 'string' && msg.includes('Extraneous non-emits event listeners') && msg.includes('transform')) {
    return
  }
  console.warn(msg)
}

app.use(createPinia()).use(VueKonva).use(VueFinderPlugin, { i18n: {}, locale: 'zhCN' }).mount('#app')
