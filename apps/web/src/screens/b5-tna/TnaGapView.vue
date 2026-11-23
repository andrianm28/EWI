<script setup lang="ts">
// Detail gap (mockup Pak Eji, layar `gap`) dan penugasan wawancara akar masalah.
// Spek: docs/designs/b5-training-needs.md bagian 16 (aturan R9, R10, R10b).
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { formatWib } from '@/api/lna'
import { UiBreadcrumb, UiButton, UiCard, UiChip, UiDataTable, UiErrorSummary, UiField, UiKpiCard, UiStatus, type UiColumn } from '@/ui'
import { useSessionStore } from '@/stores/session'
import { routeOpen } from '@/router'
import { HR_ROLES, gaps, gapRefFromQuery, type DetailEmployee, type GapDetail, type Project } from './api'
import { CLASSIFICATION_LABEL, CLASSIFICATION_TONE, num } from './labels'
import './tna.css'

const session = useSessionStore()
const route = useRoute()
const ref_ = computed(() => gapRefFromQuery(route.query))
const backTab = computed(() => (typeof route.query.tab === 'string' ? route.query.tab : route.query.kind === 'okr' ? 'okr' : 'kompetensi'))
const isHr = computed(() => session.roles.some((r) => HR_ROLES.includes(r)))
const assignOn = computed(() => session.hasFlag('tna.interview_assignment'))
// Paritas B7 web: tinjauan per gap bila rutenya terbuka (flag tna.review_workspace), selain itu antrean lama
const reviewTo = computed(() => (routeOpen('review', session.activeView)
  ? { name: 'review', query: { ...(ref_.value as unknown as Record<string, string>), tab: backTab.value } }
  : { name: 'tna-review' }))

const d = ref<GapDetail | null>(null)
const error = ref('')
/** Galat formulir penugasan, masing-masing menaut ke field-nya (spek bagian 16: field terkait ditandai). */
const formErrors = ref<{ message: string; fieldId?: string }[]>([])
const fieldError = (fieldId: string) => formErrors.value.find((e) => e.fieldId === fieldId)?.message
const allErrors = computed(() => [...formErrors.value, ...(error.value ? [{ message: error.value }] : [])])
const notice = ref('')
const busy = ref(false)

async function load() {
  if (!ref_.value) { error.value = 'Alamat gap tidak lengkap. Buka gap dari daftar Training Needs.'; return }
  try { d.value = (await gaps.detail(ref_.value)).data } catch (e) { error.value = e instanceof ApiError ? e.message : 'Detail gap tidak bisa dimuat' }
}

// Formulir penugasan
const projects = ref<Project[]>([])
const jobRoles = ref<{ id: string; name: string }[]>([])
const projectId = ref('')
const mode = ref<'affected' | 'all_job_role'>('affected')
const jobRoleId = ref('')
const picked = ref<string[]>([])
const dueDate = ref('')
const duration = ref<15 | 30>(30)

const wibDate = (offsetDays: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(Date.now() + offsetDays * 86400_000))
const minDue = wibDate(1)
const maxDue = wibDate(30)

async function loadForm() {
  if (!assignOn.value) return
  try {
    const open = (await gaps.projects()).data.filter((p) => p.status !== 'closed')
    projects.value = open
    if (open.length === 1) projectId.value = open[0]!.id
    if (isHr.value) {
      const r = await gaps.jobRoles()
      jobRoles.value = r.data
      jobRoleId.value = r.defaults?.jobRoleId ?? ''
    }
  } catch (e) { error.value = e instanceof ApiError ? e.message : 'Data penugasan tidak bisa dimuat' }
}
onMounted(() => Promise.all([load(), loadForm()]))
watch(() => route.fullPath, () => { d.value = null; error.value = ''; formErrors.value = []; notice.value = ''; load() })

/** R10 mode affected: kompetensi gap > 0 atau OKR belum tercapai, bukan diri sendiri, tanpa sesi terbuka di proyek terpilih. */
const hasOpenHere = (e: DetailEmployee) => !!e.session?.open && (!projectId.value || e.session.projectId === projectId.value)
const eligible = computed(() => (d.value?.employees ?? []).filter((e) =>
  e.assignable && (d.value?.kind === 'okr' ? e.isMet === false : (e.gap ?? 0) > 0) && !hasOpenHere(e)))
watch(eligible, (list) => { picked.value = picked.value.filter((id) => list.some((e) => e.id === id)) })

