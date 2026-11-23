<script setup lang="ts">
// "Hasil saya": beranda tampilan karyawan (mockup KARYAWAN: BERANDA). Spek: docs/designs/b8-karyawan.md "Layar web".
// Semua data dari GET /api/my/results (hanya milik pengguna ini, berlaku untuk semua peran, K2).
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { formatWib, lna, type MyResults } from '@/api/lna'
import DataSaya from './DataSaya.vue'
import { UiButton, UiCard, UiDataTable, UiErrorSummary, UiNote, type UiColumn } from '@/ui'
import { competencyStatus, inviteAction, planSummary, scoreText } from './view'
import { routeOpen } from '@/router'
import { leaveIfDisabled } from './gate'
import { useSessionStore } from '@/stores/session'
import './b8.css'

const session = useSessionStore()
const res = ref<MyResults | null>(null)
const error = ref('')
const loading = ref(true)
const router = useRouter()

let seq = 0
async function load() {
  const mine = ++seq
  loading.value = true; error.value = ''
  try {
    const r = (await lna.myResults()).data
    if (mine === seq) res.value = r
  } catch (e) {
    if (mine !== seq) return
    // Flag dimatikan selama sesi: akses dimuat ulang lalu pindah ke beranda tampilan
    if (await leaveIfDisabled(e, router)) return
    error.value = e instanceof ApiError ? e.message : 'Hasil Anda tidak bisa dimuat'
  } finally { if (mine === seq) loading.value = false }
}
onMounted(load)

// Tarik persetujuan hanya bila ada yang bisa ditarik: undangan terbuka atau wawancara yang belum ditarik
// Bila hasil gagal dimuat, tombol tetap ada: hak subjek data tidak bergantung pada /my/results (API idempoten)
const canWithdraw = computed(() => !res.value || !!res.value.invitations?.length || !!res.value.interviews?.some((i) => !i.consentWithdrawnAt))

const position = computed(() => {
  const p = res.value?.person
  if (!p?.jobRoleName) return 'Jabatan Anda belum diatur HR.'
  return `Posisi: ${[p.jobRoleName, p.careerLevelName].filter(Boolean).join(' · ')}. Skor Anda dibandingkan target kompetensi peran.`
})

const columns: UiColumn[] = [
  { key: 'code', label: 'Kode', mono: true },
  { key: 'name', label: 'Kompetensi' },
  { key: 'score', label: 'Skor vs target' },
  { key: 'status', label: 'Status' },
]
const rows = computed(() => (res.value?.competencies?.items ?? []).map((c) => ({
  id: c.competencyId, code: c.code ?? '—', name: c.name, score: scoreText(c.score, c.required), status: c.status,
})))
</script>

<template>
  <AppShell>
    <h1 class="el-h1">Hasil saya</h1>
    <p v-if="loading && !res" class="el-muted" role="status">Memuat hasil Anda…</p>
    <template v-if="error">
      <UiErrorSummary :errors="[{ message: error }]" />
      <UiButton variant="outlined" size="sm" :disabled="loading" @click="load">Coba lagi</UiButton>
    </template>
    <template v-if="res">
      <p class="el-muted b8-sub">{{ position }}</p>
      <section v-if="res.invitations?.length" data-testid="my-invitations" aria-label="Undangan wawancara" class="b8-list b8-sub">
        <UiNote v-for="inv in res.invitations" :key="inv.sessionId" :tone="inviteAction(inv) ? 'info' : 'warning'">
          <!-- P8 R17 (K-7, MY-2): kalimat mockup dengan fokus wawancara aplikasi (KPI belum tercapai); satu catatan per undangan -->
          <b>Undangan wawancara:</b> ada 1 wawancara singkat tentang target kerja (KPI) Anda yang belum tercapai. Hasilnya dipakai untuk menyusun rencana belajar, bukan untuk penilaian kinerja.
          <template v-if="inv.inviteExpiresAt"> Tenggat {{ formatWib(inv.inviteExpiresAt) }} WIB.</template>
          <div class="b8-gap-s">
            <UiButton v-if="inviteAction(inv)" size="sm" :to="{ name: 'iv-session', params: { id: inv.sessionId } }">{{ inviteAction(inv) }}</UiButton>
            <span v-else>Undangan sudah berakhir. Minta HR memperpanjang undangan Anda.</span>
          </div>
        </UiNote>
      </section>
      <UiDataTable v-if="res.competencies" :columns="columns" :rows="rows" row-key="id" caption="Kompetensi Anda" caption-hidden
        empty-text="Kompetensi untuk jabatan Anda belum diatur.">
        <template #cell-status="{ row }">
          <!-- P8 R3 (K-3, MY-3): titik berwarna + teks seperti mockup `.state`/`.dot`; status tetap terbaca dari teks -->
          <span class="b8-state"><i :class="['b8-dot', `b8-dot--${competencyStatus(String(row.status)).tone}`]" aria-hidden="true" />{{ competencyStatus(String(row.status)).label }}</span>
        </template>
      </UiDataTable>
      <UiCard v-if="res.plan" data-testid="my-plan" class="b8-gap">
        <h2 class="b8-h2">Rencana belajar saya</h2>
        <p v-if="!res.plan.total" class="el-muted">Modul akan muncul di sini setelah HR menyetujui hasil wawancara.</p>
        <template v-else>
          <p>{{ planSummary(res.plan.byStatus) }}</p>
          <UiButton v-if="routeOpen('li', session.activeView)" variant="outlined" size="sm" :to="{ name: 'li' }">Lihat rencana belajar</UiButton>
        </template>
      </UiCard>
    </template>
    <DataSaya :can-withdraw="canWithdraw" @changed="load" />
  </AppShell>
</template>
