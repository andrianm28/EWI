// Tinjauan hasil AI oleh HR (PK-14, PR #16). Paket B7 menggantinya: hapus folder ini dan daftarkan rute `review`.
import type { RouteRecordRaw } from 'vue-router'

export default [
  {
    path: '/m/tna/review', name: 'tna-review', component: () => import('@/views/ReviewView.vue'),
    meta: { submodule: 'tna', roles: ['hr_admin', 'eta_admin'], menuKey: 'tna', title: 'Tinjauan hasil AI' },
  },
] satisfies RouteRecordRaw[]
