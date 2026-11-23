<script setup lang="ts">
// Training Needs (mockup Pak Eji, layar `tna`): papan gap kompetensi dan OKR di balik flag tna.gap_board.
// Pengelolaan TNA lama tampil di sini hanya bila papan mati; bila papan menyala, pindah ke `tna-kelola` (paritas P5, TN-2).
// Spek: docs/designs/b5-training-needs.md bagian 16, docs/designs/paritas-mockup/p5-lna.md.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { UiAgentCard, UiBreadcrumb, UiButton, UiCard, UiChip, UiDataTable, UiErrorSummary, UiKpiCard, UiNote, UiProgressBar, UiTabs, type UiColumn } from '@/ui'
import { routeOpen } from '@/router'
import { useSessionStore } from '@/stores/session'
import TnaPengelolaan from './TnaPengelolaan.vue'
import { BOARD_ROLES, gaps, gapRefOf, type CompetencyGap, type GapSummary, type OkrGap } from './api'
import { CLASSIFICATION_LABEL, CLASSIFICATION_TONE, interviewStatus, num, pct } from './labels'
import './tna.css'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

// Papan hanya untuk peran yang diterima API (R1); selain itu tidak ada panggilan /gaps sama sekali
const showBoard = computed(() => session.hasFlag('tna.gap_board') && session.activeView !== 'karyawan' && session.roles.some((r) => BOARD_ROLES.includes(r)))

const TABS = [{ key: 'ringkasan', label: 'Ringkasan' }, { key: 'kompetensi', label: 'Gap kompetensi' }, { key: 'okr', label: 'Gap OKR' }]
const tab = computed({
  get: () => (TABS.some((t) => t.key === route.query.tab) ? (route.query.tab as string) : 'ringkasan'),
  set: (v: string) => { router.replace({ query: { ...route.query, tab: v } }) },
})
const summary = ref<GapSummary | null>(null)
const comps = ref<CompetencyGap[]>([])
const okrs = ref<OkrGap[]>([])
const period = ref('')
const error = ref('')

async function loadBoard() {
  if (!showBoard.value) return
  error.value = ''
  try {
    const p = period.value || undefined
    const [s, c, o] = await Promise.all([gaps.summary(p), gaps.competencies(), gaps.okr(p)])
    summary.value = s.data
    comps.value = c.data.rows
    okrs.value = o.data.rows
    if (!period.value && s.data.period) period.value = s.data.period
  } catch (e) { error.value = e instanceof ApiError ? e.message : 'Papan gap tidak bisa dimuat' }
}
onMounted(loadBoard)
watch(period, (v, old) => { if (old) loadBoard() })

