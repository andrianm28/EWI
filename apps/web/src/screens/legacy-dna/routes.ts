// Halaman DNA lama (POC). Paket B4 menggantinya: hapus folder ini dan daftarkan rute `dna` yang baru.
import type { RouteRecordRaw } from 'vue-router'

export default [
  { path: '/m/dna', name: 'dna', component: () => import('@/views/DnaView.vue'), meta: { submodule: 'dna' } },
] satisfies RouteRecordRaw[]
