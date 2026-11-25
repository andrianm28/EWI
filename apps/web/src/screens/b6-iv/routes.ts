// B6 Wawancara akar masalah. Kontrak rute: docs/designs/b0-fondasi-ui.md bagian 5.3; spek: docs/designs/b6-wawancara-akar-masalah.md bagian 15.
import type { RouteRecordRaw } from 'vue-router'
import type { ViewKey } from '@/shell/views'

// Lima tampilan sampai B8, B11, B12 memasang beranda masing-masing; otorisasi data tetap di API (HR/atasan juga karyawan, K2).
const ALL_VIEWS: ViewKey[] = ['hr', 'atasan', 'karyawan', 'admin', 'super']

export default [
  // Tanpa meta.flag: alur lama tanpa langkah ringkasan tetap berjalan saat tna.interview_summary mati
  { path: '/iv', name: 'iv', component: () => import('./IvListView.vue'), meta: { views: ALL_VIEWS, submodule: 'tna', menuKey: 'iv', title: 'Wawancara akar masalah' } },
  { path: '/iv/:id', name: 'iv-session', component: () => import('./IvSessionView.vue'), meta: { views: ALL_VIEWS, submodule: 'tna', menuKey: 'iv', title: 'Wawancara akar masalah' } },
  // Alamat sesi TNA lama (tautan email undangan dan pengingat)
  { path: '/m/tna/sessions/:id', name: 'iv-lama', redirect: (to) => ({ name: 'iv-session', params: { id: to.params.id } }) },
] satisfies RouteRecordRaw[]