const kpis = computed(() => {
  const k = summary.value?.kpis
  if (!k) return []
  return [
    // Paritas P5 TN-3: copy mockup
    { label: 'GAP KOMPETENSI', value: k.competencyGaps, note: 'terhadap Job Competency Model' },
    { label: 'GAP OKR', value: k.okrGaps, note: summary.value?.period ? 'key result di bawah target' : 'belum ada data kinerja' },
    { label: 'SUDAH DIWAWANCARAI', value: k.interviewed, note: `dari ${k.totalGaps} gap` },
    { label: 'KONTRIBUSI 4 GAP TERBESAR', value: k.totalGaps ? pct(k.top4Share) : '–', note: 'dari total gap kompetensi' },
  ]
})
const dist = computed(() => {
  const s = summary.value
  if (!s) return []
  const total = s.kpis.totalGaps || 0
  return (['training', 'non_training', 'review', 'pending'] as const).map((key) => ({
    key, label: CLASSIFICATION_LABEL[key], tone: CLASSIFICATION_TONE[key], n: s.classification[key] ?? 0, w: total ? ((s.classification[key] ?? 0) / total) * 100 : 0,
  }))
})
// Kolom Kode dari mockup (TN-7). Orang dan Status wawancara dipertahankan untuk pemindaian HR (paritas P3, K-P3-3).
const compCols: UiColumn[] = [
  { key: 'code', label: 'Kode', sortable: true, mono: true },
  { key: 'name', label: 'Kompetensi', sortable: true },
  { key: 'targetPct', label: 'Target', align: 'right', mono: true },
  { key: 'actualPct', label: 'Aktual', align: 'right', mono: true },
  { key: 'gapPct', label: 'Gap', sortable: true },
  { key: 'people', label: 'Orang' },
  { key: 'status', label: 'Status wawancara' },
  { key: 'classification', label: 'Klasifikasi' },
]
const okrCols: UiColumn[] = [
  { key: 'name', label: 'Key result', sortable: true },
  { key: 'target', label: 'Target', align: 'right', mono: true },
  { key: 'actual', label: 'Aktual', align: 'right', mono: true },
  { key: 'diff', label: 'Selisih', align: 'right', mono: true },
  { key: 'people', label: 'Orang' },
  { key: 'status', label: 'Status wawancara' },
  { key: 'classification', label: 'Klasifikasi' },
]
// TN-9: lebar relatif gap terbesar, merah hanya bila gap 20 atau lebih (aturan `hot` mockup)
const maxGap = computed(() => Math.max(0, ...comps.value.map((c) => c.gapPct)))
const gapWidth = (g: number) => (maxGap.value ? (g / maxGap.value) * 100 : 0)
const detailLink = (row: CompetencyGap | OkrGap) => ({ name: 'tna-gap', query: { ...gapRefOf(row), tab: tab.value } })
const ivTo = computed(() => (routeOpen('iv', session.activeView, session) ? { name: 'iv' } : null))
</script>

