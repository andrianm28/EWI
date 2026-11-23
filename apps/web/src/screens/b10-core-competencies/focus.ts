// Triase P8 #4: setelah dialog tertutup, fokus kembali ke tombol pembukanya (perilaku <dialog>). Bila tombol itu hilang
// karena daftar dimuat ulang (baris sudah ditugaskan), fokus jatuh ke <body>; pindahkan ke pemberitahuan hasil.
import { nextTick } from 'vue'

export async function focusIfLost(target: () => HTMLElement | null | undefined) {
  await nextTick()
  const active = document.activeElement
  if (!active || active === document.body || !active.isConnected) target()?.focus()
}
