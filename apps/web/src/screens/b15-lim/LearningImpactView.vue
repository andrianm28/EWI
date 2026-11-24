<script setup lang="ts">
// Learning Impact Measurement (mockup Pak Eji, layar `lim`): Ringkasan, Per kompetensi, Dampak bisnis, Pengukuran AI.
// Spek: docs/designs/b15-impact-measurement.md. Insight dan kesimpulan dihitung API dengan aturan tetap, bukan AI.
import { computed, onMounted, ref, watch } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { EMPTY, UiAgentCard, UiButton, UiCard, UiDataTable, UiNote, UiStatus, UiTabs, type UiColumn } from '@/ui'
import { lim, type CompetencyRow, type Indicator, type Overview, type PlanSummary, type QueueRow } from './api'
import { COVERAGE, PITFALLS, PRINCIPLE, QUESTIONS, QUEUE_STATUS, STRENGTH, VERDICT, WINDOW, score, tanggal, targetText, todayJakarta, withUnit } from './labels'
import ImportPanel from '@/components/ImportPanel.vue'
import PlanForm from './PlanForm.vue'
import ReinterviewResult from './ReinterviewResult.vue'
import './lim.css'

const session = useSessionStore()
const isHr = computed(() => session.activeView === 'hr')
const TABS = [{ key: 'ringkasan', label: 'Ringkasan' }, { key: 'kompetensi', label: 'Per kompetensi' }, { key: 'bisnis', label: 'Dampak bisnis' }, { key: 'ai', label: 'Pengukuran AI' }]
const tab = ref('ringkasan')
const plans = ref<PlanSummary[] | null>(null)
const planId = ref('')
const data = ref<Overview | null>(null)
const queue = ref<QueueRow[] | null>(null)
const creating = ref(false)
const error = ref('')
const notice = ref('')
const busy = ref(false)
const date = ref('')
// tahap 3: hasil wawancara ulang satu karyawan (alur empat langkah mockup), menggantikan antrean saat dibuka
const viewing = ref<QueueRow | null>(null)
const canReinterview = computed(() => session.hasFlag('lim.reinterview'))
// LIM-10: kartu isian HR dilipat (mockup tanpa kartu); status lipatan bertahan saat ringkasan dimuat ulang
const foldOpen = ref(false)

const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback)

async function loadPlans(pick?: string) {
  try {
    plans.value = (await lim.plans()).data
    planId.value = pick ?? (plans.value.some((p) => p.id === planId.value) ? planId.value : plans.value[0]?.id ?? '')
  } catch (e) { error.value = msg(e, 'Rencana pengukuran tidak bisa dimuat') }
}
async function loadOverview() {
  data.value = null; queue.value = null
  if (!planId.value) return
  try { data.value = (await lim.overview(planId.value)).data; error.value = '' } catch (e) { error.value = msg(e, 'Data dampak belajar tidak bisa dimuat') }
}
async function loadQueue() {
  if (!isHr.value || !planId.value) return
  try { queue.value = (await lim.queue(planId.value)).data } catch (e) { error.value = msg(e, 'Antrean wawancara ulang tidak bisa dimuat') }
}
watch(planId, () => { viewing.value = null; loadOverview() })
watch([tab, planId], () => { if (tab.value === 'ai' && queue.value === null) loadQueue() })
onMounted(() => loadPlans())

async function created(id: string) {
  creating.value = false; notice.value = 'Rencana pengukuran dibuat.'
  await loadPlans(id)
}

async function preFromDna() {
  error.value = ''; notice.value = ''; busy.value = true
  try {
    const { data: r } = await lim.preFromDna(planId.value)
    notice.value = r.filled ? `${r.filled} skor pre diisi dari asesmen DNA (level × 25).` : 'Tidak ada skor pre baru: yang kosong tidak punya asesmen DNA sebelum mulai belajar.'
    await loadOverview()
  } catch (e) { error.value = msg(e, 'Skor pre tidak bisa diisi') } finally { busy.value = false }
}
const currentPlan = computed(() => (plans.value ?? []).filter((p) => p.id === planId.value).map((p) => ({ id: p.id, name: p.title })))

