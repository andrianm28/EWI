// C3 demo 25 Nov: jumlah temuan AI yang menunggu review untuk banner Training Needs (`/tna`) dan Kelola TNA.
// Sumbernya GET /tna/dashboard `reviewPending` = agregat yang sama dengan antrean /m/tna/review (counts.draft).
// Banner dulu hanya dimuat sekali dan galatnya ditelan, jadi bisa hilang (galat sesaat) atau basi (antrean berubah
// di tab/layar lain). Sekarang: satu kali coba ulang saat galat, dan dimuat ulang saat halaman kembali terlihat.
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { lna } from '@/api/lna'

/** `enabled` dibaca setiap kali memuat (peran aktif bisa berganti). `null` = belum/tidak bisa dimuat. */
export function useReviewPending(enabled: () => boolean): { count: Ref<number | null>; reload: () => Promise<void> } {
  const count = ref<number | null>(null)
  let seq = 0
  async function reload() {
    if (!enabled()) { count.value = null; return }
    const mine = ++seq
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const n = (await lna.tnaDashboard()).data.reviewPending ?? 0
        if (mine === seq) count.value = n
        return
      } catch { /* coba sekali lagi; hitungan lama dipertahankan bila tetap gagal */ }
    }
  }
  const onVisible = () => { if (document.visibilityState === 'visible') void reload() }
  const onFocus = () => { void reload() }
  onMounted(() => {
    void reload()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onFocus)
  })
  return { count, reload }
}
