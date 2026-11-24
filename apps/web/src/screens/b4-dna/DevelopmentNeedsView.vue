<script setup lang="ts">
// B4 Developmental Needs: ringkasan, kamus per job function, kurikulum BIA, dan kebutuhan per pegawai.
// Mengikuti layar "Developmental Needs" mockup final. Skor memakai skala kamus 0-4.
import { computed, onMounted, ref, watch } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { useSessionStore } from '@/stores/session'
import { UiAgentCard, UiBreadcrumb, UiButton, UiCard, UiChip, UiDataTable, UiErrorSummary, UiKpiCard, UiNote, UiProgressBar, UiSegmented, UiTabs, type UiColumn } from '@/ui'
import { dnaApi, STAGE_LABEL, TIER_LABEL, type Curriculum, type DevelopmentPlan, type Dictionary, type EmployeeNeed, type Overview, type PlanModule, type Stage } from './api'

const session = useSessionStore()
const isHr = computed(() => session.user?.role === 'hr_admin')

const TABS = [
  { key: 'dash', label: 'Ringkasan' }, { key: 'kamus', label: 'Kamus kompetensi' },
  // Paritas P5 DN-3: label tab mockup
  { key: 'kur', label: 'Kurikulum Basic · Intermediate · Advanced' }, { key: 'peg', label: 'Kebutuhan pengembangan pegawai' },
]
const tab = ref('dash')
const error = ref('')
const loading = ref(true)

const overview = ref<Overview | null>(null)
const jobId = ref<string | null>(null)
const job = computed(() => overview.value?.jobs.find((j) => j.id === jobId.value) ?? null)

const dictionary = ref<Dictionary | null>(null)
const jobFunctionId = ref<string | null>(null)
const tier = ref('all')
const TIER_OPTIONS = [{ key: 'all', label: 'Semua' }, { key: 'basic', label: 'Basic' }, { key: 'intermediate', label: 'Intermediate' }, { key: 'advanced', label: 'Advanced' }]
const curriculum = ref<Curriculum | null>(null)
const employees = ref<EmployeeNeed[] | null>(null)
const plan = ref<DevelopmentPlan | null>(null)
const approving = ref(false)
const approvedMessage = ref('')

async function guard<T>(fn: () => Promise<T>): Promise<T | null> {
  error.value = ''
  try { return await fn() } catch (e) { error.value = e instanceof Error ? e.message : 'Terjadi kesalahan'; return null }
}

async function loadOverview(id?: string | null) {
  const data = await guard(() => dnaApi.overview(id))
  if (!data) return
  overview.value = data
  jobId.value = data.selectedJobRoleId
}
async function loadDictionary() {
  if (!jobId.value) return
  const id = jobId.value
  const data = await guard(() => dnaApi.dictionary(id, jobFunctionId.value, tier.value === 'all' ? null : tier.value))
  if (data) dictionary.value = data
}
async function loadTab() {
  const id = jobId.value
  if (!id) return
  if (tab.value === 'kamus') await loadDictionary()
  else if (tab.value === 'kur') { const data = await guard(() => dnaApi.curriculum(id)); if (data) curriculum.value = data }
  else if (tab.value === 'peg') {
    const data = await guard(() => dnaApi.employees(id))
    if (data) { employees.value = data; plan.value = null; if (data[0]) await openPlan(data[0].id) }
  }
}
async function pickJob(id: string) {
  if (id === jobId.value) return
  jobFunctionId.value = null; dictionary.value = null; curriculum.value = null; employees.value = null; plan.value = null
  await loadOverview(id)
  await loadTab()
}
// Review egm 24 Nov: rencana yang tiba belakangan tidak menimpa pegawai yang dipilih sesudahnya
let planSeq = 0
async function openPlan(userId: string) {
  const seq = ++planSeq
  const data = await guard(() => dnaApi.plan(userId))
  if (data && seq === planSeq) plan.value = data
}
async function approve() {
  if (!jobId.value) return
  approving.value = true
  const id = jobId.value
  const res = await guard(() => dnaApi.approveDictionary(id))
  approving.value = false
  if (!res) return
  approvedMessage.value = `${res.approved} kompetensi disahkan.`
  await Promise.all([loadOverview(id), loadDictionary()])
}