/** Pesan API dipetakan ke field menurut kode atau kata kuncinya; selebihnya tampil tanpa tautan. */
function fieldOf(e: ApiError) {
  if (e.code === 'PROJECT_CLOSED' || /proyek/i.test(e.message)) return 'tna-project'
  if (/tenggat/i.test(e.message)) return 'tna-due'
  if (/jabatan/i.test(e.message)) return 'tna-jobrole'
  if (e.code === 'EMPLOYEE_NOT_ELIGIBLE' || e.code === 'NO_ELIGIBLE_EMPLOYEE') return 'tna-employees'
  return undefined
}
function checkForm() {
  const errs: { message: string; fieldId: string }[] = []
  if (!projectId.value) errs.push({ message: 'Pilih proyek', fieldId: 'tna-project' })
  if (mode.value === 'all_job_role' && !jobRoleId.value) errs.push({ message: 'Pilih jabatan', fieldId: 'tna-jobrole' })
  if (!dueDate.value) errs.push({ message: 'Pilih tenggat wawancara', fieldId: 'tna-due' })
  formErrors.value = errs
  return !errs.length
}

async function assign() {
  if (!ref_.value || !d.value) return
  error.value = ''; notice.value = ''
  if (!checkForm()) return
  busy.value = true
  try {
    const body = {
      projectId: projectId.value, gap: ref_.value, mode: mode.value, dueDate: dueDate.value, durationMinutes: duration.value,
      ...(mode.value === 'all_job_role' ? { jobRoleId: jobRoleId.value } : {}),
      ...(mode.value === 'affected' && picked.value.length ? { employeeIds: picked.value } : {}),
    }
    const r = (await gaps.assign(body)).data
    notice.value = `${r.assigned.length} wawancara ditugaskan${r.skipped.length ? `, ${r.skipped.length} dilewati (sudah punya sesi terbuka)` : ''}.`
    picked.value = []
    await load()
  } catch (e) {
    if (e instanceof ApiError) formErrors.value = [{ message: e.message, fieldId: fieldOf(e) }]
    else error.value = 'Penugasan gagal'
  } finally { busy.value = false }
}

const canCancel = (e: DetailEmployee) => !!e.session && e.session.status === 'scheduled' && e.session.open && !!e.session.assignedBy
  && (isHr.value || e.session.assignedBy === session.user?.id)
async function cancel(e: DetailEmployee) {
  if (!e.session) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await gaps.cancel(e.session.id)
    notice.value = `Penugasan ${e.name ?? ''} dibatalkan.`
    await load()
  } catch (err) { error.value = err instanceof ApiError ? err.message : 'Pembatalan gagal' } finally { busy.value = false }
}

const kpis = computed(() => {
  const g = d.value
  if (!g) return []
  if (g.kind === 'competency') return [{ l: 'TARGET', v: `${g.targetPct}%` }, { l: 'AKTUAL', v: `${g.actualPct}%` }, { l: 'GAP', v: `−${g.gapPct}%` }]
  return [{ l: 'TARGET', v: num(g.target, g.unit) }, { l: 'AKTUAL', v: num(g.actual, g.unit) }, { l: 'GAP', v: num(g.diff, g.unit) }]
})
const SESSION_LABEL: Record<string, string> = { scheduled: 'Ditugaskan', in_progress: 'Berjalan', completed: 'Selesai' }
const sessionText = (e: DetailEmployee) => {
  const s = e.session
  if (!s) return 'Belum ada'
  if (s.status === 'scheduled' && !s.open) return 'Undangan berakhir'
  return `${SESSION_LABEL[s.status] ?? s.status}${s.status === 'scheduled' && s.inviteExpiresAt ? ` · tenggat ${formatWib(s.inviteExpiresAt)} WIB` : ''}`
}
const valueText = (e: DetailEmployee) => {
  if (d.value?.kind === 'okr') return `${num(e.value)} / ${num(e.target)} · ${e.isMet ? 'Tercapai' : 'Belum tercapai'}`
  return e.value === null ? 'Belum dinilai' : `${e.value} / ${e.target}`
}
const cols: UiColumn[] = [
  { key: 'name', label: 'Nama', sortable: true }, { key: 'jobRoleName', label: 'Jabatan' }, { key: 'value', label: 'Nilai' },
  { key: 'session', label: 'Wawancara' }, { key: 'aksi', label: '' },
]
</script>

