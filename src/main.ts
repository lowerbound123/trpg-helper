import { createApp } from 'vue'
import { createPinia } from 'pinia'
import VueKonva from 'vue-konva'
import './style.css'
import App from './App.vue'

createApp(App).use(createPinia()).use(VueKonva).mount('#app')
