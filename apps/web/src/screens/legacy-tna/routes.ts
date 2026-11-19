// Halaman TNA lama (POC). Paket B5 menggantinya: hapus folder ini dan daftarkan rute `tna` yang baru.
import type { RouteRecordRaw } from 'vue-router'

export default [
  { path: '/m/tna', name: 'tna', component: () => import('@/views/TnaView.vue'), meta: { submodule: 'tna' } },
] satisfies RouteRecordRaw[]
