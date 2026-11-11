import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import type { SubmoduleKey } from '@/modules'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    { path: '/m/:key(cca|dna|tna|ina)', name: 'submodule', component: () => import('@/views/SubmoduleView.vue') },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (to.meta.public) return true
  if (!session.isAuthenticated) return { name: 'login' }
  if (!session.access) {
    try { await session.loadAccess() } catch { session.logout(); return { name: 'login' } }
  }
  if (to.name === 'submodule' && !session.canOpen(to.params.key as SubmoduleKey)) return { name: 'home' }
  return true
})

export default router