<template>
  <AppShell>
    <UiBreadcrumb :items="[{ label: 'Learning Needs Analysis' }, { label: 'Training Needs' }]" />
    <h1 class="tna-h1">Training Needs</h1>

    <template v-if="showBoard">
      <UiAgentCard title="Wawancara akar masalah" action="Contoh wawancara" :to="ivTo" data-testid="tna-agen">
        Setiap gap kompetensi diwawancarai AI untuk mencari akar masalah, lalu diklasifikasikan ke Training Needs atau Improvement Needs. Penugasan wawancara mengikuti alur HR, atasan, karyawan.
      </UiAgentCard>
      <p class="el-muted">Reaktif: setiap gap adalah masalah yang bisa diwawancarai untuk menemukan akar penyebab, lalu diberi solusi pelatihan atau perbaikan.</p>
      <UiErrorSummary :errors="error ? [{ message: error }] : []" />
      <UiTabs id="tna-tab" v-model="tab" :tabs="TABS" label="Bagian Training Needs" />

      <div v-if="tab === 'ringkasan'" id="tna-tab-panel-ringkasan" role="tabpanel" aria-labelledby="tna-tab-tab-ringkasan" class="tna-panel">
        <div class="el-grid el-grid-4">
          <UiKpiCard v-for="k in kpis" :key="k.label" :label="k.label" :value="k.value" :note="k.note" />
        </div>
        <UiNote v-if="summary?.unapprovedCompetencies" tone="warning" class="tna-gap">
          {{ summary.unapprovedCompetencies }} kompetensi menunggu pengesahan HR sebelum dipakai sebagai target di Training Needs.
        </UiNote>
        <div class="el-grid el-grid-2 tna-gap">
          <UiCard>
            <h2 class="tna-h2">Klasifikasi gap</h2>
            <div v-for="d in dist" :key="d.key" class="tna-dist">
              <div class="tna-row"><UiChip :tone="d.tone">{{ d.label }}</UiChip><span class="el-mono">{{ d.n }}</span></div>
              <UiProgressBar :value="d.w" :label="`${d.label}: ${d.n}`" />
            </div>
            <p class="el-muted tna-small">Gap non-pelatihan diteruskan ke Improvement Needs agar tidak berakhir sebagai pelatihan yang tidak menyelesaikan masalah.</p>
          </UiCard>
          <UiCard>
            <h2 class="tna-h2">Alur dari gap ke solusi</h2>
            <ol class="tna-flow">
              <li>Gap terdeteksi (kompetensi atau OKR)</li><li>Wawancara AI untuk akar masalah</li><li>HR meninjau dan mengklasifikasi</li>
              <li>Pelatihan (EliteMentor) atau perbaikan (Improvement Needs)</li><li>Hasil diukur di Impact Measurement</li>
            </ol>
            <UiButton variant="tonal" size="sm" class="tna-gap" @click="tab = 'kompetensi'">Lihat gap kompetensi</UiButton>
          </UiCard>
        </div>
      </div>

      <div v-else-if="tab === 'kompetensi'" id="tna-tab-panel-kompetensi" role="tabpanel" aria-labelledby="tna-tab-tab-kompetensi" class="tna-panel">
        <UiNote class="tna-gap-b"><b>Gap kompetensi</b> = kesenjangan skor pegawai terhadap <b>Job Competency Model</b> jabatan (DACUM Tool 1). Klik baris untuk membuka detail dan menugaskan wawancara akar masalah.</UiNote>
        <UiDataTable :columns="compCols" :rows="comps" row-key="key" caption="Gap kompetensi" caption-hidden empty-text="Belum ada gap. Impor data asesmen atau kinerja lebih dulu." :row-to="detailLink" row-link-key="name">
          <template #cell-name="{ row }"><span class="tna-link">{{ row.name }}</span></template>
          <template #cell-targetPct="{ row }">{{ row.targetPct }}%</template>
          <template #cell-actualPct="{ row }">{{ row.actualPct }}%</template>
          <template #cell-gapPct="{ row }">
            <div class="tna-row"><UiProgressBar :value="gapWidth(row.gapPct)" :tone="row.gapPct >= 20 ? 'critical' : 'primary'" :label="`Gap ${row.name}`" class="tna-bar" /><span class="el-mono">−{{ row.gapPct }}</span></div>
          </template>
          <template #cell-people="{ row }">{{ row.peopleWithGap }} dari {{ row.assessed }}</template>
          <template #cell-status="{ row }">{{ interviewStatus(row) }}</template>
          <template #cell-classification="{ row }"><UiChip :tone="CLASSIFICATION_TONE[row.classification]">{{ CLASSIFICATION_LABEL[row.classification] }}</UiChip></template>
        </UiDataTable>
      </div>

      <div v-else id="tna-tab-panel-okr" role="tabpanel" aria-labelledby="tna-tab-tab-okr" class="tna-panel">
        <UiNote class="tna-gap-b"><b>Gap OKR</b> = kesenjangan terhadap pencapaian <b>OKR</b> operasional. Diperlakukan sama seperti gap kompetensi: dapat diwawancarai dan diberi solusi.</UiNote>
        <label v-if="summary?.periods.length" class="tna-period">Periode
          <select v-model="period" class="el-input tna-period__select">
            <option v-for="p in summary.periods" :key="p" :value="p">{{ p }}</option>
          </select>
        </label>
        <UiDataTable :columns="okrCols" :rows="okrs" row-key="key" caption="Gap OKR" caption-hidden empty-text="Belum ada target yang meleset pada periode ini." :row-to="detailLink" row-link-key="name">
          <template #cell-name="{ row }"><span class="tna-link">{{ row.name }}</span></template>
          <template #cell-target="{ row }">{{ num(row.target, row.unit) }}</template>
          <template #cell-actual="{ row }">{{ num(row.actual, row.unit) }}</template>
          <template #cell-diff="{ row }">{{ num(row.diff, row.unit) }}</template>
          <template #cell-people="{ row }">{{ row.peopleMissed }} dari {{ row.peopleTotal }}</template>
          <template #cell-status="{ row }">{{ interviewStatus(row) }}</template>
          <template #cell-classification="{ row }"><UiChip :tone="CLASSIFICATION_TONE[row.classification]">{{ CLASSIFICATION_LABEL[row.classification] }}</UiChip></template>
        </UiDataTable>
      </div>
      <!-- TN-2: fitur kelola lama tetap terjangkau lewat rute sekunder -->
      <div class="tna-gap"><UiButton variant="outlined" size="sm" :to="{ name: 'tna-kelola' }">Kelola TNA</UiButton></div>
    </template>

    <TnaPengelolaan v-else />
  </AppShell>
</template>

