<script setup lang="ts">
// Dashboard utama HR / Dashboard tim atasan (mockup Pak Eji, layar `dash`). Angka dari GET /api/dashboard.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { UiButton, UiCard, UiChip, UiKpiCard, UiNote, UiProgressBar } from '@/ui'
import { ApiError } from '@/api/client'
import { routeOpen } from '@/router'
import { useSessionStore } from '@/stores/session'
import { fetchDashboard, type ActionKey, type DashboardSummary } from '@/api/dashboard'

const session = useSessionStore()
const data = ref<DashboardSummary | null>(null)
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    data.value = await fetchDashboard(session.token)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Periksa koneksi lalu muat ulang halaman.'
  } finally {
    loading.value = false
  }
})

// Label dan kartu mengikuti cakupan data yang benar-benar dikirim API (peran utama), bukan tampilan aktif:
// pengguna multi-peran di tampilan Atasan bisa saja menerima data seluruh tenant (spek B3 bagian 4).
const isTeam = computed(() => (data.value ? data.value.scope === 'team' : session.activeView === 'atasan'))
const DASH = '–'
const OFF = 'Modul belum aktif'
const num = (n: number | null) => (n == null ? DASH : n.toLocaleString('id-ID'))

// Definisi angka: spek bagian 3.3. null = modul sumber tertutup, kecuali disebut lain.
const kpis = computed(() => {
  const d = data.value
  if (!d) return []
  const k = d.kpis
  const tnaOn = k.okrGaps != null
  const gapNote = tnaOn ? `${k.competencyGaps == null ? '' : 'dan '}${k.okrGaps} target KPI/OKR meleset` : (k.competencyGaps == null ? OFF : 'kompetensi di bawah standar jabatan')
  const cards = [
    { label: 'Pegawai dianalisis', value: num(k.employeesAnalyzed), note: k.employeesAnalyzed == null ? OFF : `dari ${num(d.people)} pegawai` },
    { label: 'Gap kompetensi aktif', value: num(k.competencyGaps), note: gapNote },
  ]
  if (isTeam.value) return cards
  const ag = k.aiHrAgreement
  const days = k.analysisDays
  return [
    ...cards,
    {
      label: 'Kesepakatan AI–HR',
      value: ag?.percent == null ? DASH : `${ag.percent}%`,
      note: !ag ? OFF : ag.percent == null ? 'Belum ada temuan yang ditinjau HR' : `target pilot ≥ ${ag.targetPercent}% · pemantauan tinjauan HR`,
    },
    {
      label: 'Waktu analisis',
      value: days ? `${days.median} hari` : DASH,
      note: days ? `median ${days.sessions} sesi · target ≤ ${days.targetDays} hari` : tnaOn ? 'Belum ada sesi yang selesai ditinjau' : OFF,
    },
  ]
})

// Nama dan keterangan modul dari mockup; tombol Buka menuju layar pertama modul yang bisa dibuka.
// Keterangan dari mockup final (Main.dc.html, daftar modules). Nama vendor modul 2 tidak ditulis: datang dari
// konfigurasi tenant (K4), jadi diganti "permintaan modul baru".
const MODULE_INFO: Record<string, { name: string; desc: string; routes: string[] }> = {
  lna: { name: 'Learning Needs Analysis', desc: 'Core Competencies, Developmental, Training, dan Improvement Needs', routes: ['dna', 'tna', 'cc', 'ina'] },
  li: { name: 'Learning Intervention', desc: 'Library modul, program, dan permintaan modul baru', routes: ['lib', 'prog', 'req'] },
  ld: { name: 'Learning Delivery', desc: 'Pelaksanaan lewat EliteMentor/LMS', routes: ['ld'] },
  lim: { name: 'Learning Impact Measurement', desc: 'Penutupan gap dan OKR', routes: ['lim'] },
  cp: { name: 'Career & Promotion', desc: 'Kesiapan berbasis bukti', routes: ['cp'] },
}
const pct = (n: number) => Math.round(n * 100)
const paretoNote = computed(() => {
  const p = data.value?.pareto
  return p && p.total ? `${p.hotCount} dari ${p.total} kebutuhan menyumbang sekitar 80% total. Mulai dari yang ditandai Prioritas.` : ''
})

