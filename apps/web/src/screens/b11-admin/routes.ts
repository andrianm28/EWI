// B11 Admin Tenant. Spek: docs/designs/b11-admin-tenant.md.
// Masa interim HR dicabut 24 Nov (keputusan user): hanya tampilan `admin` (tenant_admin) dan `super`.
// Menu laci memuat ketiga layar untuk tampilan `admin` (1:1 mockup); Super Admin membukanya lewat alamat dan berpindah
// antar layar lewat AdminLinks.vue.
import type { RouteRecordRaw } from 'vue-router'
import type { ViewKey } from '@/shell/views'

const views: ViewKey[] = ['admin', 'super']
const flag = 'admin.tenant'

export default [
  { path: '/admin/pengguna', name: 'users', component: () => import('./UsersView.vue'), meta: { views, flag, title: 'Pengguna & peran' } },
  { path: '/admin/jabatan', name: 'jobs', component: () => import('./JobsView.vue'), meta: { views, flag, title: 'Jabatan & kamus kompetensi' } },
  { path: '/admin/impor', name: 'cfg', component: () => import('./ConfigView.vue'), meta: { views, flag, title: 'Impor data & integrasi' } },
] satisfies RouteRecordRaw[]