const pending = computed(() => (queue.value ?? []).filter((r) => r.status === 'none' && (r.window === 'due' || r.window === 'late')))
async function schedule(userIds: string[], when: string | null) {
  error.value = ''; notice.value = ''
  if (when !== null && !when) { error.value = 'Pilih tanggal wawancara ulang dulu.'; return }
  busy.value = true
  try {
    const { data: r } = await lim.schedule(planId.value, userIds, when)
    const parts = [when === null ? `${r.scheduled.length} jadwal dibatalkan` : `${r.scheduled.length} karyawan dijadwalkan`]
    const done = r.skipped.filter((x) => x.reason === 'done').length
    const running = r.skipped.length - done
    if (done) parts.push(`${done} sudah selesai`)
    if (running) parts.push(`${running} sedang diwawancara, jadwalnya tidak diubah`)
    if (r.rejected.length) parts.push(`${r.rejected.length} ditolak: ${r.rejected[0]!.message}`)
    notice.value = `${parts.join(', ')}.`
    await loadQueue()
  } catch (e) { error.value = msg(e, 'Jadwal tidak bisa disimpan') } finally { busy.value = false }
}

/** "Mulai sekarang" (mockup limQueue, status Dijadwalkan): buka wawancara ulang hari ini dan kabari karyawan lewat email. */
// Karyawan yang sudah dikabari di kunjungan ini: tombol nonaktif supaya email tidak terkirim berulang
const started = ref<Record<string, boolean>>({})
async function startNow(row: QueueRow) {
  error.value = ''; notice.value = ''; busy.value = true
  try {
    const { data: r } = await lim.schedule(planId.value, [row.userId], todayJakarta(), true)
    if (r.scheduled.length) started.value = { ...started.value, [row.userId]: true }
    if (r.scheduled.length) notice.value = r.notified ? `${row.name} dikabari lewat email dan bisa mulai wawancara ulang hari ini dari menu Wawancara ulang.` : `${row.name} bisa mulai wawancara ulang hari ini dari menu Wawancara ulang. Email pemberitahuan gagal terkirim.`
    else if (r.skipped.length) notice.value = r.skipped[0]!.reason === 'done' ? `${row.name} sudah menyelesaikan wawancara ulang.` : `${row.name} sedang diwawancara; jadwalnya tidak diubah.`
    else if (r.rejected.length) error.value = r.rejected[0]!.message
    await loadQueue()
  } catch (e) { error.value = msg(e, 'Wawancara ulang tidak bisa dibuka') } finally { busy.value = false }
}
async function saved(name: string) { viewing.value = null; notice.value = `Hasil wawancara ulang ${name} disimpan.`; await loadQueue() }

const CHAIN_COLS: UiColumn[] = [{ key: 'label', label: 'Tingkat' }, { key: 'source', label: 'Sumber data di ELGOS' }, { key: 'finding', label: 'Temuan saat ini' }, { key: 'coverage', label: 'Cakupan' }]
const COMP_COLS: UiColumn[] = [
  { key: 'name', label: 'Kompetensi', sortable: true }, { key: 'pre', label: 'Pre', align: 'right', sortable: true }, { key: 'post', label: 'Post', align: 'right', sortable: true },
  { key: 'reinterview', label: 'Wawancara ulang', align: 'right', sortable: true }, { key: 'performance', label: 'Kinerja', align: 'right', sortable: true }, { key: 'verdict', label: 'Kesimpulan' },
]
const BIZ_COLS = computed<UiColumn[]>(() => [
  { key: 'name', label: 'Indikator (tim)' },
  { key: 'baseline', label: data.value?.plan.baselineLabel ? `Sebelum (${data.value.plan.baselineLabel})` : 'Sebelum', align: 'right' },
  { key: 'current', label: data.value?.plan.afterLabel ? `Sesudah (${data.value.plan.afterLabel})` : 'Sesudah', align: 'right' },
  { key: 'target', label: 'Target', align: 'right' }, { key: 'strength', label: 'Kekuatan bukti' },
])
const QUEUE_COLS: UiColumn[] = [
  { key: 'name', label: 'Karyawan', sortable: true }, { key: 'competencies', label: 'Kompetensi' }, { key: 'status', label: 'Status' },
  { key: 'dueFrom', label: 'Jadwal', sortable: true }, { key: 'aksi', label: 'Tindakan' },
]
const asRow = (x: object) => x as Record<string, unknown>
const C = (r: Record<string, unknown>) => r as unknown as CompetencyRow
const I = (r: Record<string, unknown>) => r as unknown as Indicator
const Q = (r: Record<string, unknown>) => r as unknown as QueueRow
const sourceText = (i: Indicator) => (i.strengthSource === 'hr' ? 'dinilai HR' : 'dihitung aturan')
const nTitle = (n: number) => `Rata-rata dari ${n} orang`
const chainLabel = (r: Record<string, unknown>) => `${r.level} · ${r.label}`
</script>

