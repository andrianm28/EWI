// B14 Learning Delivery (hanya HR, flag module.ld).
import type { RouteRecordRaw } from 'vue-router'

export default [
  { path: '/ld', name: 'ld', component: () => import('./LearningDeliveryView.vue'), meta: { views: ['hr'], flag: 'module.ld', menuKey: 'ld', title: 'Learning Delivery' } },
] satisfies RouteRecordRaw[]
