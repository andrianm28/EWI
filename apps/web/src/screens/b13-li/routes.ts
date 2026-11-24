// Paritas S4: judul top bar mengikuti TITLES mockup ("Learning Intervention · …").
// B13 Learning Intervention: Library, Program & Course, Permintaan & pengembangan (hanya HR, flag module.li, produk full_suite seperti API).
import type { RouteMeta, RouteRecordRaw } from 'vue-router'

const meta: RouteMeta = { views: ['hr'], flag: 'module.li', entitlement: 'full_suite' }

export default [
  { path: '/lib', name: 'lib', component: () => import('./LibraryView.vue'), meta: { ...meta, menuKey: 'lib', title: 'Learning Intervention · Library' } },
  { path: '/prog', name: 'prog', component: () => import('./ProgramView.vue'), meta: { ...meta, menuKey: 'prog', title: 'Learning Intervention · Program & Course' } },
  { path: '/req', name: 'req', component: () => import('./RequestsView.vue'), meta: { ...meta, menuKey: 'req', title: 'Learning Intervention · Permintaan & pengembangan' } },
  { path: '/req/draf/:id', name: 'req-draf', component: () => import('./DraftView.vue'), meta: { ...meta, menuKey: 'req', title: 'Pengembangan modul' } },
] satisfies RouteRecordRaw[]
