<script setup lang="ts">
// TNA: dipicu target OKR/KPI/SLA yang tidak tercapai (RG-2). Tampilan menyesuaikan peran (RG-3).
// HR wajib memilih siapa yang diwawancarai karena BT-29 belum diputuskan (tidak ada pilihan bawaan).
import { computed, onMounted, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { lna, parseCsv, PLAN_STATUS_LABEL, type Finding, type ParetoRow, type PlanItem, type Project, type Session, type TnaDashboard } from '@/api/lna'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const dash = ref<TnaDashboard | null>(null)
const pareto = ref<ParetoRow[]>([])
const findings = ref<Finding[]>([])
const plan = ref<PlanItem[]>([])
const sessions = ref<Session[]>([])
const projects = ref<Project[]>([])
const error = ref('')
const notice = ref('')

const isHr = computed(() => ['hr_admin', 'eta_admin'].includes(session.role))
const isLearner = computed(() => session.role === 'learner')
const mySessions = computed(() => sessions.value.filter((s) => s.intervieweeId === session.user?.id && s.status !== 'completed'))

// Impor & penjadwalan (HR)
const period = ref('')
const csv = ref('')
const projectId = ref('')
const scope = ref<'red_only' | 'all_members'>('red_only')
const jobRoleId = ref('')
const jobRoles = ref<{ id: string; name: string }[]>([])

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
    if (isHr.value) {
      tasks.push(lna.projects().then((r) => (projects.value = r.data)))
      tasks.push(lna.tnaJobRoles().then((r) => (jobRoles.value = r.data)))
    }
    await Promise.all(tasks)
  } catch (e) { error.value = (e as Error).message }
}
onMounted(load)

async function act(fn: () => Promise<string>) {
  error.value = ''; notice.value = ''
  try { notice.value = await fn(); await load() } catch (e) { error.value = (e as Error).message }
}

const importCsv = () => act(async () => {
  const rows = parseCsv(csv.value)
  if (!rows.length) throw new Error('CSV kosong. Baris pertama berisi header.')
  const r = (await lna.importPerformance(period.value.trim(), rows)).data
  csv.value = ''
  return `${r.imported} baris diimpor (${r.red} target merah)${r.rejected.length ? `, ${r.rejected.length} ditolak: ${r.rejected.map((x) => `baris ${x.index + 2} ${x.reason}`).join('; ')}` : ''}.`
})
const schedule = () => act(async () => {
  if (scope.value === 'all_members' && !jobRoleId.value) throw new Error('Pilih job role yang semua karyawannya akan diwawancarai.')
  const r = (await lna.scheduleTna(projectId.value, { scope: scope.value, period: period.value.trim(), jobRoleId: jobRoleId.value || undefined })).data
  return `${r.scheduled} wawancara dijadwalkan${r.skipped ? `, ${r.skipped} sudah terjadwal sebelumnya` : ''}.`
})
const planFinding = (id: string) => act(async () => {
  const r = (await lna.planFinding(id)).data
  return r.status === 'needs_module' ? 'Modul belum ada di katalog; training plan ditandai perlu modul baru.' : `Training plan dibuat: ${r.catalogItemTitle}.`
})
const requestTraining = (id: string) => act(async () => {
  await lna.requestTraining(id, 'Diajukan dari hasil TNA')
  return 'Permintaan training terkirim.'
})
const setStatus = (id: string, status: string) => act(async () => {
  await lna.setPlanStatus(id, status)
  return 'Status diperbarui.'
})
const target = (f: Finding) => (f.metricName ? `${f.metricName}: target ${f.target}, realisasi ${f.actual}` : '')
</script>