onMounted(async () => { await loadOverview(); loading.value = false })
watch(tab, loadTab)
watch([jobFunctionId, tier], loadDictionary)

const DICT_COLUMNS: UiColumn[] = [
  { key: 'code', label: 'Kode', sortable: true, mono: true }, { key: 'name', label: 'Kompetensi', sortable: true },
  { key: 'stream', label: 'Rumpun', sortable: true }, { key: 'programTier', label: 'Level', sortable: true },
  { key: 'requiredScore', label: 'Target', sortable: true, align: 'right', mono: true },
]
const NEED_COLUMNS: UiColumn[] = [
  { key: 'name', label: 'Pegawai', sortable: true }, { key: 'stage', label: 'Tahap saat ini', sortable: true },
  // DN-12: empat kolom mockup; rencana dibuka lewat klik baris
  { key: 'met', label: 'Modul tercapai', mono: true }, { key: 'focus', label: 'Fokus pengembangan' },
]
// DN-9: catatan kamus format mockup "{jabatan} · JF{n}: {nama} ({a} dari {b} modul sudah memiliki data asesmen)"
const kamusNote = computed(() => {
  const d = dictionary.value
  if (!d) return ''
  const jf = d.jobFunctions.find((f) => f.id === jobFunctionId.value)
  const asesmen = `(${d.dictionary.assessedCompetencyCount} dari ${d.dictionary.competencyCount} modul sudah memiliki data asesmen)`
  return jf ? `${d.jobRole.name} · JF${jf.order}: ${jf.name} ${asesmen}` : `${d.jobRole.name} ${asesmen}`
})
// DN-5: note KPI "{n} lainnya belum dibuat"
const jobsWithoutDictionary = computed(() => (overview.value ? overview.value.kpi.jobsTotal - overview.value.kpi.jobsWithDictionary : 0))
// DN-13: warna chip per tahap seperti mockup (Basic kuning, Intermediate biru, Tuntas hijau)
const STAGE_TONE: Record<Stage, 'review' | 'training' | 'improvement' | 'success' | 'neutral'> = { basic: 'review', intermediate: 'training', advanced: 'improvement', done: 'success', not_assessed: 'neutral' }
const stageTone = (s: Stage) => STAGE_TONE[s] ?? 'neutral'
const moduleChip = (m: PlanModule): { tone: 'success' | 'review' | 'neutral'; label: string } => {
  if (m.status === 'met') return { tone: 'success', label: 'Tercapai' }
  if (m.status === 'develop') return { tone: 'review', label: 'Perlu dikembangkan' }
  if (m.status === 'locked') return { tone: 'neutral', label: 'Belum dibuka' }
  return { tone: 'neutral', label: 'Belum dinilai' }
}
</script>

