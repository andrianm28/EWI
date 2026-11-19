import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import type { SubmoduleKey } from '@/modules'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/masuk', name: 'email-link', component: () => import('@/views/EmailLinkView.vue'), meta: { public: true } },
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    { path: '/m/dna', name: 'dna', component: () => import('@/views/DnaView.vue'), meta: { submodule: 'dna' } },
    { path: '/m/tna', name: 'tna', component: () => import('@/views/TnaView.vue'), meta: { submodule: 'tna' } },
    { path: '/m/:key(dna|tna)/sessions/:id', name: 'interview', component: () => import('@/views/InterviewView.vue') },
    { path: '/m/:key(cca|ina)', name: 'submodule', component: () => import('@/views/SubmoduleView.vue') },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (to.meta.public) return true
  if (!session.isAuthenticated) return { name: 'login' }
  if (!session.access) {
    try { await session.loadAccess() } catch { session.clear(); return { name: 'login', query: { alasan: 'sesi-habis', ke: to.fullPath } } }
  }
  const key = (to.meta.submodule ?? to.params.key) as SubmoduleKey | undefined
  if (key && !session.canOpen(key)) return { name: 'home' }
  return true
})

export default router
