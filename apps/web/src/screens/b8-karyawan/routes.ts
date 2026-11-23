// B8 Karyawan: "Hasil saya" (beranda tampilan karyawan) dan "Rencana belajar". Kontrak rute: docs/designs/b0-fondasi-ui.md
// bagian 5.3; spek: docs/designs/b8-karyawan.md "Layar web". Gerbang sama dengan API: /api/my di balik flag learner.home,
// /api/my/learning-plan butuh TNA aktif. Begitu `my` terbuka, homeFor('karyawan') mengarah ke sini dan "Karyawan (saya)"
// mulai ditawarkan ke akun multi-tampilan (K2).
import type { RouteRecordRaw } from 'vue-router'

export default [
  { path: '/my', name: 'my', component: () => import('./MyResultsView.vue'), meta: { views: ['karyawan'], flag: 'learner.home', title: 'Hasil saya' } },
  { path: '/li', name: 'li', component: () => import('./LearningPlanView.vue'), meta: { views: ['karyawan'], flag: 'learner.home', submodule: 'tna', title: 'Rencana belajar' } },
  // Antrean HR untuk permintaan data karyawan (keputusan user 23 Nov). Peran sama dengan requireRole(HR_ADMIN) di API (Admin ETA ikut lolos).
  { path: '/permintaan-data', name: 'dsr', component: () => import('./DataRequestsHrView.vue'), meta: { views: ['hr'], roles: ['hr_admin', 'eta_admin'], title: 'Permintaan data karyawan' } },
] satisfies RouteRecordRaw[]
