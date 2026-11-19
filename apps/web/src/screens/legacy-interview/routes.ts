// Sesi wawancara lama (POC). Paket B6 menggantinya: hapus folder ini.
import type { RouteRecordRaw } from 'vue-router'

export default [
  { path: '/m/:key(dna|tna)/sessions/:id', name: 'interview', component: () => import('@/views/InterviewView.vue'), meta: { title: 'Wawancara' } },
] satisfies RouteRecordRaw[]
