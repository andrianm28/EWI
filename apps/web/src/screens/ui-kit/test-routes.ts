// Rute uji untuk e2e shell (hanya build VITE_UI_KIT=1). Test menulis daftar rute ke localStorage sebelum
// halaman dimuat, sehingga aturan menu, flag, dan ganti tampilan bisa diuji tanpa menunggu layar paket lain.
import type { RouteRecordRaw } from 'vue-router'
import type { ViewKey } from '@/shell/views'
import type { SubmoduleKey } from '@/modules'

interface TestRoute { name: string; path?: string; views?: ViewKey[]; flag?: string; submodule?: SubmoduleKey; menuKey?: string }

export function testRoutes(): RouteRecordRaw[] {
  let list: TestRoute[] = []
  try { list = JSON.parse(localStorage.getItem('elgos.test-routes') ?? '[]') } catch { list = [] }
  if (!Array.isArray(list)) return []
  return list.map((t) => ({
    path: t.path ?? `/uji/${t.name}`,
    name: t.name,
    component: () => import('./TestScreen.vue'),
    meta: { views: t.views, flag: t.flag, submodule: t.submodule, menuKey: t.menuKey },
  }))
}