<template>
  <AppShell>
    <h1 class="text-lg font-semibold">TNA · Training Needs Analysis</h1>
    <p class="mt-1 text-sm text-slate-600">Kebutuhan training dari target OKR/KPI/SLA yang belum tercapai.</p>
    <p v-if="error" role="alert" class="mt-3 text-sm text-red-600">{{ error }}</p>
    <p v-if="notice" role="status" class="mt-3 text-sm text-emerald-700">{{ notice }}</p>

    <section v-if="mySessions.length" class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4" data-testid="tna-my-sessions">
      <h2 class="font-medium">Wawancara untuk Anda</h2>
      <p class="text-sm text-slate-600">Sekitar 30 menit, membahas target yang belum tercapai.</p>
      <RouterLink v-for="s in mySessions" :key="s.id" :to="`/m/tna/sessions/${s.id}`" class="mt-2 block text-sm text-blue-700">
        {{ s.status === 'scheduled' ? 'Mulai wawancara' : 'Lanjutkan wawancara' }}
      </RouterLink>
    </section>

    <section v-if="dash" class="mt-4 grid gap-3 sm:grid-cols-4" data-testid="tna-stats">
      <div class="rounded-lg border bg-white p-4"><div class="text-2xl font-semibold">{{ dash.redTargets }}</div><div class="text-sm text-slate-500">Target merah</div></div>
      <div class="rounded-lg border bg-white p-4"><div class="text-2xl font-semibold">{{ dash.sessions?.completed ?? 0 }}</div><div class="text-sm text-slate-500">Wawancara selesai</div></div>
      <div class="rounded-lg border bg-white p-4"><div class="text-2xl font-semibold">{{ dash.trainingFindings }}</div><div class="text-sm text-slate-500">Kebutuhan training</div></div>
      <div class="rounded-lg border bg-white p-4"><div class="text-2xl font-semibold">{{ plan.length }}</div><div class="text-sm text-slate-500">Item training plan</div></div>
    </section>

    <section v-if="isHr" class="mt-4 grid gap-4 md:grid-cols-2">
      <form class="space-y-2 rounded-lg border bg-white p-4 text-sm" @submit.prevent="importCsv">
        <h2 class="font-medium">Unggah data kinerja</h2>
        <p class="text-xs text-slate-500">Kolom: employeeId atau email, metricType (okr/kpi/sla), name, target, actual, direction (higher/lower).</p>
        <label class="block">Periode <input v-model="period" required class="mt-1 w-full rounded border px-2 py-1" placeholder="2026-11" /></label>
        <label class="block">CSV <textarea v-model="csv" rows="4" class="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" /></label>
        <button type="submit" class="rounded bg-slate-900 px-3 py-1.5 text-white">Impor</button>
      </form>
      <form class="space-y-2 rounded-lg border bg-white p-4 text-sm" @submit.prevent="schedule">
        <h2 class="font-medium">Jadwalkan wawancara TNA</h2>
        <label class="block">Proyek
          <select v-model="projectId" required class="mt-1 w-full rounded border px-2 py-1">
            <option value="" disabled>Pilih proyek</option>
            <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <fieldset class="space-y-1">
          <legend>Siapa yang diwawancarai?</legend>
          <label class="flex gap-2"><input v-model="scope" type="radio" value="red_only" /> Hanya karyawan dengan target merah</label>
          <label class="flex gap-2"><input v-model="scope" type="radio" value="all_members" /> Semua karyawan di job role tertentu</label>
        </fieldset>
        <label class="block">Job role{{ scope === 'all_members' ? '' : ' (opsional)' }}
          <select v-model="jobRoleId" class="mt-1 w-full rounded border px-2 py-1">
            <option value="">{{ scope === 'all_members' ? 'Pilih job role' : 'Semua job role' }}</option>
            <option v-for="j in jobRoles" :key="j.id" :value="j.id">{{ j.name }}</option>
          </select>
        </label>
        <p class="text-xs text-slate-500" data-testid="tna-scope-note">Target merah pada periode di atas menjadi bahan pembahasan. TNA tidak memerlukan hasil DACUM.</p>
        <button type="submit" class="rounded bg-slate-900 px-3 py-1.5 text-white">Jadwalkan</button>
      </form>
    </section>

    <section v-if="!isLearner && pareto.length" class="mt-4 rounded-lg border bg-white p-4">
      <h2 class="font-medium">Prioritas kebutuhan training</h2>
      <table class="mt-2 w-full text-sm" data-testid="tna-pareto">
        <thead class="text-left text-slate-500"><tr><th class="py-1">Kebutuhan</th><th>Orang</th><th>Skor</th><th>Kumulatif</th></tr></thead>
        <tbody>
          <tr v-for="r in pareto" :key="r.key" class="border-t">
            <td class="py-1">{{ r.label }}</td><td>{{ r.people }}</td><td>{{ r.score }}</td><td>{{ Math.round(r.cumulativeShare * 100) }}%</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="mt-4 rounded-lg border bg-white p-4">
      <h2 class="font-medium">{{ isLearner ? 'Hasil TNA Anda' : 'Kebutuhan training' }}</h2>
      <p v-if="!findings.length" class="mt-2 text-sm text-slate-500">Belum ada hasil.</p>
      <ul class="mt-2 divide-y text-sm" data-testid="tna-findings">
        <li v-for="f in findings" :key="f.id" class="flex items-start justify-between gap-3 py-2">
          <div>
            <div>{{ f.title }}<span v-if="!isLearner" class="text-slate-500"> · {{ f.userName }}</span></div>
            <div class="text-xs text-slate-500">{{ f.competencyName ?? 'Kompetensi belum terpetakan' }}<template v-if="target(f)"> · {{ target(f) }}</template></div>
          </div>
          <button v-if="isHr && f.status === 'open'" class="shrink-0 text-blue-700" @click="planFinding(f.id)">Buat training plan</button>
          <button v-if="isLearner" class="shrink-0 text-blue-700" @click="requestTraining(f.id)">Minta training</button>
        </li>
      </ul>
    </section>

    <section v-if="plan.length" class="mt-4 rounded-lg border bg-white p-4">
      <h2 class="font-medium">Training plan</h2>
      <ul class="mt-2 divide-y text-sm" data-testid="tna-plan">
        <li v-for="p in plan" :key="p.id" class="flex items-center justify-between gap-3 py-2">
          <div>
            <div>{{ p.catalogItemTitle ?? p.findingTitle ?? p.note }}<span v-if="!isLearner" class="text-slate-500"> · {{ p.userName }}</span></div>
            <div class="text-xs text-slate-500">{{ p.origin === 'learner_request' ? 'Diminta karyawan' : 'Usulan' }}</div>
          </div>
          <select v-if="!isLearner" :value="p.status" class="rounded border px-2 py-1 text-xs" :aria-label="`Status ${p.id}`" @change="setStatus(p.id, ($event.target as HTMLSelectElement).value)">
            <option v-for="(label, k) in PLAN_STATUS_LABEL" :key="k" :value="k">{{ label }}</option>
          </select>
          <span v-else class="text-xs">{{ PLAN_STATUS_LABEL[p.status] ?? p.status }}</span>
        </li>
      </ul>
    </section>
  </AppShell>
</template>
