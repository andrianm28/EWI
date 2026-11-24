// B17 Asisten ELGOS: state panel. ShellExtra dipasang ulang setiap pindah halaman (B0 5.3), jadi percakapan,
// draf, dan permintaan berjalan disimpan di sini. Spek: docs/designs/paritas-mockup/b17-asisten-web.md
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ApiError } from '@/api/client'
import { assistant, type AssistantIntro, type AssistantView } from '@/api/assistant'
import { useSessionStore } from '@/stores/session'

export interface Turn {
  /** Kunci stabil untuk v-for, supaya wilayah role="log" tidak membacakan ulang riwayat saat dipangkas */
  id: number
  who: 'ai' | 'me'
  text: string
  action?: { page: string; label: string } | null
}

const MAX_TURNS = 40
const FALLBACK_ERROR = 'Asisten sedang tidak bisa menjawab. Coba lagi nanti.'
/** Batas tunggu jawaban; setelahnya permintaan dihentikan dan pesan cadangan tampil (keputusan 9) */
const ASK_TIMEOUT_MS = 30_000

/** Pesan API hanya dipakai bila server mengirim galat terstruktur; selain itu (HTML proxy, jaringan) pesan cadangan */
function errorText(e: unknown) {
  return e instanceof ApiError && e.code !== 'ERROR' ? e.message : FALLBACK_ERROR
}
/**
 * Server menolak asisten untuk tampilan atau akun ini: 403 VIEW_FORBIDDEN (tampilan tidak boleh untuk peran) atau
 * 403 EMPLOYEE_CONTENT_PRIVATE (aturan 24 Nov, core/rbac denyEmployeeContent: Super Admin diblokir dari isi karyawan).
 * Keduanya diperlakukan sama: tombol dan panel asisten disembunyikan.
 */
const DENIED_CODES: readonly string[] = ['VIEW_FORBIDDEN', 'EMPLOYEE_CONTENT_PRIVATE']
const isViewForbidden = (e: unknown) => e instanceof ApiError && e.status === 403 && DENIED_CODES.includes(e.code)

export const useAsistenStore = defineStore('b17-asisten', () => {
  const open = ref(false)
  const turns = ref<Turn[]>([])
  const draft = ref('')
  const intro = ref<AssistantIntro | null>(null)
  const pending = ref(false)
  /** Kembalikan fokus ke input saat panel dipasang ulang (setelah tombol "Buka" menavigasi). */
  const refocus = ref(false)
  /** Server menolak asisten (403 VIEW_FORBIDDEN atau EMPLOYEE_CONTENT_PRIVATE): tombol asisten disembunyikan */
  const unavailable = ref(false)
  // Kunci {tenant}|{user.id}|{tampilan}: berubah saat ganti tampilan, keluar, atau akun lain
  let key = ''
  let seq = 0
  /** P9 CD-12: naik di setiap pertanyaan dan reset; jawaban untuk nomor lama dibuang walau kunci kembali sama. */
  let askSeq = 0
  let introLoading: Promise<void> | null = null

  function reset() {
    askSeq++
    open.value = false
    turns.value = []
    intro.value = null
    pending.value = false
    draft.value = ''
    unavailable.value = false
    introLoading = null
  }
  // Keluar, sesi habis, atau dicabut: kosongkan dari sumbernya, tidak bergantung pada panel yang sedang terpasang
  useSessionStore().$onAction(({ name, after }) => {
    if (name === 'clear') after(() => { reset(); key = '' })
  })

  /**
   * Kosongkan percakapan bila kunci berubah. Respons yang masih berjalan untuk kunci lama dibuang.
   * Ganti tampilan membiarkan panel terbuka (mockup); keluar atau akun lain menutupnya.
   */
  function bind(next: string) {
    if (next === key) return
    const sameAccount = next.split('|').slice(0, 2).join('|') === key.split('|').slice(0, 2).join('|')
    const wasOpen = open.value
    reset()
    if (sameAccount) open.value = wasOpen
    key = next
  }

  /** Dimuat sekali per kunci (permintaan yang sedang berjalan dipakai ulang). */
  function loadIntro(view: AssistantView) {
    if (intro.value || unavailable.value) return Promise.resolve()
    if (introLoading) return introLoading
    const k = key
    const p = assistant.intro(view).then((res) => {
      if (k === key) intro.value = res.data
    }).catch((e) => {
      // Salam dan catatan kaki bawaan tetap tampil; chip saran kosong. Tampilan ditolak: sembunyikan asisten.
      if (k === key && isViewForbidden(e)) { unavailable.value = true; open.value = false }
    }).finally(() => {
      if (introLoading === p) introLoading = null
    })
    introLoading = p
    return p
  }

  function push(turn: Omit<Turn, 'id'>) {
    turns.value = [...turns.value, { ...turn, id: ++seq }].slice(-MAX_TURNS)
  }

  async function ask(question: string, view: AssistantView) {
    const q = question.trim()
    if (!q || pending.value) return
    const mine = ++askSeq
    const stale = () => mine !== askSeq
    push({ who: 'me', text: q })
    draft.value = ''
    pending.value = true
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), ASK_TIMEOUT_MS)
    try {
      const res = await assistant.ask(q, view, ctl.signal)
      if (stale()) return
      push({ who: 'ai', text: res.data.answer, action: res.data.action })
    } catch (e) {
      if (stale()) return
      if (isViewForbidden(e)) unavailable.value = true
      push({ who: 'ai', text: errorText(e) })
      // Draf dikembalikan supaya bisa dikirim ulang (kecuali pengguna sudah mengetik yang baru)
      if (!draft.value) draft.value = q
    } finally {
      clearTimeout(timer)
      if (!stale()) pending.value = false
    }
  }

  return { open, turns, draft, intro, pending, refocus, unavailable, bind, loadIntro, ask }
})
