<script setup lang="ts">
// Pengelolaan TNA (dulu views/TnaView.vue, POC): dipicu target OKR/KPI/SLA yang tidak tercapai (RG-2). Tampilan menyesuaikan peran (RG-3).
// Dipasang di `/tna` saat papan gap mati, atau di `/tna/kelola` (TnaKelolaView) saat papan menyala (paritas P5, TN-2).
// Isi, label, dan data-testid dipertahankan; gaya memakai komponen Ui* dan token --el-* (tanpa Tailwind).
// HR wajib memilih siapa yang diwawancarai karena BT-29 belum diputuskan (tidak ada pilihan bawaan).
import { computed, onMounted, ref } from 'vue'
import ImportPanel from '@/components/ImportPanel.vue'
import TnaMySessions from './TnaMySessions.vue'
import { UiButton, UiCard, UiDataTable, UiField, UiKpiCard, UiNote, type UiColumn } from '@/ui'
import {
  lna, COURSE_STATUS_LABEL, PLAN_STATUS_LABEL, PLAN_NEXT, FLAG_TRAINING_REQUEST, FLAG_NON_TRAINING_HR, formatWib,
  type Finding, type NonTrainingFinding, type NonTrainingGrant, type ParetoRow, type PlanItem, type Project, type Session, type TnaDashboard,
} from '@/api/lna'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const dash = ref<TnaDashboard | null>(null)
const pareto = ref<ParetoRow[]>([])
const findings = ref<Finding[]>([])
const nonTraining = ref<NonTrainingFinding[]>([])
const grants = ref<NonTrainingGrant[]>([])
const supervisors = ref<{ id: string; name: string | null; email: string }[]>([])
const grantPick = ref('')
const supervisorGranted = ref(false)
const plan = ref<PlanItem[]>([])
const sessions = ref<Session[]>([])
const projects = ref<Project[]>([])
const error = ref('')
const notice = ref('')

const isHr = computed(() => ['hr_admin', 'eta_admin'].includes(session.role))
const isLearner = computed(() => session.role === 'learner')
// R-1: saat penugasan dari papan gap menyala, jadwal massal lama disembunyikan (penugasan lewat detail gap)
const assignmentOn = computed(() => session.hasFlag('tna.interview_assignment'))
// PM-8 B: BT-31 ditunda, tombol permintaan training hanya tampil bila flag dinyalakan
const canRequestTraining = computed(() => isLearner.value && session.hasFlag(FLAG_TRAINING_REQUEST))
// PM-6: temuan di luar pelatihan untuk HR; atasan hanya bila HR memberinya akses
const nonTrainingOn = computed(() => session.hasFlag(FLAG_NON_TRAINING_HR))
const isSupervisor = computed(() => session.role === 'supervisor')
const showNonTraining = computed(() => nonTrainingOn.value && (isHr.value || (isSupervisor.value && supervisorGranted.value)))
const ungranted = computed(() => supervisors.value.filter((s) => !grants.value.some((g) => g.supervisorId === s.id)))
// Q38: undangan yang belum selesai, untuk dipantau dan diperpanjang HR
const openInvites = computed(() => sessions.value.filter((s) => s.status === 'scheduled' || s.status === 'in_progress'))
const isExpired = (s: Session) => !!s.inviteExpiresAt && new Date(s.inviteExpiresAt).getTime() <= Date.now()
const statusOptions = (p: PlanItem) => [p.status, ...(PLAN_NEXT[p.status] ?? [])]
const INVITE_COLUMNS: UiColumn[] = [
  { key: 'intervieweeName', label: 'Karyawan' }, { key: 'status', label: 'Status' }, { key: 'inviteExpiresAt', label: 'Berlaku sampai' }, { key: 'aksi', label: 'Tindakan' },
]
const PARETO_COLUMNS: UiColumn[] = [
  { key: 'label', label: 'Kebutuhan' }, { key: 'people', label: 'Orang', mono: true }, { key: 'score', label: 'Skor', mono: true }, { key: 'cumulativeShare', label: 'Kumulatif', mono: true },
]
const asSession = (r: Record<string, unknown>) => r as unknown as Session

// Impor & penjadwalan (HR)
const period = ref('')
const projectId = ref('')
const scope = ref<'red_only' | 'all_members'>('red_only')
const jobRoleId = ref('')
const jobRoles = ref<{ id: string; name: string }[]>([])
let defaultsApplied = false