// Urutan, teks, dan tujuan butir "Perlu tindakan" (spek bagian 3.5). Tombol hanya muncul bila layarnya bisa dibuka.
const ACTIONS: { key: ActionKey; text: (n: number) => string; desc: string; cta: string; routes: string[] }[] = [
  { key: 'review_pending', text: (n) => `${n} temuan menunggu tinjauan HR`, desc: 'Temuan belum terlihat atasan dan karyawan sebelum ditinjau.', cta: 'Tinjau', routes: ['tna-review'] }, // antrean seluruh tenant; layar `review` per gap butuh rujukan gap (paritas B7 web)
  { key: 'interviews_open', text: (n) => `${n} wawancara akar masalah belum selesai`, desc: 'Terjadwal atau sedang berjalan.', cta: 'Lihat', routes: ['tna'] },
  { key: 'plan_needs_module', text: (n) => `${n} rencana belajar butuh modul baru`, desc: 'Belum ada materi di katalog yang cocok.', cta: 'Lihat', routes: ['tna'] },
  { key: 'non_training_findings', text: (n) => `${n} temuan Improvement Needs (di luar pelatihan)`, desc: 'Untuk diketahui: ditindaklanjuti di luar program belajar.', cta: 'Lihat', routes: ['ina'] },
  { key: 'competencies_unapproved', text: (n) => `${n} kompetensi di kamus belum disetujui`, desc: 'Kamus kompetensi menunggu persetujuan HR.', cta: 'Lihat', routes: ['dna'] },
]
// Urutan butir mengikuti API (spek 3.5); kunci yang belum dikenal layar dilewati
const actions = computed(() => (data.value?.actions ?? []).flatMap((item) => {
  const a = ACTIONS.find((x) => x.key === item.key)
  if (!a) return []
  return [{ key: a.key, text: a.text(item.count), desc: a.desc, cta: a.cta, to: a.routes.find((r) => routeOpen(r, session.activeView, session)) }]
}))

// D1 paritas: baris kompetensi membuka Detail gap bila layarnya bisa dibuka; temuan tanpa kompetensi tetap teks
const gapOpen = computed(() => routeOpen('tna-gap', session.activeView, session))
const paretoTo = (r: { competencyId: string | null }) => (gapOpen.value && r.competencyId ? { name: 'tna-gap', query: { kind: 'competency', competencyId: r.competencyId } } : undefined)

const PART_LABEL: Record<string, string> = { cca: 'CCA', dna: 'DNA', tna: 'TNA', ina: 'INA' }

const modules = computed(() => (data.value?.modules ?? []).flatMap((m) => {
  const info = MODULE_INFO[m.key]
  if (!info) return [] // modul baru dari API sebelum layar mengenalnya
  return [{
    ...m,
    ...info,
    parts: (m.parts ?? []).filter((p) => p.active).map((p) => PART_LABEL[p.key] ?? p.key).join(' · '),
    open: m.active ? info.routes.find((r) => routeOpen(r, session.activeView, session)) : undefined,
  }]
}))
</script>

