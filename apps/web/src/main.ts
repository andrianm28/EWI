import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setUnauthorizedHandler } from './api/client'
import { useSessionStore } from './stores/session'
import '@fontsource/roboto/latin-400.css'
import '@fontsource/roboto/latin-500.css'
import '@fontsource/roboto/latin-700.css'
import '@fontsource/roboto-mono/latin-400.css'
import '@fontsource/roboto-mono/latin-500.css'
import './style.css'
import { initTheme } from './shell/theme'
import { installTitle } from './shell/title'

initTheme()

installTitle(router)
const app = createApp(App).use(createPinia()).use(router)

// PK-16: sesi habis atau dicabut -> kembali ke halaman login dengan pesan, lalu ke halaman semula setelah masuk
const session = useSessionStore()
session.setExpiredHandler((reason) => {
  const current = router.currentRoute.value
  if (current.meta.public) return
  router.push({ name: 'login', query: { alasan: reason === 'SESSION_IDLE' ? 'sesi-diam' : 'sesi-habis', ke: current.fullPath } })
})
setUnauthorizedHandler((code) => session.expire(code))

app.mount('#app')
