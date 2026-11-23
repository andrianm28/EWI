// B11 Admin Tenant. Spek: docs/designs/b11-admin-tenant.md.
// Tampilan `hr` dan `super` masih diizinkan karena sebagian tenant dikelola akun hr_admin, yang oleh API diperlakukan
// sebagai Admin Tenant. Menu laci hanya memuat ketiga layar ini untuk tampilan `admin` (1:1 mockup); HR dan Super Admin
// membukanya lewat alamat, lalu berpindah antar layar lewat AdminLinks.vue. Setelah semua tenant memakai peran
// tenant_admin, hapus 'hr' dari daftar di bawah dan AdminLinks.vue.
import type { RouteRecordRaw } from 'vue-router'
import type { ViewKey } from '@/shell/views'

const views: ViewKey[] = ['admin', 'hr', 'super']
const flag = 'admin.tenant'

export default [
  { path: '/admin/pengguna', name: 'users', component: () => import('./UsersView.vue'), meta: { views, flag, title: 'Pengguna & peran' } },
  { path: '/admin/jabatan', name: 'jobs', component: () => import('./JobsView.vue'), meta: { views, flag, title: 'Jabatan & kamus kompetensi' } },
  { path: '/admin/impor', name: 'cfg', component: () => import('./ConfigView.vue'), meta: { views, flag, title: 'Impor data & integrasi' } },
] satisfies RouteRecordRaw[]
