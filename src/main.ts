import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Antd from 'ant-design-vue'
import App from './App.vue'
import { i18n } from './i18n'

import 'ant-design-vue/dist/reset.css'
import './styles/themes.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(i18n)
app.use(Antd)

app.mount('#app')