<template>
  <AppShell>
    <UiBreadcrumb :items="[{ label: 'Training Needs', to: { name: 'tna', query: { tab: backTab } } }, { label: 'Detail gap' }]" />
    <UiErrorSummary :errors="allErrors" />
    <template v-if="d">
      <div class="tna-row tna-head">
        <div>
          <UiChip>{{ d.kind === 'competency' ? 'Gap kompetensi' : 'Gap OKR' }}</UiChip>
          <h1 class="tna-h1">{{ d.name }}</h1>
          <p class="el-muted">{{ d.kind === 'okr' ? `Periode ${d.period}` : d.jobRoles.join(', ') }}</p>
        </div>
        <UiChip :tone="CLASSIFICATION_TONE[d.classification]">{{ CLASSIFICATION_LABEL[d.classification] }}</UiChip>
      </div>
      <div class="el-grid el-grid-3 tna-gap"><UiKpiCard v-for="k in kpis" :key="k.l" :label="k.l" :value="k.v" /></div>
      <div class="el-grid el-grid-2 tna-gap">
        <UiCard>
          <h2 class="tna-h2">Bukti yang terdeteksi</h2>
          <ul class="tna-list"><li v-for="e in d.evidence" :key="e">{{ e }}</li></ul>
        </UiCard>
        <UiCard>
          <h2 class="tna-h2">Hipotesis awal (belum terverifikasi)</h2>
          <ul class="tna-list"><li v-for="h in d.hypotheses" :key="h.text">{{ h.text }}</li></ul>
          <p class="el-muted tna-small">Gap hanya menunjukkan adanya masalah. Penyebabnya dicari lewat wawancara.</p>
        </UiCard>
      </div>

      <h2 class="tna-h2 tna-gap">Karyawan</h2>
      <UiDataTable :columns="cols" :rows="d.employees" row-key="id" caption="Karyawan dalam gap ini" caption-hidden empty-text="Tidak ada karyawan dalam cakupan Anda.">
        <template #cell-name="{ row }">{{ row.name ?? '–' }}<template v-if="row.self"> (Anda)</template></template>
        <template #cell-value="{ row }">{{ valueText(row) }}</template>
        <template #cell-session="{ row }">{{ sessionText(row) }}</template>
        <template #cell-aksi="{ row }">
          <UiButton v-if="assignOn && canCancel(row)" variant="text" size="sm" :disabled="busy" :aria-label="`Batalkan penugasan ${row.name ?? ''}`" @click="cancel(row)">Batalkan</UiButton>
        </template>
      </UiDataTable>

      <UiStatus v-if="notice" tone="success" role="status" class="tna-gap">{{ notice }}</UiStatus>

      <UiCard v-if="assignOn" class="tna-gap tna-cta">
        <h2 class="tna-h2">Cari akar masalah</h2>
        <p>AI mewawancarai karyawan terkait, merangkum temuan, lalu HR memutuskan solusi.</p>
        <form aria-label="Tugaskan wawancara" class="tna-form" novalidate @submit.prevent="assign">
          <UiField id="tna-project" label="Proyek" :error="fieldError('tna-project')">
            <template #default="{ attrs }">
              <select v-bind="attrs" v-model="projectId" class="el-input">
                <option value="" disabled>Pilih proyek</option>
                <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </template>
          </UiField>
          <fieldset class="tna-fieldset">
            <legend>Siapa yang diwawancarai</legend>
            <label><input v-model="mode" type="radio" value="affected" /> Karyawan yang terdampak gap ini</label>
            <label v-if="isHr"><input v-model="mode" type="radio" value="all_job_role" /> Semua karyawan di jabatan</label>
          </fieldset>
          <UiField v-if="mode === 'all_job_role'" id="tna-jobrole" label="Jabatan" :error="fieldError('tna-jobrole')">
            <template #default="{ attrs }">
              <select v-bind="attrs" v-model="jobRoleId" class="el-input">
                <option value="" disabled>Pilih jabatan</option>
                <option v-for="j in jobRoles" :key="j.id" :value="j.id">{{ j.name }}</option>
              </select>
            </template>
          </UiField>
          <fieldset v-if="mode === 'affected'" id="tna-employees" tabindex="-1" class="tna-fieldset">
            <legend>Karyawan (opsional; kosong berarti semua yang terdampak)</legend>
            <label v-for="e in eligible" :key="e.id" class="el-check"><input v-model="picked" type="checkbox" :value="e.id" /> {{ e.name ?? 'Tanpa nama' }}</label>
            <p v-if="!eligible.length" class="el-muted tna-small">Tidak ada karyawan terdampak yang belum punya wawancara terbuka.</p>
          </fieldset>
          <UiField id="tna-due" label="Tenggat" hint="Paling cepat besok, paling lama 30 hari lagi (WIB)." :error="fieldError('tna-due')">
            <template #default="{ attrs }"><input v-bind="attrs" v-model="dueDate" type="date" :min="minDue" :max="maxDue" class="el-input" /></template>
          </UiField>
          <fieldset class="tna-fieldset">
            <legend>Durasi</legend>
            <label><input v-model="duration" type="radio" :value="15" /> 15 menit</label>
            <label><input v-model="duration" type="radio" :value="30" /> 30 menit</label>
          </fieldset>
          <div class="tna-row">
            <UiButton type="submit" icon="forum" :disabled="busy">Tugaskan wawancara</UiButton>
            <UiButton v-if="isHr" variant="outlined" :to="reviewTo">Langsung ke tinjauan HR</UiButton>
          </div>
        </form>
      </UiCard>
      <p v-else-if="isHr" class="tna-gap"><RouterLink :to="reviewTo" class="tna-link">Langsung ke tinjauan HR</RouterLink></p>
    </template>
  </AppShell>
</template>

