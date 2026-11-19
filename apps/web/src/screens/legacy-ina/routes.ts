// Halaman ringkas INA lama. Paket B9 menggantinya: hapus folder ini dan daftarkan rute `ina`.
import type { RouteRecordRaw } from 'vue-router'

export default [
  { path: '/m/:key(ina)', name: 'legacy-ina', component: () => import('@/views/SubmoduleView.vue'), meta: { submoduleParam: true, title: 'Improvement Needs Analysis' } },
] satisfies RouteRecordRaw[]
