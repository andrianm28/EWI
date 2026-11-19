// Tema terang/gelap. Tanpa pilihan pengguna mengikuti prefers-color-scheme; pilihan disimpan di localStorage.
import { ref } from 'vue'

export type Theme = 'light' | 'dark'
const KEY = 'elgos.theme'

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch { return null }
}

function system(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const theme = ref<Theme>('light')

function apply(t: Theme) {
  theme.value = t
  document.documentElement.dataset.theme = t
}

export function initTheme() {
  apply(stored() ?? system())
  // Ikuti perubahan tema sistem selama pengguna belum memilih sendiri
  if (typeof matchMedia === 'function') {
    // Opsional: Safari lama tidak punya addEventListener di MediaQueryList; tema awal tetap berlaku
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (!stored()) apply(system()) })
  }
}

export function toggleTheme() {
  const next: Theme = theme.value === 'dark' ? 'light' : 'dark'
  try { localStorage.setItem(KEY, next) } catch { /* abaikan: tema tetap berlaku untuk sesi ini */ }
  apply(next)
}
