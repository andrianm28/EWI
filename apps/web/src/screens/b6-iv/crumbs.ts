// Breadcrumb mockup "Training Needs › Wawancara akar masalah" untuk daftar dan sesi wawancara (P3, P8 R15/K-5).
// Induk menjadi tautan hanya bila butir menu Training Needs tampil untuk tampilan aktif; karyawan (Hasil saya menyala)
// tidak punya menu itu, jadi induknya teks biasa.
import { routeOpen } from '@/router'
import { isVisible, MENU } from '@/shell/menu'
import type { useSessionStore } from '@/stores/session'

type Session = ReturnType<typeof useSessionStore>

export function ivCrumbs(session: Session) {
  const view = session.activeView
  const tna = MENU.find((i) => i.key === 'tna')
  const linked = !!tna && isVisible(tna, {
    view,
    routeOpen: (name) => routeOpen(name, view, session),
    homeReady: session.homeReady(view),
    flags: session.access?.flags ?? {},
    canOpen: session.canOpen,
  })
  return [{ label: 'Training Needs', to: linked ? { name: 'tna' } : undefined }, { label: 'Wawancara akar masalah' }]
}
