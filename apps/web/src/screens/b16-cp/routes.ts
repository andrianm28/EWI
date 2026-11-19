// B16 Career & Promotion (spek: docs/designs/b16-career-promotion.md). Di balik flag promotion.recommendation.
import type { RouteRecordRaw } from 'vue-router'

export default [
  {
    path: '/cp', name: 'cp', component: () => import('./CareerPromotionView.vue'),
    meta: { views: ['hr', 'atasan', 'super'], flag: 'promotion.recommendation', submodule: 'dna', menuKey: 'cp', title: 'Career & Promotion' },
  },
] satisfies RouteRecordRaw[]
