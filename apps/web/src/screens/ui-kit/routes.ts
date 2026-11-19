// Halaman referensi komponen. Hanya ada bila build memakai VITE_UI_KIT=1 (e2e dan pengembangan);
// build produksi mendapat daftar kosong sehingga halaman dan datanya tidak ikut terkirim.
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = import.meta.env.VITE_UI_KIT === '1'
  ? [{ path: '/ui-kit', name: 'ui-kit', component: () => import('./UiKitView.vue'), meta: { public: true, title: 'Referensi komponen' } }]
  : []

export default routes
