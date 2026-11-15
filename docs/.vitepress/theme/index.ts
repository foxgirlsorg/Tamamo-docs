import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import TamamoHome from './home/TamamoHome.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('TamamoHome', TamamoHome)
  },
} satisfies Theme
