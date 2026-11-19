// Sesi wawancara lama (POC), kini hanya DNA. Sesi TNA pindah ke rute `iv-session` (B6). Hapus folder ini saat B4 punya penggantinya.
import type { RouteRecordRaw } from 'vue-router'

export default [
  { path: '/m/:key(dna)/sessions/:id', name: 'interview', component: () => import('@/views/InterviewView.vue'), meta: { submoduleParam: true, title: 'Wawancara' } },
] satisfies RouteRecordRaw[]
