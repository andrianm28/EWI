// B11 Admin Tenant. Spek: docs/designs/b11-admin-tenant.md.
// SEMENTARA sampai B2 masuk: tampilan `hr` ikut diizinkan, karena pengelola tenant masih berperan hr_admin dan
// API memperlakukannya sebagai Admin Tenant. Butir menu baru muncul untuk tampilan `admin` (peran tenant_admin);
// sebelum itu HR membuka layar ini lewat alamatnya. Setelah B2, hapus 'hr' dari daftar di bawah.
import type { RouteRecordRaw } from 'vue-router'
import type { ViewKey } from '@/shell/views'

const views: ViewKey[] = ['admin', 'hr', 'super']
const flag = 'admin.tenant'

export default [
  { path: '/admin/pengguna', name: 'users', component: () => import('./UsersView.vue'), meta: { views, flag, title: 'Pengguna & peran' } },
  { path: '/admin/jabatan', name: 'jobs', component: () => import('./JobsView.vue'), meta: { views, flag, title: 'Jabatan & kamus kompetensi' } },
  { path: '/admin/impor', name: 'cfg', component: () => import('./ConfigView.vue'), meta: { views, flag, title: 'Impor data & integrasi' } },
] satisfies RouteRecordRaw[]
