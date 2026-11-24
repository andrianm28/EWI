// Kapan papan gap B5 tampil. Dipakai `/tna` (papan atau pengelolaan) dan `/tna/kelola` (dialihkan ke `/tna` bila papan tidak tampil).
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session'
import { BOARD_ROLES } from './api'

/** Papan hanya untuk peran yang diterima API (R1) dan bukan tampilan karyawan. */
export function useShowBoard() {
  const session = useSessionStore()
  return computed(() => session.hasFlag('tna.gap_board') && session.activeView !== 'karyawan' && session.hasAnyRole(BOARD_ROLES))
}
