// B3: Dashboard utama (HR) dan Dashboard tim (atasan). Spek: docs/designs/b3-dashboard.md.
// Di balik flag dashboard.main (default mati): selama mati, HR dan atasan tetap mendarat di Beranda lama.
import type { RouteRecordRaw } from 'vue-router'

export default [
  {
    path: '/dashboard', name: 'dash', component: () => import('./DashboardView.vue'),
    // pimpinan dan role_leader memakai tampilan Atasan tetapi API menolak mereka, jadi rutenya dibatasi peran asli
    meta: { views: ['hr', 'atasan'], flag: 'dashboard.main', roles: ['hr_admin', 'eta_admin', 'supervisor'] },
  },
] satisfies RouteRecordRaw[]