async function load() {
  error.value = ''
  try {
    const tasks: Promise<unknown>[] = [
      lna.tnaDashboard().then((r) => (dash.value = r.data)),
      lna.findings().then((r) => (findings.value = r.data)),
      lna.planItems().then((r) => (plan.value = r.data)),
      lna.sessions('tna').then((r) => (sessions.value = r.data)),
    ]
    if (!isLearner.value) tasks.push(lna.pareto().then((r) => (pareto.value = r.data)))
    if (nonTrainingOn.value && isSupervisor.value) supervisorGranted.value = (await lna.nonTrainingAccessMe()).data.granted
    if (showNonTraining.value) tasks.push(lna.nonTrainingFindings().then((r) => (nonTraining.value = r.data)))
    if (nonTrainingOn.value && isHr.value) tasks.push(lna.nonTrainingAccess().then((r) => { grants.value = r.data; supervisors.value = r.supervisors }))
    if (isHr.value) {
      tasks.push(lna.projects().then((r) => (projects.value = r.data)))
      tasks.push(lna.tnaJobRoles().then((r) => {
        jobRoles.value = r.data
        // Cakupan default mengikuti konfigurasi klien (BT-29), hanya saat pertama dimuat
        if (!defaultsApplied && r.defaults) {
          defaultsApplied = true
          if (r.defaults.scope) scope.value = r.defaults.scope
          if (r.defaults.jobRoleId) jobRoleId.value = r.defaults.jobRoleId
        }
      }))
    }
    await Promise.all(tasks)
  } catch (e) { error.value = (e as Error).message }
}
onMounted(load)

async function act(fn: () => Promise<string>) {
  error.value = ''; notice.value = ''
  try { notice.value = await fn(); await load() } catch (e) { error.value = (e as Error).message }
}

const schedule = () => act(async () => {
  if (scope.value === 'all_members' && !jobRoleId.value) throw new Error('Pilih job role yang semua karyawannya akan diwawancarai.')
  const r = (await lna.scheduleTna(projectId.value, { scope: scope.value, period: period.value.trim(), jobRoleId: jobRoleId.value || undefined })).data
  return `${r.scheduled} wawancara dijadwalkan${r.skipped ? `, ${r.skipped} sudah terjadwal sebelumnya` : ''}.`
})
const planFinding = (id: string) => act(async () => {
  const r = (await lna.planFinding(id)).data
  return r.needsModule ? 'Modul belum ada di katalog; training plan ditandai perlu modul baru.' : `Training plan dibuat: ${r.catalogItemTitle}.`
})
const requestTraining = (id: string) => act(async () => {
  await lna.requestTraining(id, 'Diajukan dari hasil TNA')
  return 'Permintaan training terkirim.'
})
const extend = (s: Session) => act(async () => {
  const r = (await lna.extendInvite(s.id, 7)).data
  return `Undangan ${s.intervieweeName ?? ''} diperpanjang sampai ${formatWib(r.inviteExpiresAt)} WIB.`
})
const grant = () => act(async () => {
  if (!grantPick.value) throw new Error('Pilih atasan yang akan diberi akses.')
  await lna.grantNonTraining(grantPick.value)
  grantPick.value = ''
  return 'Akses atasan diberikan.'
})
const revoke = (g: NonTrainingGrant) => act(async () => {
  await lna.revokeNonTraining(g.supervisorId)
  return `Akses ${g.supervisorName ?? g.supervisorEmail} dicabut.`
})
const setStatus = (id: string, status: string) => act(async () => {
  await lna.setPlanStatus(id, status)
  return 'Status diperbarui.'
})
const target = (f: Finding) => (f.metricName ? `${f.metricName}: target ${f.target}, realisasi ${f.actual}` : '')
</script>