<template>
  <AppShell>
    <UiBreadcrumb :items="[{ label: 'Learning Needs Analysis' }, { label: 'Developmental Needs' }]" />
    <h1 class="el-h1">Developmental Needs</h1>
    <p class="el-muted" style="margin:0 0 16px">Proaktif: kebutuhan pengembangan setiap jabatan berdasarkan kamus kompetensi dan tingkat Basic, Intermediate, Advanced (BIA).</p>
    <!-- Tanpa tombol: layar validasi kamus lewat AI belum ada (paritas P3, K-P3-2) -->
    <UiAgentCard title="Validasi kamus kompetensi" data-testid="dn-agen">
      AI mewawancarai atasan pemilik jabatan untuk memvalidasi hasil DACUM, lalu karyawan jabatan itu untuk menilai posisi mereka pada tingkat Basic, Intermediate, Advanced.
    </UiAgentCard>

    <UiErrorSummary v-if="error" :errors="[{ message: error }]" style="margin-bottom:16px" />
    <p v-if="loading" class="el-muted">Memuat…</p>

    <template v-else-if="overview">
      <div class="dn-jobs" role="group" aria-label="Jabatan" data-testid="dn-jobs">
        <span class="el-muted" style="font-weight:500">Jabatan:</span>
        <button
          v-for="j in overview.jobs" :key="j.id" type="button" class="dn-job" :class="{ 'dn-job--on': j.id === jobId }"
          :disabled="j.dictionary === 'none'" :aria-pressed="j.id === jobId" @click="pickJob(j.id)"
        >
          {{ j.name }}
          <UiChip :tone="j.dictionary === 'available' ? 'success' : 'neutral'">{{ j.dictionary === 'available' ? 'Kamus tersedia' : 'Belum tersedia' }}</UiChip>
        </button>
      </div>

      <UiNote v-if="!job" tone="info" data-testid="dn-empty">
        Belum ada jabatan yang punya kamus kompetensi. Kamus dibuat dari hasil DACUM lewat impor kamus kompetensi.
        <RouterLink :to="{ name: 'dna-poc' }">Buka impor dan data asesmen</RouterLink>
      </UiNote>

      <template v-else>
        <UiNote tone="info" style="margin-bottom:8px">
          <b>Hanya untuk jabatan {{ job.name }}.</b> Kamus kompetensi dan kurikulum BIA di halaman ini berlaku untuk jabatan tersebut saja.
          Jabatan lain akan muncul di pilihan di atas setelah kamusnya dibuat lewat DACUM.
        </UiNote>
        <UiTabs id="dn" v-model="tab" :tabs="TABS" label="Bagian Developmental Needs" />

        <div v-if="tab === 'dash'" id="dn-panel-dash" role="tabpanel" aria-labelledby="dn-tab-dash" data-testid="dn-dash">
          <div class="el-grid el-grid-4">
            <UiKpiCard label="Pegawai" :value="overview.kpi.employees" :note="job.name" />
            <UiKpiCard label="Job function" :value="overview.kpi.jobFunctions" note="Hasil DACUM" />
            <UiKpiCard label="Modul kompetensi" :value="overview.kpi.competencies" note="DACUM Tool 2 dan 3" />
            <UiKpiCard label="Jabatan dengan kamus" :value="`${overview.kpi.jobsWithDictionary} / ${overview.kpi.jobsTotal}`" :note="jobsWithoutDictionary > 0 ? `${jobsWithoutDictionary} lainnya belum dibuat` : undefined" />
          </div>
          <div class="el-grid el-grid-2" style="margin-top:16px;align-items:start">
            <UiCard>
              <h2 class="el-h3">Pegawai per tahap pengembangan</h2>
              <div v-for="d in overview.stageDistribution" :key="d.stage" style="margin-bottom:10px">
                <div class="dn-between"><span>{{ STAGE_LABEL[d.stage] }}</span><span class="el-mono">{{ d.count }} pegawai</span></div>
                <UiProgressBar :value="d.percent" :label="`${STAGE_LABEL[d.stage]}: ${d.count} pegawai`" />
              </div>
              <p class="el-muted" style="font-size:12px">Tahap ditentukan oleh modul pada level terendah yang belum mencapai target. Modul yang belum dinilai tidak ikut dihitung.</p>
              <UiButton variant="tonal" size="sm" @click="tab = 'peg'">Lihat kebutuhan per pegawai</UiButton>
            </UiCard>
            <UiCard data-testid="dn-status">
              <h2 class="el-h3">Status kamus {{ job.name }}</h2>
              <div class="dn-chips">
                <UiChip :tone="overview.dictionary.tool1 ? 'success' : 'neutral'">Tool 1 · Job Competency Model</UiChip>
                <UiChip :tone="overview.dictionary.tool2 ? 'success' : 'neutral'">Tool 2 · KSA</UiChip>
                <UiChip :tone="overview.dictionary.tool3 ? 'success' : 'neutral'">Tool 3 · Learning Roadmap</UiChip>
              </div>
              <!-- DN-6: copy mockup; hitungan asesmen pindah ke catatan tab Kamus (DN-9) -->
              <p class="el-muted">
                {{ overview.dictionary.approved ? 'Kamus sudah disahkan HR.' : 'Kamus disusun dari lokakarya DACUM dan menunggu pengesahan HR sebelum dipakai sebagai target di Training Needs.' }}
              </p>
              <UiButton variant="tonal" size="sm" @click="tab = 'kamus'">Buka kamus kompetensi</UiButton>
            </UiCard>
          </div>
          <p style="margin-top:16px"><RouterLink :to="{ name: 'dna-poc' }">Impor data dan hasil asesmen per karyawan</RouterLink></p>
        </div>

        <div v-else-if="tab === 'kamus'" id="dn-panel-kamus" role="tabpanel" aria-labelledby="dn-tab-kamus" data-testid="dn-kamus">
          <div v-if="dictionary" class="dn-kamus">
            <UiCard>
              <h2 class="el-h3">Job function · {{ dictionary.jobRole.name }}</h2>
              <p v-if="!dictionary.jobFunctions.length" class="el-muted">Belum ada job function. Tambahkan lewat impor job function.</p>
              <button
                v-for="f in dictionary.jobFunctions" :key="f.id" type="button" class="dn-mod dn-mod--btn" :class="{ 'dn-mod--on': f.id === jobFunctionId }"
                :aria-pressed="f.id === jobFunctionId" @click="jobFunctionId = f.id === jobFunctionId ? null : f.id"
              >
                <span style="font-weight:500">JF{{ f.order }}</span>
                <span class="el-muted" style="font-size:13px">{{ f.name }} · {{ f.competencyCount }} kompetensi</span>
              </button>
            </UiCard>
            <div>
              <div class="dn-between" style="margin-bottom:12px">
                <span class="el-muted" data-testid="dn-kamus-note">{{ kamusNote }}</span>
                <UiSegmented v-model="tier" :options="TIER_OPTIONS" label="Level program" />
              </div>
              <UiDataTable :columns="DICT_COLUMNS" :rows="dictionary.competencies" row-key="id" caption="Kamus kompetensi" caption-hidden empty-text="Tidak ada kompetensi untuk pilihan ini.">
                <template #cell-code="{ value }">{{ value ?? '–' }}</template>
                <template #cell-stream="{ value }"><span class="el-muted">{{ value ?? '–' }}</span></template>
                <template #cell-programTier="{ row }"><UiChip>{{ row.programTier ? TIER_LABEL[row.programTier] : 'Belum ditentukan' }}</UiChip></template>
              </UiDataTable>
              <div class="dn-between" style="margin-top:12px">
                <span class="el-muted" style="font-size:12px">
                  {{ dictionary.dictionary.approved ? 'Kamus sudah disahkan HR.' : `${dictionary.dictionary.approvedCount} dari ${dictionary.dictionary.competencyCount} kompetensi sudah disahkan.` }}
                  Target memakai skala 0-4.
                </span>
                <UiButton v-if="isHr && !dictionary.dictionary.approved" size="sm" :disabled="approving" @click="approve">Sahkan kamus</UiButton>
              </div>
              <p v-if="approvedMessage" role="status" class="el-muted" style="margin-top:8px">{{ approvedMessage }}</p>
            </div>
          </div>
        </div>

        <div v-else-if="tab === 'kur'" id="dn-panel-kur" role="tabpanel" aria-labelledby="dn-tab-kur" data-testid="dn-kur">
          <template v-if="curriculum">
            <p class="el-muted" style="margin:0 0 16px">Kurikulum Basic · Intermediate · Advanced untuk {{ curriculum.jobRole.name }} (DACUM Tool 3). Penyediaan modulnya ada di Learning Intervention.</p>
            <UiNote v-if="curriculum.untiered" tone="warning" style="margin-bottom:12px">{{ curriculum.untiered }} kompetensi belum punya level program, jadi belum masuk kurikulum.</UiNote>
            <div class="el-grid el-grid-3" style="align-items:start">
              <UiCard v-for="t in curriculum.tiers" :key="t.tier" tonal>
                <h2 class="el-h3">{{ TIER_LABEL[t.tier] }} · {{ t.count }} modul</h2>
                <p v-if="!t.modules.length" class="el-muted">Belum ada modul.</p>
                <div v-for="m in t.modules" :key="m.id" class="dn-mod">
                  <span class="el-mono el-muted" style="font-size:12px">{{ m.code ?? '–' }}</span>
                  <span style="font-weight:500">{{ m.name }}</span>
                  <span v-if="m.stream"><UiChip>{{ m.stream }}</UiChip></span>
                </div>
              </UiCard>
            </div>
          </template>
        </div>

        <div v-else id="dn-panel-peg" role="tabpanel" aria-labelledby="dn-tab-peg" data-testid="dn-peg">
          <template v-if="employees">
            <p class="el-muted" style="margin:0 0 12px">Apa yang perlu dikembangkan pada setiap {{ job.name }}, berdasarkan kamus kompetensi dan tahap BIA. Klik baris untuk melihat rencana lengkap.</p>
            <UiDataTable
              :columns="NEED_COLUMNS" :rows="employees" row-key="id" caption="Kebutuhan pengembangan per pegawai" caption-hidden empty-text="Belum ada pegawai pada jabatan ini."
              :selected-key="plan?.person.id ?? null" @select="(row) => openPlan(String(row.id))"
            >
              <template #cell-name="{ row }"><button type="button" class="dn-pick" :aria-current="row.id === plan?.person.id ? 'true' : undefined" @click="openPlan(String(row.id))">{{ row.name ?? '(tanpa nama)' }}</button></template>
              <template #cell-stage="{ row }"><UiChip :tone="stageTone(row.stage)">{{ STAGE_LABEL[row.stage] }}</UiChip></template>
              <template #cell-met="{ row }">{{ row.met }} / {{ row.assessed }}<span class="el-sr-only"> modul yang dinilai</span><span v-if="row.assessed < row.total" class="el-muted" style="display:block;font-size:12px">dinilai {{ row.assessed }} dari {{ row.total }}</span></template>
              <template #cell-focus="{ row }"><span class="dn-chips" style="margin:0"><UiChip v-for="f in row.focus" :key="f" tone="review">{{ f }}</UiChip></span></template>
            </UiDataTable>
            <UiCard v-if="plan" style="margin-top:16px" data-testid="dn-plan">
              <div class="dn-between">
                <h2 class="el-h3" style="margin:0">Rencana pengembangan: {{ plan.person.name ?? '(tanpa nama)' }}</h2>
                <UiChip :tone="stageTone(plan.stage)">Tahap {{ STAGE_LABEL[plan.stage] }}</UiChip>
              </div>
              <UiNote tone="info" style="margin:12px 0">{{ plan.advice }} <span v-if="plan.assessed < plan.total">Baru {{ plan.assessed }} dari {{ plan.total }} modul yang dinilai.</span></UiNote>
              <div class="el-grid el-grid-3" style="align-items:start">
                <UiCard v-for="t in plan.tiers" :key="t.tier" tonal>
                  <h3 class="el-h3">{{ TIER_LABEL[t.tier] }}</h3>
                  <p v-if="!t.modules.length" class="el-muted">Belum ada modul.</p>
                  <div v-for="m in t.modules" :key="m.competencyId" class="dn-mod">
                    <span class="dn-between"><span class="el-mono el-muted" style="font-size:12px">{{ m.code ?? '–' }}</span><UiChip :tone="moduleChip(m).tone">{{ moduleChip(m).label }}</UiChip></span>
                    <span style="font-weight:500">{{ m.name }}</span>
                    <span class="el-mono el-muted" style="font-size:12px">{{ m.score ?? '–' }} / {{ m.target }}</span>
                  </div>
                </UiCard>
              </div>
            </UiCard>
          </template>
        </div>
      </template>
    </template>
  </AppShell>
