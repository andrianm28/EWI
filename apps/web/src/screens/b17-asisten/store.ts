// B17 Asisten ELGOS: state panel. ShellExtra dipasang ulang setiap pindah halaman (B0 5.3), jadi percakapan,
// draf, dan permintaan berjalan disimpan di sini. Spek: docs/designs/paritas-mockup/b17-asisten-web.md
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ApiError } from '@/api/client'
import { assistant, type AssistantIntro, type AssistantView } from '@/api/assistant'

export interface Turn {
  who: 'ai' | 'me'
  text: string
  action?: { page: string; label: string } | null
}

const MAX_TURNS = 40
const FALLBACK_ERROR = 'Asisten sedang tidak bisa menjawab. Coba lagi nanti.'

export const useAsistenStore = defineStore('b17-asisten', () => {
  const open = ref(false)
  const turns = ref<Turn[]>([])
  const draft = ref('')
  const intro = ref<AssistantIntro | null>(null)
  const pending = ref(false)
  /** Kembalikan fokus ke input saat panel dipasang ulang (setelah tombol "Buka" menavigasi). */
  const refocus = ref(false)
  // Kunci {user.id}|{tampilan}: berubah saat ganti tampilan, keluar, atau akun lain
  let key = ''

  /** Kosongkan percakapan bila kunci berubah. Respons yang masih berjalan untuk kunci lama dibuang. */
  function bind(next: string) {
    if (next === key) return
    key = next
    turns.value = []
    intro.value = null
    pending.value = false
    draft.value = ''
  }

  async function loadIntro(view: AssistantView) {
    if (intro.value) return
    const k = key
    try {
      const res = await assistant.intro(view)
      if (k === key) intro.value = res.data
    } catch {
      // Salam dan catatan kaki bawaan tetap tampil; chip saran kosong
    }
  }

  async function ask(question: string, view: AssistantView) {
    const q = question.trim()
    if (!q || pending.value) return
    const k = key
    turns.value = [...turns.value, { who: 'me' as const, text: q }].slice(-MAX_TURNS)
    draft.value = ''
    pending.value = true
    try {
      const res = await assistant.ask(q, view)
      if (k !== key) return
      turns.value = [...turns.value, { who: 'ai' as const, text: res.data.answer, action: res.data.action }].slice(-MAX_TURNS)
    } catch (e) {
      if (k !== key) return
      turns.value = [...turns.value, { who: 'ai' as const, text: e instanceof ApiError ? e.message : FALLBACK_ERROR }].slice(-MAX_TURNS)
      // Draf dikembalikan supaya bisa dikirim ulang (kecuali pengguna sudah mengetik yang baru)
      if (!draft.value) draft.value = q
    } finally {
      if (k === key) pending.value = false
    }
  }

  return { open, turns, draft, intro, pending, refocus, bind, loadIntro, ask }
})
