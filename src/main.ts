import { createApp } from 'vue'
import { createPinia } from 'pinia'
import VueKonva from 'vue-konva'
import VueFinderPlugin from 'vuefinder'
import './style.css'
import App from './App.vue'

createApp(App).use(createPinia()).use(VueKonva).use(VueFinderPlugin, { i18n: {}, locale: 'zhCN' }).mount('#app')
