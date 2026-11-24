// B5 Training Needs. Kontrak rute: docs/designs/b0-fondasi-ui.md bagian 5.3; spek: docs/designs/b5-training-needs.md bagian 16.
import type { RouteRecordRaw } from 'vue-router'
import type { ViewKey } from '@/shell/views'

// Semua tampilan kecuali Super Admin: aturan 24 Nov (core/rbac denyEmployeeContent) memblokirnya dari isi karyawan (R39-2).
// Otorisasi data tetap di API.
const TNA_VIEWS: ViewKey[] = ['hr', 'atasan', 'karyawan', 'admin']

export default [
  // Tanpa meta.flag: fitur TNA lama harus tetap terbuka saat papan gap mati; flag papan diperiksa di layar.
  { path: '/tna', name: 'tna', component: () => import('./TnaScreen.vue'), meta: { views: TNA_VIEWS, submodule: 'tna', menuKey: 'tna', title: 'Training Needs' } },
  // Rute anak mengulang gerbang induk; tanpa karyawan karena API menolak learner (R1)
  {
    path: '/tna/gap', name: 'tna-gap', component: () => import('./TnaGapView.vue'),
    meta: { views: ['hr', 'atasan', 'admin'], submodule: 'tna', flag: 'tna.gap_board', roles: ['hr_admin', 'supervisor'], menuKey: 'tna', title: 'Detail gap' },
  },
  // Paritas P5 (TN-2): pengelolaan TNA lama saat papan gap menyala. Gerbang sama dengan `tna` (B0 5.3 aturan 2).
  { path: '/tna/kelola', name: 'tna-kelola', component: () => import('./TnaKelolaView.vue'), meta: { views: TNA_VIEWS, submodule: 'tna', menuKey: 'tna', title: 'Kelola TNA' } },
  { path: '/m/tna', name: 'tna-lama', redirect: { name: 'tna' } },
] satisfies RouteRecordRaw[]
