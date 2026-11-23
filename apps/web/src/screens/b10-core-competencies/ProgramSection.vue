<script setup lang="ts">
// Hasil program nilai korporasi (mis. DNA 5C): laporan agregat, lalu kelola program (konfigurasi, impor, isian agregat).
// Halaman ini tidak pernah menampilkan hasil per orang.
import { computed, onMounted, ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { cca, fmt, fmtDate, type Program, type ProgramReport } from '@/api/cca'
import ImportPanel from '@/components/ImportPanel.vue'
import { UiButton, UiCard, UiChip, UiDataTable, UiErrorSummary, UiField, UiKpiCard, UiNote, UiProgressBar, type UiColumn } from '@/ui'
import ManualReportForm from './ManualReportForm.vue'
import ProgramForm from './ProgramForm.vue'

// CV-5: tujuan tombol "Wawancarai karyawan yang belum selesai" (null bila flag cca.interview mati)
defineProps<{ interviewTo?: RouteLocationRaw | null }>()
const programs = ref<Program[]>([])
const key = ref('')
const report = ref<ProgramReport | null>(null)
const loading = ref(true)
const errors = ref<{ message: string }[]>([])
const panel = ref<'' | 'config' | 'new' | 'import' | 'manual'>('')

const program = computed(() => programs.value.find((p) => p.key === key.value) ?? null)

async function loadReport() {
  report.value = null
  if (!key.value) return
  try { report.value = await cca.report(key.value) } catch (e) { errors.value = [{ message: (e as Error).message }] }
}
async function load(select?: string) {
  errors.value = []
  try {
    programs.value = await cca.programs()
    key.value = select ?? (programs.value.some((p) => p.key === key.value) ? key.value : programs.value[0]?.key ?? '')
    await loadReport()
  } catch (e) { errors.value = [{ message: (e as Error).message }] } finally { loading.value = false }
}
onMounted(() => load())

function saved(k: string) { panel.value = ''; void load(k) }

const kpis = computed(() => {
  const r = report.value
  if (!r) return []
  const total = program.value?.config.totalActivities
  return [
    { label: 'Terdaftar', value: fmt(r.kpis.registered), note: 'karyawan' },
    { label: 'Selesai', value: fmt(r.kpis.completed), note: `${fmt(r.kpis.completedPct, '%')} menyelesaikan ${total ?? 'semua'} kegiatan` },
    { label: 'Lulus', value: fmt(r.kpis.passed), note: `${fmt(r.kpis.passedPct, '%')} dari terdaftar` },
    { label: 'Rata-rata skor nilai', value: fmt(r.kpis.avgValueScore), note: 'peserta yang selesai' },
  ]
})
// CV-2 / K-P7-4: ambang hijau/merah skor per nilai = band tertinggi program (mis. Strong Culture Alignment), atau nilai lulus
const valueTarget = computed(() => Math.max(program.value?.config.passScore ?? 0, ...(program.value?.config.bands ?? []).map((b) => b.min)))
const statusTone = (k: string) => (k === 'not_passed' ? 'critical' : k === 'in_progress' ? 'review' : 'success')
const empty = computed(() => !!report.value && report.value.kpis.registered === 0)

const COMPONENT_COLS: UiColumn[] = [
  { key: 'name', label: 'Komponen' },
  { key: 'weight', label: 'Bobot', align: 'right', mono: true },
  { key: 'done', label: 'Sudah mengerjakan', align: 'right', mono: true },
  { key: 'avg', label: 'Rata-rata', align: 'right', mono: true },
  { key: 'contribution', label: 'Kontribusi', align: 'right', mono: true },
]
const componentRows = computed(() => {
  const r = report.value
  if (!r) return []
  return [
    ...r.components.map((c) => ({ name: c.name, weight: fmt(c.weight, '%'), done: `${c.done} (${fmt(c.donePct, '%')})`, avg: fmt(c.avg), contribution: fmt(c.contribution) })),
    { name: 'Total program', weight: '100%', done: `${r.total.done} (${fmt(r.total.donePct, '%')})`, avg: '-', contribution: fmt(r.total.avgFinal) },
  ]
})
const DIVISION_COLS: UiColumn[] = [
  { key: 'name', label: 'Divisi', sortable: true },
  { key: 'participants', label: 'Peserta', sortable: true, align: 'right', mono: true },
  { key: 'completedText', label: 'Selesai', align: 'right', mono: true },
  { key: 'passedText', label: 'Lulus', align: 'right', mono: true },
  { key: 'avgFinal', label: 'Skor akhir', sortable: true, align: 'right', mono: true },
  { key: 'avgValueScore', label: 'Skor nilai', sortable: true, align: 'right', mono: true },
]
const divisionRows = computed(() => (report.value?.divisions ?? []).map((d) => ({
  ...d, completedText: `${d.completed} (${fmt(d.completedPct, '%')})`, passedText: `${d.passed} (${fmt(d.passedPct, '%')})`,
})))
</script>

<template>
  <section class="cc-stack" data-testid="cc-program">
    <UiErrorSummary v-if="errors.length" :errors="errors" />
    <p v-if="loading" class="el-muted">Memuat…</p>

    <UiCard v-else-if="!programs.length && panel !== 'new'">
      <h2 class="el-h2">Hasil program nilai korporasi</h2>
      <p class="el-muted">Belum ada program nilai yang dikonfigurasi. Atur program dulu (nama nilai, komponen berbobot, dan status kelulusan), lalu impor hasil per karyawan atau isi angka agregat dari laporan penyelenggara.</p>
      <div class="cc-actions" style="margin-top: 12px"><UiButton size="sm" @click="panel = 'new'">Atur program</UiButton></div>
    </UiCard>

    <template v-else-if="program && report">
      <div class="cc-row">
        <h2 class="el-h2" style="margin: 0">Hasil Program {{ report.program.name }}</h2>
        <UiField v-if="programs.length > 1" id="cc-program-pilih" v-slot="{ attrs }" label="Program">
          <select v-bind="attrs" v-model="key" class="el-input" @change="loadReport"><option v-for="p in programs" :key="p.key" :value="p.key">{{ p.name }}</option></select>
        </UiField>
      </div>
      <p class="el-muted">
        <template v-if="report.program.provider">Program bersama {{ report.program.provider }}. </template>
        Data agregat<template v-if="report.program.cutoffDate"> per {{ fmtDate(report.program.cutoffDate) }}</template>;
        hasil individu tidak ditampilkan di halaman ini.
        <UiChip tone="neutral">{{ report.source === 'manual' ? 'Sumber: isian agregat HR' : 'Sumber: impor per karyawan' }}</UiChip>
      </p>

      <UiNote v-if="empty">Program sudah dikonfigurasi tetapi belum punya hasil. Impor hasil per karyawan atau isi angka agregat lewat tombol di bawah.</UiNote>
      <template v-else>
        <div class="el-grid el-grid-4">
          <UiKpiCard v-for="k in kpis" :key="k.label" :label="k.label" :value="k.value" :note="k.note" />
        </div>
        <div class="el-grid el-grid-2" style="align-items: start">
          <UiCard>
            <h3 class="el-h3">Status karyawan</h3>
            <div v-for="s in report.statuses" :key="s.key" class="cc-meter" :data-testid="`cc-status-${s.key}`">
              <div class="cc-row"><UiChip :tone="statusTone(s.key)">{{ s.label }}</UiChip><span class="el-mono">{{ s.count }} · {{ fmt(s.pct, '%') }}</span></div>
              <UiProgressBar :value="s.pct ?? 0" :label="`Porsi ${s.label}`" />
              <div v-if="s.description" class="el-muted cc-small">{{ s.description }}</div>
            </div>
          </UiCard>
          <UiCard>
            <h3 class="el-h3">Skor per nilai (peserta yang selesai)</h3>
            <div v-for="v in report.values" :key="v.name" class="cc-meter">
              <div class="cc-row"><b>{{ v.name }}</b><span class="el-mono">{{ fmt(v.avgCompleted) }} <span class="el-muted">· semua peserta {{ fmt(v.avgAll) }}</span></span></div>
              <UiProgressBar :value="v.avgCompleted ?? 0" :tone="(v.avgCompleted ?? 0) >= valueTarget ? 'success' : 'critical'" :label="`Skor ${v.name}`" />
            </div>
            <div class="el-muted cc-small" style="margin-top: 8px">Skor semua peserta lebih rendah karena kegiatan yang belum selesai dihitung 0.</div>
          </UiCard>
        </div>
        <!-- CV-4: judul h3 di kartu, tabel tanpa bingkai sendiri (tidak dobel border) -->
        <UiCard v-if="report.components.length">
          <h3 class="el-h3">Kinerja per komponen program</h3>
          <UiDataTable class="cc-flat" :columns="COMPONENT_COLS" :rows="componentRows" row-key="name" caption="Kinerja per komponen program" caption-hidden />
          <UiNote v-if="report.insight" style="margin-top: 12px"><b>Temuan:</b> {{ report.insight }}</UiNote>
        </UiCard>
        <UiCard v-if="report.divisions.length">
          <h3 class="el-h3">Hasil per divisi</h3>
          <UiDataTable class="cc-flat" :columns="DIVISION_COLS" :rows="divisionRows" row-key="name" caption="Hasil per divisi" caption-hidden />
        </UiCard>
        <UiCard v-if="report.recommendations.length">
          <h3 class="el-h3">Rekomendasi dari laporan program</h3>
          <div v-for="r in report.recommendations" :key="r.title" class="cc-mod"><b>{{ r.title }}</b><div v-if="r.detail" class="el-muted cc-detail">{{ r.detail }}</div></div>
          <div v-if="interviewTo" class="cc-actions" style="margin-top: 12px"><UiButton variant="tonal" size="sm" :to="interviewTo">Wawancarai karyawan yang belum selesai</UiButton></div>
        </UiCard>
      </template>

      <div class="cc-actions">
        <UiButton variant="outlined" size="sm" @click="panel = panel === 'import' ? '' : 'import'">Impor hasil per karyawan</UiButton>
        <UiButton variant="outlined" size="sm" @click="panel = panel === 'manual' ? '' : 'manual'">Isi angka agregat</UiButton>
        <UiButton variant="outlined" size="sm" @click="panel = panel === 'config' ? '' : 'config'">Ubah program</UiButton>
        <UiButton variant="text" size="sm" @click="panel = 'new'">Program baru</UiButton>
      </div>
    </template>

    <ProgramForm v-if="panel === 'new'" :program="null" @saved="saved" @cancel="panel = ''" />
    <ProgramForm v-else-if="panel === 'config' && program" :key="program.key" :program="program" @saved="saved" @cancel="panel = ''" />
    <ManualReportForm v-else-if="panel === 'manual' && program" :key="program.key" :program="program" @saved="saved(program.key)" @cancel="panel = ''" />
    <div v-else-if="panel === 'import' && program">
      <UiNote>Isi "Program" dengan key <b class="el-mono">{{ program.key }}</b>. Menyimpan impor mengganti seluruh hasil program ini, jadi semua baris harus valid.</UiNote>
      <ImportPanel submodule="cca" style="margin-top: 12px" @imported="load(program.key)" />
    </div>
  </section>
</template>
