// B4 Developmental Needs (spek: docs/designs/b4-developmental-needs.md). Menggantikan screens/legacy-dna.
// Halaman POC lama (impor, gap per karyawan, mulai wawancara) tetap di /m/dna (`dna-poc`) sampai penggantinya
// terpasang: B8 `my` untuk karyawan dan B11 `cfg` untuk impor. Pemilik rute ini menghapus `dna-poc` saat itu.
import type { RouteRecordRaw } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import type { ViewKey } from '@/shell/views'

const B4_ROLES = ['hr_admin', 'supervisor', 'eta_admin']
const B4_VIEWS: ViewKey[] = ['hr', 'atasan', 'super']

/**
 * R1/R2/R4 review egm: menu `dna` terbuka untuk semua tampilan (aturan B0 6), tetapi layar B4 hanya untuk
 * HR, atasan, dan Super Admin dengan flag `dna.development` menyala. Selain itu diarahkan ke halaman POC.
 */
export function b4Open(session: { hasFlag: (k: string) => boolean; roles: string[]; activeView: ViewKey }): boolean {
  return session.hasFlag('dna.development') && session.roles.some((r) => B4_ROLES.includes(r)) && B4_VIEWS.includes(session.activeView)
}

export default [
  {
    path: '/dna', name: 'dna', component: () => import('./DevelopmentNeedsView.vue'),
    meta: { views: ['hr', 'atasan', 'karyawan', 'admin', 'super'], submodule: 'dna', menuKey: 'dna', title: 'Developmental Needs' },
    beforeEnter: () => (b4Open(useSessionStore()) ? true : { name: 'dna-poc' }),
  },
  {
    path: '/m/dna', name: 'dna-poc', component: () => import('@/views/DnaView.vue'),
    meta: { submodule: 'dna', menuKey: 'dna', title: 'Developmental Needs · data dan asesmen' },
  },
] satisfies RouteRecordRaw[]
