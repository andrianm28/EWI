import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setUnauthorizedHandler } from './api/client'
import { useSessionStore } from './stores/session'
import './style.css'

const app = createApp(App).use(createPinia()).use(router)

// PK-16: sesi habis atau dicabut -> kembali ke halaman login dengan pesan, lalu ke halaman semula setelah masuk
const session = useSessionStore()
session.setExpiredHandler(() => {
  const current = router.currentRoute.value
  if (current.meta.public) return
  router.push({ name: 'login', query: { alasan: 'sesi-habis', ke: current.fullPath } })
})
setUnauthorizedHandler(() => session.expire())

app.mount('#app')
