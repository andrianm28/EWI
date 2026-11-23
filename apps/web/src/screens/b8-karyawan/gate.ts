// Flag atau submodul dimatikan selama sesi (API menjawab 403 FEATURE_DISABLED): akses dimuat ulang lalu pindah ke
// beranda tampilan, supaya layar tidak tertinggal dengan galat. Dipakai Hasil saya dan Rencana belajar.
import type { Router } from 'vue-router'
import { ApiError } from '@/api/client'
import { homeFor } from '@/router'
import { useSessionStore } from '@/stores/session'

export async function leaveIfDisabled(e: unknown, router: Router): Promise<boolean> {
  if (!(e instanceof ApiError && e.code === 'FEATURE_DISABLED')) return false
  const session = useSessionStore()
  await session.loadAccess().catch(() => {})
  const before = router.currentRoute.value.name
  await router.replace({ name: homeFor(session.activeView) })
  // Tidak berpindah (akses lama masih menyatakan terbuka): biarkan layar menampilkan galat dan "Coba lagi"
  return router.currentRoute.value.name !== before
}