<template>
  <AppShell>
    <h1 class="el-h1">Learning Impact Measurement</h1>
    <p class="el-muted">Dari aktivitas belajar sampai hasil bisnis, sebagai satu rantai bukti: mulai dari masalah bisnis, pilih metrik sesuai tujuan, dan jangan berhenti di data kehadiran.</p>
    <UiNote v-if="error" tone="critical" data-testid="galat">{{ error }}</UiNote>
    <UiNote v-if="notice" tone="success" data-testid="info">{{ notice }}</UiNote>

    <template v-if="plans">
      <UiCard v-if="isHr && (creating || !plans.length)" class="lim-gap" as="section" aria-label="Rencana pengukuran baru">
        <h2 class="el-h3">Rencana pengukuran baru</h2>
        <p class="el-muted lim-small">Mulai dari masalah bisnis. Peserta rencana adalah karyawan jabatan terpilih yang mengikuti pelatihan modul ini dalam periode rencana.</p>
        <PlanForm :cancelable="plans.length > 0" @created="created" @cancel="creating = false" />
      </UiCard>
      <UiNote v-else-if="!plans.length" class="lim-gap">Belum ada rencana pengukuran dampak untuk tim Anda. HR membuat rencana lebih dulu.</UiNote>
    </template>

    <!-- LIM-2 (PK-2): pemilih rencana dan "Rencana baru" di kanan baris tab supaya tab tetap di posisi mockup.
         Pemilih tetap tampil walau ringkasan gagal dimuat, supaya HR bisa pindah rencana atau membuat yang baru. -->
    <div v-if="!creating && (data || plans?.length)" class="lim-tabbar" data-testid="lim-tabbar">
      <UiTabs v-if="data" id="lim" v-model="tab" :tabs="TABS" label="Bagian Learning Impact Measurement" />
      <div v-if="plans?.length" class="lim-plan">
        <label v-if="plans.length > 1" class="el-label lim-small">Rencana
          <select v-model="planId" class="el-input"><option v-for="p in plans" :key="p.id" :value="p.id">{{ p.title }} · {{ p.participantCount }} peserta</option></select>
        </label>
        <p v-else class="el-muted lim-small">Rencana: <b>{{ plans[0]!.title }}</b> · {{ plans[0]!.participantCount }} peserta</p>
        <UiButton v-if="isHr" variant="tonal" size="sm" @click="creating = true">Rencana baru</UiButton>
      </div>
    </div>

    <template v-if="data && !creating">

      <div v-if="tab === 'ringkasan'" id="lim-panel-ringkasan" role="tabpanel" aria-labelledby="lim-tab-ringkasan">
        <UiCard as="section" :aria-label="`Mulai dari masalah bisnis`">
          <h2 class="el-h3">Mulai dari masalah bisnis · {{ data.plan.jobRoleName ?? 'semua jabatan' }}</h2>
          <div class="lim-q5">
            <div v-for="q in QUESTIONS" :key="q.key" class="lim-q">
              <div class="el-muted lim-small">{{ q.label }}</div>
              <div class="lim-strong">{{ data.plan[q.key] || EMPTY }}</div>
            </div>
          </div>
        </UiCard>
        <UiCard class="lim-gap" as="section" aria-label="Rantai dampak">
          <h2 class="el-h3">Rantai dampak: enam tingkat bukti</h2>
          <p class="el-muted lim-small">Makin dekat ke hasil bisnis, makin kuat buktinya. Tingkat yang kosong menunjukkan tempat rantai putus.</p>
          <UiDataTable :columns="CHAIN_COLS" :rows="data.chain.map(asRow)" row-key="key" caption="Rantai dampak enam tingkat" caption-hidden>
            <template #cell-label="{ row }"><b>{{ chainLabel(row) }}</b></template>
            <template #cell-coverage="{ row }"><UiStatus :tone="COVERAGE[data.chain[Number(row.level) - 1]!.coverage].tone">{{ COVERAGE[data.chain[Number(row.level) - 1]!.coverage].text }}</UiStatus></template>
          </UiDataTable>
          <UiNote tone="warning" class="lim-gap" data-testid="insight"><b>Insight dari data pengukuran:</b> {{ data.insight.text }}</UiNote>
        </UiCard>
        <div class="el-grid el-grid-2 lim-gap">
          <UiCard as="section" aria-label="Dua jebakan yang dihindari"><h2 class="el-h3">Dua jebakan yang dihindari</h2><p class="el-muted">{{ PITFALLS }}</p></UiCard>
          <UiCard as="section" aria-label="Prinsip pelaporan"><h2 class="el-h3">Prinsip pelaporan</h2><p class="el-muted">{{ PRINCIPLE }}</p></UiCard>
        </div>
      </div>

      <div v-else-if="tab === 'kompetensi'" id="lim-panel-kompetensi" role="tabpanel" aria-labelledby="lim-tab-kompetensi">
        <UiNote>Setiap kompetensi diikuti sampai ke kinerja: skor asesmen sebelum dan sesudah, hasil wawancara ulang AI, skor kinerja kerja, dan kesimpulan.</UiNote>
        <UiDataTable class="lim-gap" :columns="COMP_COLS" :rows="data.competencies.map(asRow)" row-key="competencyId" caption="Kompetensi sampai kinerja" caption-hidden empty-text="Modul rencana belum terhubung ke kompetensi.">
          <template #cell-name="{ row }"><b>{{ C(row).name }}</b></template>
          <template #cell-pre="{ row }"><span class="el-mono" tabindex="0" :title="nTitle(C(row).preN)">{{ score(C(row).pre) }}</span><span class="el-sr-only"> ({{ C(row).preN }} orang)</span></template>
          <template #cell-post="{ row }">
            <span class="el-mono" tabindex="0" :title="nTitle(C(row).postN)">{{ score(C(row).post) }}</span><span class="el-sr-only"> ({{ C(row).postN }} orang)</span>
            <div v-if="C(row).postShared" class="el-muted lim-small">skor modul, bukan per kompetensi</div>
            <div v-if="C(row).postUnauditable" class="el-muted lim-small">{{ C(row).postUnauditable }} dari vendor</div>
          </template>
          <template #cell-reinterview="{ row }"><span class="el-mono" tabindex="0" :title="nTitle(C(row).reinterviewN)">{{ score(C(row).reinterview) }}</span><span class="el-sr-only"> ({{ C(row).reinterviewN }} orang)</span></template>
          <template #cell-performance="{ row }"><span class="el-mono" tabindex="0" :title="nTitle(C(row).performanceN)">{{ score(C(row).performance) }}</span><span class="el-sr-only"> ({{ C(row).performanceN }} orang)</span></template>
          <template #cell-verdict="{ row }"><UiStatus :tone="VERDICT[C(row).verdict].tone">{{ VERDICT[C(row).verdict].text }}</UiStatus></template>
        </UiDataTable>
        <p class="el-muted lim-small lim-gap">"Skor modul" berarti skor post satu modul dipakai untuk beberapa kompetensi. Kesimpulan memakai rata-rata wawancara ulang (ambang 70); yang belum diwawancara ulang ditandai "Belum diukur".</p>
        <details v-if="isHr" class="lim-gap lim-fold" :open="foldOpen" @toggle="foldOpen = ($event.target as HTMLDetailsElement).open">
          <summary class="lim-strong">Isi data pengukuran (HR)</summary>
          <UiCard tonal class="lim-gap" as="section" aria-label="Isi skor pre">
            <h2 class="el-h3">Skor pre dari asesmen DNA</h2>
            <p class="el-muted lim-small">Mengisi skor pre yang masih kosong dari asesmen DNA terakhir sebelum karyawan mulai belajar (level × 25). Skor yang sudah diisi tidak ditimpa.</p>
            <UiButton variant="tonal" size="sm" :disabled="busy" @click="preFromDna">Isi pre dari asesmen DNA</UiButton>
          </UiCard>
          <ImportPanel submodule="lim" :plans="currentPlan" class="lim-gap" @imported="loadOverview" />
        </details>
      </div>

      <div v-else-if="tab === 'bisnis'" id="lim-panel-bisnis" role="tabpanel" aria-labelledby="lim-tab-bisnis">
        <UiDataTable :columns="BIZ_COLS" :rows="data.indicators.map(asRow)" row-key="id" caption="Indikator bisnis tim" caption-hidden empty-text="Belum ada indikator tim untuk rencana ini.">
          <template #cell-name="{ row }"><b>{{ I(row).name }}</b><div class="el-muted lim-small">{{ I(row).source ?? 'Sumber belum diisi' }} · {{ I(row).level === 'performance' ? 'kinerja' : 'hasil bisnis' }}</div></template>
          <template #cell-baseline="{ row }"><span class="el-mono">{{ withUnit(I(row).baseline, I(row).unit) }}</span></template>
          <template #cell-current="{ row }"><span class="el-mono">{{ withUnit(I(row).current, I(row).unit) }}</span></template>
          <template #cell-target="{ row }"><span class="el-mono">{{ targetText(I(row)) }}</span></template>
          <template #cell-strength="{ row }">
            <span tabindex="0" :title="`Kekuatan bukti ${sourceText(I(row))}`"><UiStatus :tone="STRENGTH[I(row).strength].tone">{{ STRENGTH[I(row).strength].text }}</UiStatus></span><span class="el-sr-only">, kekuatan bukti {{ sourceText(I(row)) }}</span>
          </template>
        </UiDataTable>
        <div class="el-grid el-grid-2 lim-gap">
          <UiCard as="section" aria-label="Estimasi nilai">
            <h2 class="el-h3">Estimasi nilai (ilustratif)</h2>
            <template v-if="data.valueEstimate">
              <div class="el-muted lim-small">{{ data.valueEstimate.label }}</div>
              <div class="lim-big">{{ data.valueEstimate.value }}</div>
              <p v-if="data.valueEstimate.note" class="el-muted lim-small">{{ data.valueEstimate.note }}</p>
            </template>
            <p v-else class="el-muted">Belum diisi.</p>
            <p class="el-muted lim-small">Nilai finansial tidak dipaksakan; tampilkan bila program memang butuh ROI.</p>
          </UiCard>
          <UiCard as="section" aria-label="Faktor lain yang perlu dicek">
            <h2 class="el-h3">Faktor lain yang perlu dicek</h2>
            <p v-if="!data.factors.length" class="el-muted">Belum ada faktor lain yang dicatat.</p>
            <p v-for="(f, i) in data.factors" :key="i" class="lim-factor">{{ f }}</p>
          </UiCard>
        </div>
      </div>

      <div v-else-if="tab === 'ai'" id="lim-panel-ai" role="tabpanel" aria-labelledby="lim-tab-ai">
        <UiAgentCard v-if="!viewing" title="Pengukuran dampak">AI mewawancarai ulang karyawan beberapa pekan setelah belajar untuk memastikan hasil belajar bertahan, membandingkannya dengan kinerja kerja, lalu menghubungkannya ke hasil bisnis tim.</UiAgentCard>
        <UiNote v-if="!isHr" class="lim-gap">Antrean wawancara ulang dikelola HR. Hasilnya masuk ke tab Ringkasan dan Per kompetensi.</UiNote>
        <ReinterviewResult v-else-if="viewing" class="lim-gap" :plan-id="planId" :user-id="viewing.userId" :name="viewing.name" @back="viewing = null" @saved="saved(viewing.name)" />
        <template v-else-if="queue">
          <div class="lim-row lim-gap">
            <label class="el-label">Tanggal wawancara ulang<input v-model="date" class="el-input" type="date"></label>
            <UiButton v-if="pending.length" variant="tonal" size="sm" :disabled="busy" @click="schedule(pending.map((r) => r.userId), date)">Jadwalkan {{ pending.length }} yang sudah waktunya</UiButton>
          </div>
          <UiDataTable class="lim-gap" :columns="QUEUE_COLS" :rows="queue.map(asRow)" row-key="userId" caption="Antrean wawancara ulang" caption-hidden empty-text="Belum ada karyawan dengan skor post dari Learning Delivery.">
            <template #cell-name="{ row }"><b>{{ Q(row).name }}</b></template>
            <template #cell-competencies="{ row }">{{ Q(row).competencies.map((c) => c.name).join(', ') }}</template>
            <template #cell-status="{ row }">
              <UiStatus :tone="QUEUE_STATUS[Q(row).status].tone">{{ QUEUE_STATUS[Q(row).status].text }}</UiStatus>
              <div v-if="Q(row).window" class="el-muted lim-small">{{ WINDOW[Q(row).window!] }}</div>
              <div v-if="Q(row).score !== null" class="el-muted lim-small">Skor {{ Q(row).score }}</div>
            </template>
            <template #cell-dueFrom="{ row }">
              <span v-if="Q(row).scheduledOn" class="el-mono">{{ tanggal(Q(row).scheduledOn) }}</span>
              <span v-else-if="Q(row).dueFrom" class="el-muted lim-small">{{ tanggal(Q(row).dueFrom) }} – {{ tanggal(Q(row).dueUntil) }}</span>
              <span v-else class="el-muted lim-small">Tanggal selesai belajar belum diketahui</span>
            </template>
            <template #cell-aksi="{ row }">
              <UiButton v-if="Q(row).canView && canReinterview" variant="tonal" size="sm" :aria-label="`Lihat hasil ${Q(row).name}`" @click="viewing = Q(row)">Lihat hasil</UiButton>
              <span v-if="Q(row).status !== 'done'" class="lim-actions">
                <UiButton v-if="Q(row).status === 'scheduled' && canReinterview" variant="tonal" size="sm" :disabled="busy || started[Q(row).userId]" :aria-label="`Mulai sekarang ${Q(row).name}`" @click="startNow(Q(row))">{{ started[Q(row).userId] ? 'Sudah dikabari' : 'Mulai sekarang' }}</UiButton>
                <UiButton v-else variant="tonal" size="sm" :disabled="busy || !Q(row).postCompletedOn" :aria-label="`Jadwalkan ${Q(row).name}`" @click="schedule([Q(row).userId], date)">Jadwalkan</UiButton>
                <UiButton v-if="Q(row).status === 'scheduled'" variant="text" size="sm" :disabled="busy" :aria-label="`Batalkan jadwal ${Q(row).name}`" @click="schedule([Q(row).userId], null)">Batalkan</UiButton>
              </span>
            </template>
          </UiDataTable>
          <UiNote class="lim-gap">Wawancara ulang dijadwalkan 4 sampai 6 pekan setelah belajar. Karyawan mengerjakannya sendiri dari menu Wawancara ulang setelah dijadwalkan.</UiNote>
        </template>
      </div>
    </template>
  </AppShell>
</template>

