// B7 Tinjauan HR. Kontrak rute: docs/designs/b0-fondasi-ui.md bagian 5.3; spek layar: docs/designs/paritas-mockup/b7-tinjauan-web.md.
import type { RouteRecordRaw } from 'vue-router'

export default [
  // Mockup layar `review`: tinjauan temuan AI satu gap, dibuka dari detail gap (query = rujukan gap + tab asal).
  // Hanya HR (spek B7: endpoint tinjauan hanya HR; RV-3 diputuskan R1 23 Nov: tetap HR saja). Super Admin tidak:
  // aturan 24 Nov (core/rbac denyEmployeeContent) memblokirnya dari isi karyawan (R39-2).
  // `views` hanya HR: menu mockup tampilan Admin Tenant hanya users, jobs, cfg (b0-fondasi-ui.md bagian 5.2), jadi akun
  // tenant_admin + hr_admin yang membuka layar ini dari tampilan admin dipindah ke tampilan HR (review egm R39 P2-1).
  {
    path: '/tna/tinjauan', name: 'review', component: () => import('./TinjauanView.vue'),
    meta: { views: ['hr'], submodule: 'tna', flag: 'tna.review_workspace', roles: ['hr_admin'], menuKey: 'tna', title: 'Tinjauan HR' },
  },
  // Antrean lintas karyawan (PK-14, PR #16): mengubah teks, menolak, dan riwayat. Tanpa flag (pengaman wajib).
  // B0 5.3 aturan 2: anak menu `tna` mengulang `views` (P9 S-1); tautan dari tampilan Atasan pindah ke HR.
  {
    path: '/m/tna/review', name: 'tna-review', component: () => import('./AntreanView.vue'),
    meta: { views: ['hr'], submodule: 'tna', roles: ['hr_admin'], menuKey: 'tna', title: 'Tinjauan hasil AI' },
  },
] satisfies RouteRecordRaw[]
