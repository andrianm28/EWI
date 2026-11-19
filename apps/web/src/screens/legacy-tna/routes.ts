// Halaman TNA lama (POC). Paket B5 menggantinya: hapus folder ini dan daftarkan rute `tna` yang baru.
import type { RouteRecordRaw } from 'vue-router'

export default [
  { path: '/m/tna', name: 'tna', component: () => import('@/views/TnaView.vue'), meta: { submodule: 'tna' } },
  // Tinjauan hasil AI oleh HR (PR #16). Paket B7 menggantinya.
  { path: '/m/tna/review', name: 'tna-review', component: () => import('@/views/ReviewView.vue'), meta: { submodule: 'tna', hrOnly: true, menuKey: 'tna', title: 'Tinjauan hasil AI' } },
] satisfies RouteRecordRaw[]
