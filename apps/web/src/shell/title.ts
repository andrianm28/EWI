// Judul tab peramban "<judul layar> · ELGOS" (B0 bagian 6). Dipasang dari main.ts, bukan dari router, supaya
// router/index.ts tidak mengimpor shell/menu.ts (menu sudah mengimpor routeOpen dari router; P9 IR-3).
import type { Router } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { menuLabel } from './menu'

export function installTitle(router: Router) {
  router.afterEach((to) => {
    const session = useSessionStore()
    const title = to.meta.title ?? menuLabel(to.meta.menuKey ?? String(to.name ?? ''), session.activeView)
    document.title = title ? `${title} · ELGOS` : 'ELGOS'
  })
}
