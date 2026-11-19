import { createRouter, createWebHistory, type RouteLocationNormalized, type RouteRecordRaw } from 'vue-router'
import { bindRoutes, useSessionStore } from '@/stores/session'
import type { SubmoduleKey } from '@/modules'
import { menuLabel } from '@/shell/menu'
import { VIEW_HOME, type ViewKey } from '@/shell/views'
import { testRoutes } from '@/screens/ui-kit/test-routes'

// Kontrak rute (docs/designs/b0-fondasi-ui.md bagian 5.3):
// tiap paket layar menambah src/screens/<paket>/routes.ts (export default RouteRecordRaw[]).
// Nama rute layar utama = kunci menu di src/shell/menu.ts, sehingga butir menunya muncul sendiri.
// Berkas ini tidak perlu diedit paket lain.
declare module 'vue-router' {
  interface RouteMeta {
    /** Tanpa login. */
    public?: boolean
    /** Judul di top bar dan judul tab. Default: label butir menu. */
    title?: string
    /** Tampilan yang boleh membuka rute ini. */
    views?: ViewKey[]
    /** Flag yang harus menyala. */
    flag?: string
    /** Submodul yang harus dimiliki dan menyala. */
    submodule?: SubmoduleKey
    /** Butir menu yang menyala saat rute ini terbuka (untuk layar anak). */
    menuKey?: string
  }
}

const screenModules = import.meta.glob<{ default: RouteRecordRaw[] }>('@/screens/*/routes.ts', { eager: true })

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true, title: 'Masuk' } },
  { path: '/masuk', name: 'email-link', component: () => import('@/views/EmailLinkView.vue'), meta: { public: true, title: 'Masuk' } },
  { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: 'Beranda' } },
  ...Object.keys(screenModules).sort().flatMap((k) => screenModules[k]!.default),
  ...(import.meta.env.VITE_UI_KIT === '1' ? testRoutes() : []),
]

// vue-router menimpa nama rute ganda tanpa peringatan. Dengan banyak paket paralel, lebih baik gagal keras:
// aplikasi tidak terpasang dan e2e PR yang membawa nama atau path ganda langsung merah.
function assertUnique(list: RouteRecordRaw[]) {
  const names = new Set<string>()
  const paths = new Set<string>()
  for (const r of list) {
    const name = String(r.name ?? '')
    if (!name) throw new Error(`Rute ${r.path} tidak punya nama`)
    if (names.has(name)) throw new Error(`Nama rute ganda: ${name}`)
    if (paths.has(r.path)) throw new Error(`Path rute ganda: ${r.path}`)
    names.add(name)
    paths.add(r.path)
  }
}
assertUnique(routes)

const router = createRouter({ history: createWebHistory(), routes })

bindRoutes((name) => router.hasRoute(name))

type Session = ReturnType<typeof useSessionStore>

function passesGates(meta: RouteLocationNormalized['meta'], params: RouteLocationNormalized['params'], session: Session): boolean {
  if (meta.flag && session.access?.flags[meta.flag] !== true) return false
  const key = (meta.submodule ?? params.key) as SubmoduleKey | undefined
  if (key && !session.canOpen(key)) return false
  return true
}

/**
 * Nama rute beranda sebuah tampilan: layar khususnya (dash, my, users, tenants) bila sudah terpasang dan
 * gerbangnya lolos, selain itu Beranda.
 */
export function homeFor(view: ViewKey, session: Session = useSessionStore()): string {
  const name = VIEW_HOME[view]
  if (!router.hasRoute(name)) return 'home'
  const target = router.resolve({ name })
  if (target.meta.views && !target.meta.views.includes(view)) return 'home'
  return passesGates(target.meta, target.params, session) ? name : 'home'
}

router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (to.meta.public) return true
  if (!session.isAuthenticated) return { name: 'login' }
  if (!session.access) {
    try { await session.loadAccess() } catch { session.logout(); return { name: 'login' } }
  }

  // Tautan langsung ke layar tampilan lain memindahkan tampilan bila akun memilikinya
  const allowed = to.meta.views
  if (allowed && !allowed.includes(session.activeView)) {
    const other = session.views.find((v) => allowed.includes(v))
    if (!other) return { name: homeFor(session.activeView, session) }
    session.setView(other)
  }

  const home = homeFor(session.activeView, session)
  if (to.name === 'home') return home === 'home' ? true : { name: home }
  if (!passesGates(to.meta, to.params, session)) return { name: home }
  return true
})

router.afterEach((to) => {
  const session = useSessionStore()
  const title = to.meta.title ?? menuLabel(to.meta.menuKey ?? String(to.name ?? ''), session.activeView)
  document.title = title ? `${title} · ELGOS` : 'ELGOS'
})

export default router