<template>
  <AppShell>
    <h1 class="el-h1">{{ isTeam ? 'Dashboard tim' : 'Dashboard utama' }}</h1>
    <p class="el-muted dash-sub">{{ isTeam ? 'Ringkasan tim Anda. Hanya bawahan langsung yang dihitung.' : 'Ringkasan seluruh modul ELGOS, dari analisis kebutuhan sampai dampak.' }}</p>
    <p v-if="loading" class="el-muted">Memuat…</p>
    <UiNote v-else-if="error" tone="critical" data-testid="dash-galat">Dashboard tidak bisa dimuat. {{ error }}</UiNote>
    <div v-if="data" :class="['el-grid', isTeam ? 'el-grid-2' : 'el-grid-4']">
      <UiKpiCard v-for="k in kpis" :key="k.label" data-testid="kpi" :label="k.label" :value="k.value" :note="k.note" />
    </div>

    <template v-if="data">
      <h2 class="el-h2 dash-section">Status modul</h2>
      <div class="el-grid el-grid-3">
        <UiCard v-for="m in modules" :key="m.key" data-testid="modul" class="dash-mod">
          <div class="dash-row">
            <UiChip :tone="m.active ? 'success' : 'neutral'" :icon="m.active ? 'check_circle' : 'schedule'">{{ m.active ? 'Aktif' : 'Belum aktif' }}</UiChip>
            <span class="el-muted el-mono dash-small">Modul {{ m.no }}</span>
          </div>
          <div>
            <h3 class="el-h3 dash-flat">{{ m.name }}</h3>
            <div class="el-muted">{{ m.desc }}</div>
          </div>
          <div class="dash-row">
            <span class="el-muted dash-small">{{ m.parts }}</span>
            <UiButton v-if="m.open" variant="outlined" size="sm" :to="{ name: m.open }" :aria-label="`Buka ${m.name}`">Buka</UiButton>
          </div>
        </UiCard>
      </div>

      <div class="el-grid el-grid-2 dash-section dash-top">
        <UiCard data-testid="pareto">
          <h2 class="el-h2">Pareto 20/80: gap yang perlu diprioritaskan</h2>
          <p v-if="!data.pareto" class="el-muted">Modul Training Needs belum aktif.</p>
          <p v-else-if="!data.pareto.rows.length" class="el-muted">Belum ada temuan pelatihan yang disetujui HR.</p>
          <template v-else>
            <p class="el-muted dash-note">{{ paretoNote }}</p>
            <component
              :is="paretoTo(r) ? RouterLink : 'div'" v-for="r in data.pareto.rows" :key="r.key" :to="paretoTo(r)" data-testid="pareto-baris"
              :aria-label="paretoTo(r) ? `${r.label}, ${r.people} orang` : undefined"
              :class="['dash-pareto', { 'dash-pareto--link': paretoTo(r) }]"
            >
              <div class="dash-row">
                <span class="dash-strong">{{ r.label }}</span>
                <UiChip v-if="r.hot" tone="critical" icon="warning">Prioritas</UiChip>
              </div>
              <div class="el-muted el-mono dash-small">{{ r.people }} orang · kum. {{ pct(r.cumulativeShare) }}%</div>
              <UiProgressBar :value="pct(r.cumulativeShare)" :tone="r.hot ? 'critical' : 'primary'" :label="`Kumulatif ${r.label}`" />
            </component>
          </template>
        </UiCard>

        <UiCard data-testid="tindakan">
          <h2 class="el-h2">Perlu tindakan</h2>
          <p v-if="!actions.length" class="el-muted">Tidak ada yang menunggu tindakan.</p>
          <div v-for="a in actions" :key="a.key" data-testid="tindakan-baris" class="dash-action">
            <div class="dash-action__text">
              <div class="dash-strong">{{ a.text }}</div>
              <div class="el-muted dash-small">{{ a.desc }}</div>
            </div>
            <UiButton v-if="a.to" variant="tonal" size="sm" :to="{ name: a.to }">{{ a.cta }}</UiButton>
          </div>
        </UiCard>
      </div>
    </template>
  </AppShell>
</template>

<style>
.dash-sub { margin: 0 0 20px; }
.dash-section { margin-top: 28px; }
.dash-mod { display: flex; flex-direction: column; gap: 10px; }
.dash-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 32px; }
.dash-small { font-size: 12px; }
.dash-flat { margin: 0; }
.dash-top { align-items: start; }
.dash-note { margin: -4px 0 12px; }
.dash-pareto { margin-bottom: 14px; display: flex; flex-direction: column; gap: 4px; }
.dash-pareto--link { color: inherit; text-decoration: none; border-radius: 8px; margin-left: -8px; margin-right: -8px; padding: 0 8px; }
.dash-pareto--link:hover { background: var(--el-surface-1); }
.dash-strong { font-weight: 500; }
.dash-action { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--el-outline-variant); }
.dash-action:last-child { border-bottom: 0; }
.dash-action__text { min-width: 0; }
</style>
