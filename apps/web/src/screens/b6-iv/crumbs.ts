// Breadcrumb mockup "Training Needs › Wawancara akar masalah" untuk daftar dan sesi wawancara (P3, P8 R15/K-5).
// Induk menjadi tautan bila salah satu butir menu Training Needs tampil untuk tampilan aktif, termasuk butir peralihan
// karyawan/admin/super (triase P8 #1). Karyawan dengan Hasil saya menyala tidak punya menu itu, jadi induknya teks biasa.
import { menuContext, menuShows } from '@/shell/menu'
import type { useSessionStore } from '@/stores/session'

type Session = ReturnType<typeof useSessionStore>

export function ivCrumbs(session: Session) {
  const linked = menuShows('tna', menuContext(session))
  return [{ label: 'Training Needs', to: linked ? { name: 'tna' } : undefined }, { label: 'Wawancara akar masalah' }]
}
