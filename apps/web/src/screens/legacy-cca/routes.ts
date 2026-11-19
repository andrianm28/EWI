// Halaman ringkas CCA lama. Paket B10 menggantinya: hapus folder ini dan daftarkan rute `cc`.
import type { RouteRecordRaw } from 'vue-router'

export default [
  { path: '/m/:key(cca)', name: 'legacy-cca', component: () => import('@/views/SubmoduleView.vue'), meta: { title: 'Core Competency Analysis' } },
] satisfies RouteRecordRaw[]
