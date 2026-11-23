// B7 Tinjauan HR. Kontrak rute: docs/designs/b0-fondasi-ui.md bagian 5.3; spek layar: docs/designs/paritas-mockup/b7-tinjauan-web.md.
import type { RouteRecordRaw } from 'vue-router'

export default [
  // Mockup layar `review`: tinjauan temuan AI satu gap, dibuka dari detail gap (query = rujukan gap + tab asal).
  // Hanya HR dan Admin ETA (spek B7: endpoint tinjauan hanya HR; akses atasan RV-3 menunggu keputusan).
  {
    path: '/tna/tinjauan', name: 'review', component: () => import('./TinjauanView.vue'),
    meta: { views: ['hr', 'admin', 'super'], submodule: 'tna', flag: 'tna.review_workspace', roles: ['hr_admin', 'eta_admin'], menuKey: 'tna', title: 'Tinjauan HR' },
  },
  // Antrean lintas karyawan (PK-14, PR #16): mengubah teks, menolak, dan riwayat. Tanpa flag (pengaman wajib).
  {
    path: '/m/tna/review', name: 'tna-review', component: () => import('./AntreanView.vue'),
    meta: { submodule: 'tna', roles: ['hr_admin', 'eta_admin'], menuKey: 'tna', title: 'Tinjauan hasil AI' },
  },
] satisfies RouteRecordRaw[]
