// B10 Core Competencies. Kontrak rute: docs/designs/b0-fondasi-ui.md bagian 5.3; spek: docs/designs/b10-core-competencies.md bagian 13.
import type { RouteRecordRaw } from 'vue-router'

export default [
  { path: '/cc', name: 'cc', component: () => import('./CoreCompetenciesView.vue'), meta: { views: ['hr'], submodule: 'cca' } },
  // Alamat halaman ringkas CCA lama (kartu Beranda masih menautkannya)
  { path: '/m/cca', name: 'cc-lama', redirect: { name: 'cc' } },
  // Atasan: "Wawancara AI"; karyawan: "Wawancara visi & nilai". Flag cca.interview diperiksa di layar supaya
  // butir menu tidak mengalihkan diam-diam ke beranda saat flag mati.
  { path: '/aiv', name: 'aiv', component: () => import('./InterviewAssignmentView.vue'), meta: { views: ['atasan', 'karyawan'], submodule: 'cca' } },
] satisfies RouteRecordRaw[]