<template>
  <div class="tna-stack">
    <p class="el-muted">Kebutuhan training dari target OKR/KPI/SLA yang belum tercapai.</p>
    <p v-if="error" role="alert" class="tna-alert">{{ error }}</p>
    <p v-if="notice" role="status" class="tna-notice">{{ notice }}</p>

    <!-- PK-14: temuan AI menunggu review HR sebelum tampil (PM-5 ★A) -->
    <UiNote v-if="isHr && dash?.reviewPending" tone="warning" data-testid="tna-review-banner">
      <div class="tna-row">
        <div>
          <div class="tna-strong">{{ dash.reviewPending }} temuan AI dari wawancara TNA menunggu review</div>
          <div>Temuan baru tampil ke atasan dan karyawan, dan baru dihitung di dashboard, setelah Anda setujui.</div>
        </div>
        <UiButton size="sm" to="/m/tna/review">Review</UiButton>
      </div>
    </UiNote>
    <p v-else-if="isHr"><RouterLink to="/m/tna/review" class="tna-a">Riwayat review hasil AI</RouterLink></p>

    <TnaMySessions :sessions="sessions" />

    <div v-if="dash" class="el-grid el-grid-4" data-testid="tna-stats">
      <UiKpiCard label="Target merah" :value="dash.redTargets" />
      <UiKpiCard label="Wawancara selesai" :value="dash.sessions?.completed ?? 0" />
      <UiKpiCard label="Kebutuhan training" :value="dash.trainingFindings" />
      <UiKpiCard label="Item training plan" :value="plan.length" />
    </div>

    <!-- R3-3: data kinerja (mis. ekspor HappyFive) dan data karyawan lewat file XLSX/CSV. ImportPanel bersama belum dimigrasi (p5-lna.md) -->
    <ImportPanel v-if="isHr" submodule="tna" :projects="projects" data-import-panel @imported="load" />

    <UiCard v-if="isHr && !assignmentOn" as="form" class="tna-form" @submit.prevent="schedule">
      <h2 class="tna-h2">Jadwalkan wawancara TNA</h2>
      <UiField id="tna-periode" v-slot="{ attrs }" label="Periode"><input v-bind="attrs" v-model="period" required class="el-input" placeholder="2026-11" /></UiField>
      <UiField id="tna-proyek" v-slot="{ attrs }" label="Proyek">
        <select v-bind="attrs" v-model="projectId" required class="el-input">
          <option value="" disabled>Pilih proyek</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </UiField>
      <fieldset class="tna-fieldset">
        <legend>Siapa yang diwawancarai?</legend>
        <label class="el-check"><input v-model="scope" type="radio" value="red_only" /> Hanya karyawan dengan target merah</label>
        <label class="el-check"><input v-model="scope" type="radio" value="all_members" /> Semua karyawan di job role tertentu</label>
      </fieldset>
      <UiField id="tna-jobrole" v-slot="{ attrs }" :label="`Job role${scope === 'all_members' ? '' : ' (opsional)'}`">
        <select v-bind="attrs" v-model="jobRoleId" class="el-input">
          <option value="">{{ scope === 'all_members' ? 'Pilih job role' : 'Semua job role' }}</option>
          <option v-for="j in jobRoles" :key="j.id" :value="j.id">{{ j.name }}</option>
        </select>
      </UiField>
      <p class="el-muted tna-small" data-testid="tna-scope-note">Target merah pada periode di atas menjadi bahan pembahasan. TNA tidak memerlukan hasil DACUM.</p>
      <div><UiButton type="submit">Jadwalkan</UiButton></div>
    </UiCard>

    <UiCard v-if="isHr && openInvites.length">
      <h2 class="tna-h2">Undangan wawancara berjalan</h2>
      <p class="el-muted tna-small">Berlaku 7 hari. Pengingat email otomatis H-3 dan H-1.</p>
      <UiDataTable :columns="INVITE_COLUMNS" :rows="openInvites" row-key="id" caption="Undangan wawancara berjalan" caption-hidden data-testid="tna-invites" class="tna-gap-t">
        <template #cell-intervieweeName="{ row }">{{ row.intervieweeName }}</template>
        <template #cell-status="{ row }">{{ row.status === 'scheduled' ? 'Belum mulai' : 'Berjalan' }}</template>
        <template #cell-inviteExpiresAt="{ row }">
          <span :class="{ 'tna-crit': isExpired(asSession(row)) }">{{ row.inviteExpiresAt ? `${formatWib(asSession(row).inviteExpiresAt!)} WIB` : '-' }}{{ isExpired(asSession(row)) ? ' (berakhir)' : '' }}</span>
        </template>
        <template #cell-aksi="{ row }"><UiButton variant="text" size="sm" @click="extend(asSession(row))">Perpanjang 7 hari</UiButton></template>
      </UiDataTable>
    </UiCard>

    <UiCard v-if="!isLearner && pareto.length">
      <h2 class="tna-h2">Prioritas kebutuhan training</h2>
      <UiDataTable :columns="PARETO_COLUMNS" :rows="pareto" row-key="key" caption="Prioritas kebutuhan training" caption-hidden data-testid="tna-pareto">
        <template #cell-cumulativeShare="{ row }">{{ Math.round(Number(row.cumulativeShare) * 100) }}%</template>
      </UiDataTable>
    </UiCard>

    <UiCard>
      <h2 class="tna-h2">{{ isLearner ? 'Hasil TNA Anda' : 'Kebutuhan training' }}</h2>
      <p v-if="!findings.length" class="el-muted">Belum ada hasil.<template v-if="!isHr"> Hasil wawancara tampil setelah direview HR.</template></p>
      <ul class="tna-items" data-testid="tna-findings">
        <li v-for="f in findings" :key="f.id">
          <div>
            <div>{{ f.title }}<span v-if="!isLearner" class="el-muted"> · {{ f.userName }}</span></div>
            <div class="el-muted tna-small">{{ f.competencyName ?? 'Kompetensi belum terpetakan' }}<template v-if="target(f)"> · {{ target(f) }}</template></div>
          </div>
          <UiButton v-if="isHr && f.status === 'open'" variant="text" size="sm" @click="planFinding(f.id)">Buat training plan</UiButton>
          <UiButton v-if="canRequestTraining" variant="text" size="sm" @click="requestTraining(f.id)">Minta training</UiButton>
        </li>
      </ul>
    </UiCard>

    <UiCard v-if="showNonTraining" data-testid="tna-non-training">
      <h2 class="tna-h2">Temuan di luar pelatihan</h2>
      <p class="el-muted tna-small">{{ isHr ? 'Terlihat oleh HR dan atasan yang Anda beri akses' : 'Akses diberikan HR untuk tim Anda' }}. Bukan kebutuhan training, jadi tidak dibuatkan rencana aksi di ELGOS.</p>
      <p v-if="!nonTraining.length" class="el-muted">Belum ada temuan.</p>
      <ul class="tna-items">
        <li v-for="f in nonTraining" :key="f.id">
          <div>
            <div>{{ f.title }}<span class="el-muted"> · {{ f.userName }}</span></div>
            <div v-if="f.metricName || f.linkedTrainingTitle" class="el-muted tna-small">
              <template v-if="f.metricName">{{ f.metricName }}</template><template v-if="f.metricName && f.linkedTrainingTitle"> · </template><template v-if="f.linkedTrainingTitle">terkait: {{ f.linkedTrainingTitle }}</template>
            </div>
          </div>
        </li>
      </ul>
      <div v-if="isHr" class="tna-subsection" data-testid="tna-non-training-access">
        <h3 class="el-h3">Akses atasan</h3>
        <ul class="tna-items">
          <li v-for="g in grants" :key="g.supervisorId">
            <span>{{ g.supervisorName ?? g.supervisorEmail }}</span>
            <UiButton variant="outlined" size="sm" @click="revoke(g)">Cabut akses</UiButton>
          </li>
        </ul>
        <p v-if="!grants.length" class="el-muted tna-small">Belum ada atasan yang diberi akses.</p>
        <form v-if="ungranted.length" class="tna-inline" @submit.prevent="grant">
          <select v-model="grantPick" class="el-input tna-inline__select" aria-label="Atasan">
            <option value="" disabled>Pilih atasan</option>
            <option v-for="sp in ungranted" :key="sp.id" :value="sp.id">{{ sp.name ?? sp.email }}</option>
          </select>
          <UiButton type="submit" size="sm">Beri akses</UiButton>
        </form>
      </div>
    </UiCard>

    <UiCard v-if="plan.length">
      <h2 class="tna-h2">Training plan</h2>
      <ul class="tna-items" data-testid="tna-plan">
        <li v-for="p in plan" :key="p.id">
          <div>
            <div>
              <a v-if="p.catalogItemUrl" :href="p.catalogItemUrl" target="_blank" rel="noopener noreferrer" class="tna-a">{{ p.catalogItemTitle }}</a>
              <template v-else>{{ p.catalogItemTitle ?? p.findingTitle ?? p.note }}</template>
              <span v-if="!isLearner" class="el-muted"> · {{ p.userName }}</span>
            </div>
            <div class="el-muted tna-small">
              {{ p.origin === 'learner_request' ? 'Diminta karyawan' : 'Usulan' }}<template v-if="p.needsModule"> · perlu modul baru</template><template v-if="p.courseStatus"> · Course: {{ COURSE_STATUS_LABEL[p.courseStatus] ?? p.courseStatus }}</template>
            </div>
          </div>
          <select v-if="!isLearner && statusOptions(p).length > 1" :value="p.status" class="el-input tna-inline__select" :aria-label="`Status ${p.id}`" @change="setStatus(p.id, ($event.target as HTMLSelectElement).value)">
            <option v-for="k in statusOptions(p)" :key="k" :value="k">{{ PLAN_STATUS_LABEL[k] ?? k }}</option>
          </select>
          <span v-else class="tna-small">{{ PLAN_STATUS_LABEL[p.status] ?? p.status }}</span>
        </li>
      </ul>
    </UiCard>
  </div>
</template>
