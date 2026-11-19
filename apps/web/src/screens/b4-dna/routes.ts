// B4 Developmental Needs (spek: docs/designs/b4-developmental-needs.md). Menggantikan screens/legacy-dna.
// Halaman POC lama (impor, gap per karyawan, mulai wawancara) tetap di /m/dna sebagai layar anak sampai
// penggantinya terpasang (impor: B11, hasil karyawan: B8).
import type { RouteRecordRaw } from 'vue-router'

export default [
  {
    path: '/dna', name: 'dna', component: () => import('./DevelopmentNeedsView.vue'),
    meta: { views: ['hr', 'atasan', 'super'], submodule: 'dna', menuKey: 'dna', title: 'Developmental Needs' },
  },
  {
    path: '/m/dna', name: 'dna-poc', component: () => import('@/views/DnaView.vue'),
    meta: { submodule: 'dna', menuKey: 'dna', title: 'Developmental Needs · data dan asesmen' },
  },
] satisfies RouteRecordRaw[]
