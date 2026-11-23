import { createRouter, createWebHistory, type RouteLocationNormalized, type RouteRecordRaw } from 'vue-router'
import { bindRoutes, useSessionStore, type Gates } from '@/stores/session'
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
    /** Modul 2–5: produk entitlement yang harus dimiliki tenant (mis. 'full_suite'), sama dengan pemeriksaan API-nya. */
    entitlement?: string
    /** Butir menu yang menyala saat rute ini terbuka (untuk layar anak). */
    menuKey?: string
    /** Peran asli (dari API) yang boleh membuka rute ini, mis. ['hr_admin', 'eta_admin']. Tanpa ini: semua peran. */
    roles?: string[]
    /** Rute lama `/m/:key`: param `key` adalah submodul yang harus terbuka. Paket baru memakai `submodule`. */
    submoduleParam?: boolean
  }
}

const screenModules = import.meta.glob<{ default: RouteRecordRaw[] }>('@/screens/*/routes.ts', { eager: true })

// Build uji (VITE_UI_KIT=1): rute uji menggantikan rute asli bernama sama, supaya test shell tetap menguji
// aturan menu dan tampilan tanpa bergantung pada layar paket (mis. `dash` asli dari B3).
const tests = import.meta.env.VITE_UI_KIT === '1' ? testRoutes() : []
const replaced = (r: RouteRecordRaw) => tests.some((t) => t.name === r.name || t.path === r.path)

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true, title: 'Masuk' } },
  { path: '/masuk', name: 'email-link', component: () => import('@/views/EmailLinkView.vue'), meta: { public: true, title: 'Masuk' } },
  { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: 'Beranda' } },
  ...Object.keys(screenModules).sort().flatMap((k) => screenModules[k]!.default).filter((r) => !replaced(r)),
  ...tests,
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
    // Kontrak 5.3: rute paket datar. Anak dan alias tidak ikut diperiksa, jadi ditolak supaya tidak lolos diam-diam.
    if (r.children?.length || r.alias) throw new Error(`Rute ${name} memakai children/alias; daftarkan sebagai rute datar`)
    names.add(name)
    paths.add(r.path)
  }
}
assertUnique(routes)

const router = createRouter({ history: createWebHistory(), routes })

type Session = Gates

function passesGates(meta: RouteLocationNormalized['meta'], params: RouteLocationNormalized['params'], session: Session): boolean {
  if (meta.flag && session.access?.flags[meta.flag] !== true) return false
  const key = (meta.submodule ?? (meta.submoduleParam ? params.key : undefined)) as SubmoduleKey | undefined
  if (key && !session.canOpen(key)) return false
  if (meta.roles && !session.roles.some((r) => meta.roles!.includes(r))) return false
  // Gagal-tertutup: API lama tanpa `products` berarti produk tidak diketahui, jadi modulnya disembunyikan
  if (meta.entitlement && !session.access?.products?.includes(meta.entitlement)) return false
  return true
}

/**
 * Rute terdaftar, boleh dibuka tampilan `view`, dan gerbangnya (flag, submodul, peran, entitlement) lolos. Dipakai menu dan
 * layar supaya tautan tidak memantul ke beranda saat diklik. Rute ber-param wajib tidak bisa diperiksa: false.
 */
export function routeOpen(name: string, view: ViewKey, session: Session = useSessionStore()): boolean {
  if (!router.hasRoute(name)) return false
  let target: ReturnType<typeof router.resolve>
  try { target = router.resolve({ name }) } catch { return false }
  if (target.meta.views && !target.meta.views.includes(view)) return false
  return passesGates(target.meta, target.params, session)
}

/**
 * Nama rute beranda sebuah tampilan: layar khususnya (dash, my, users, tenants) bila sudah terpasang dan
 * gerbangnya lolos, selain itu Beranda.
 */
export function homeFor(view: ViewKey, session: Session = useSessionStore()): string {
  const name = VIEW_HOME[view]
  return routeOpen(name, view, session) ? name : 'home'
}

// Satu sumber untuk "layar beranda tampilan ini sudah bisa dibuka": dipakai penjaga rute, daftar tampilan
// di store, dan butir peralihan di menu. Rute bersifat statis (tidak ada addRoute saat runtime).
bindRoutes((view, session) => homeFor(view, session) !== 'home')

router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (to.meta.public) return true
  if (!session.isAuthenticated) return { name: 'login' }
  if (!session.access) {
    try { await session.loadAccess() } catch { session.clear(); return { name: 'login', query: { alasan: 'sesi-habis', ke: to.fullPath } } }
  }

  // Tautan langsung ke layar tampilan lain memindahkan tampilan bila akun memilikinya
  const allowed = to.meta.views
  if (allowed && !allowed.includes(session.activeView)) {
    const other = session.views.find((v) => allowed.includes(v))
    if (!other) return { name: homeFor(session.activeView, session) }
    // Tampilan baru pindah hanya bila gerbang rutenya lolos; navigasi yang ditolak tidak mengubah tampilan
    if (!passesGates(to.meta, to.params, session)) return { name: homeFor(session.activeView, session) }
    // B2: ganti tampilan bisa memanggil API (ganti peran aktif); bila ditolak, tetap di tampilan sekarang
    try { await session.setView(other) } catch { return { name: homeFor(session.activeView, session) } }
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
