// B15 Learning Impact Measurement (HR dan atasan, flag module.lim, hanya paket full_suite).
import type { RouteRecordRaw } from 'vue-router'

export default [
  {
    path: '/lim', name: 'lim', component: () => import('./LearningImpactView.vue'),
    meta: { views: ['hr', 'atasan'], flag: 'module.lim', entitlement: 'full_suite', menuKey: 'lim', title: 'Learning Impact Measurement' },
  },
] satisfies RouteRecordRaw[]