</template>

<style>
.dn-jobs { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.dn-job {
  display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 4px 12px; border-radius: 12px; cursor: pointer;
  border: 1px solid var(--el-outline-variant); background: var(--el-surface-card); color: inherit; font: inherit;
}
.dn-job--on { border-color: var(--el-primary); box-shadow: inset 0 0 0 1px var(--el-primary); }
.dn-job:disabled { opacity: .6; cursor: not-allowed; }
.dn-job:focus-visible, .dn-mod--btn:focus-visible { outline: 2px solid var(--el-primary); outline-offset: 2px; }
.dn-between { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.dn-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.dn-kamus { display: grid; gap: 16px; align-items: start; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }
@media (max-width: 900px) { .dn-kamus { grid-template-columns: minmax(0, 1fr); } }
.dn-mod {
  display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; margin-bottom: 8px; border-radius: 12px; text-align: left;
  border: 1px solid var(--el-outline-variant); background: var(--el-surface-card);
}
.dn-mod--btn { width: 100%; cursor: pointer; color: inherit; font: inherit; }
.dn-pick { border: 0; background: none; padding: 0; font: inherit; font-weight: 500; color: inherit; cursor: pointer; text-align: left; }
.dn-pick:hover { text-decoration: underline; }
.dn-pick:focus-visible { outline: 2px solid var(--el-primary); outline-offset: 2px; }
.dn-mod--on { border-color: var(--el-primary); box-shadow: inset 0 0 0 1px var(--el-primary); }
</style>
