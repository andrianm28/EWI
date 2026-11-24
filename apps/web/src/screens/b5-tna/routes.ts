// B5 Training Needs. Kontrak rute: docs/designs/b0-fondasi-ui.md bagian 5.3; spek: docs/designs/b5-training-needs.md bagian 16.
import type { RouteRecordRaw } from 'vue-router'
import type { ViewKey } from '@/shell/views'

// Lima tampilan sampai B8 (my), B11, dan B12 memasang beranda masing-masing; otorisasi data tetap di API.
const ALL_VIEWS: ViewKey[] = ['hr', 'atasan', 'karyawan', 'admin', 'super']

export default [
  // Tanpa meta.flag: fitur TNA lama harus tetap terbuka saat papan gap mati; flag papan diperiksa di layar.
  { path: '/tna', name: 'tna', component: () => import('./TnaScreen.vue'), meta: { views: ALL_VIEWS, submodule: 'tna', menuKey: 'tna', title: 'Training Needs' } },
  // Rute anak mengulang gerbang induk; tanpa karyawan karena API menolak learner (R1)
  {
    path: '/tna/gap', name: 'tna-gap', component: () => import('./TnaGapView.vue'),
    meta: { views: ['hr', 'atasan', 'admin', 'super'], submodule: 'tna', flag: 'tna.gap_board', roles: ['hr_admin', 'eta_admin', 'supervisor'], menuKey: 'tna', title: 'Detail gap' },
  },
  // Paritas P5 (TN-2): pengelolaan TNA lama saat papan gap menyala. Gerbang sama dengan `tna` (B0 5.3 aturan 2).
  { path: '/tna/kelola', name: 'tna-kelola', component: () => import('./TnaKelolaView.vue'), meta: { views: ALL_VIEWS, submodule: 'tna', menuKey: 'tna', title: 'Kelola TNA' } },
  { path: '/m/tna', name: 'tna-lama', redirect: { name: 'tna' } },
] satisfies RouteRecordRaw[]
