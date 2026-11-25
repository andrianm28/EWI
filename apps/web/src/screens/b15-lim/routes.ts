// B15 Learning Impact Measurement (HR dan atasan, flag module.lim, hanya paket full_suite).
import type { RouteRecordRaw } from 'vue-router'

export default [
  {
    path: '/lim', name: 'lim', component: () => import('./LearningImpactView.vue'),
    meta: { views: ['hr', 'atasan'], flag: 'module.lim', entitlement: 'full_suite', menuKey: 'lim', title: 'Learning Impact Measurement' },
  },
  // Tahap 3: karyawan (dan atasan untuk dirinya sendiri) menjalankan wawancara ulang AI setelah dijadwalkan HR
  {
    path: '/wawancara-ulang', name: 'wu', component: () => import('./ReinterviewView.vue'),
    meta: { views: ['karyawan', 'atasan'], flags: ['module.lim', 'lim.reinterview'], entitlement: 'full_suite', title: 'Wawancara ulang' },
  },
] satisfies RouteRecordRaw[]
