// B12 konsol Super Admin. Spek: docs/designs/b12-super-admin.md. Gerbang sama dengan API: tampilan super + platform.console.
import type { RouteRecordRaw } from 'vue-router'
import type { ViewKey } from '@/shell/views'

const views: ViewKey[] = ['super']
const flag = 'platform.console'

export default [
  { path: '/tenants', name: 'tenants', component: () => import('./TenantsView.vue'), meta: { views, flag, title: 'Tenant' } },
  { path: '/platform', name: 'platform', component: () => import('./PlatformView.vue'), meta: { views, flag, title: 'Konfigurasi platform' } },
] satisfies RouteRecordRaw[]
