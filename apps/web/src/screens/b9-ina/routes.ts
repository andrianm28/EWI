// B9 Improvement Needs. Spek: docs/designs/b9-improvement-needs.md. Menggantikan screens/legacy-ina.
import type { RouteRecordRaw } from 'vue-router'

export default [
  // alamat lama dari Beranda peralihan
  { path: '/m/ina', name: 'ina-lama', redirect: { name: 'ina' } },
  { path: '/ina', name: 'ina', component: () => import('./ImprovementNeedsView.vue'), meta: { submodule: 'ina', flag: 'ina.dashboard', views: ['hr', 'atasan', 'super'], title: 'Improvement Needs' } },
  // Pemilik tindakan (peran apa pun) menjawab verifikasi AI. Tanpa `views`: karyawan pun bisa membukanya.
  { path: '/ina/verifikasi/:id?', name: 'ina-verifikasi', component: () => import('./ActionVerificationView.vue'), meta: { submodule: 'ina', flag: 'ina.ai_verification', title: 'Verifikasi tindakan perbaikan' } },
] satisfies RouteRecordRaw[]
