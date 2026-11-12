<script setup lang="ts">
// DNA: dashboard karier & gap kompetensi. Learner melihat dirinya, atasan timnya, HR semua (RG-3).
// Saran kandidat promosi hanya dikirim API untuk HR (RG-1e masih terbuka untuk atasan).
// Cadence 11 Nov (C2): di POC, hasil DNA berasal dari wawancara manual yang diimpor HR; wawancara AI di balik flag dna.ai_interview.
import { computed, onMounted, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { ASSESSMENT_SOURCE_LABEL, lna, parseCsv, TIER_LABEL, type EmployeeDetail, type EmployeeProfile, type Session } from '@/api/lna'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const people = ref<EmployeeProfile[]>([])
const sessions = ref<Session[]>([])
const detail = ref<EmployeeDetail | null>(null)
const error = ref('')
const loading = ref(true)
const notice = ref('')
const csv = ref('')
const assessor = ref('')
const assessedAt = ref('')

const isLearner = computed(() => session.role === 'learner')
const isHr = computed(() => session.role === 'hr_admin')
const aiInterview = computed(() => session.access?.flags['dna.ai_interview'] === true)
const candidates = computed(() => people.value.filter((p) => p.career.promotionCandidate))
const behind = computed(() => people.value.filter((p) => p.career.behindCurrentLevel))
const mySessions = computed(() => sessions.value.filter((s) => s.intervieweeId === session.user?.id && s.status !== 'completed'))

async function open(id: string) {
  try { detail.value = (await lna.dnaEmployee(id)).data } catch (e) { error.value = (e as Error).message }
}

async function load() {
  const [p, s] = await Promise.all([lna.dnaEmployees(), aiInterview.value ? lna.sessions('dna') : Promise.resolve({ data: [] as Session[] })])
  people.value = p.data
  sessions.value = s.data
  if (people.value.length === 1) await open(people.value[0]!.id)
}

onMounted(async () => {
  try { await load() } catch (e) { error.value = (e as Error).message } finally { loading.value = false }
})

async function importResults() {
  error.value = ''; notice.value = ''
  try {
    const rows = parseCsv(csv.value)
    if (!rows.length) throw new Error('CSV kosong. Baris pertama berisi header.')
    const r = (await lna.importDnaResults(rows, assessor.value.trim(), assessedAt.value)).data
    csv.value = ''
    notice.value = `${r.imported} hasil diimpor${r.rejected.length ? `, ${r.rejected.length} ditolak: ${r.rejected.map((x) => `baris ${x.index + 2} ${x.reason}`).join('; ')}` : ''}.`
    detail.value = null
    await load()
  } catch (e) { error.value = (e as Error).message }
}

const tier = (t: string | null | undefined) => (t ? TIER_LABEL[t] ?? t : '-')
const pct = (n: number | null) => (n == null ? 'Belum dinilai' : `${n}%`)
</script>

<template>
  <AppShell>
    <h1 class="text-lg font-semibold">DNA · Development Need Analysis</h1>
    <p class="mt-1 text-sm text-slate-600">Gap kompetensi terhadap jabatan dan pergerakan jenjang karier.</p>
    <p v-if="error" role="alert" class="mt-3 text-sm text-red-600">{{ error }}</p>
    <p v-if="notice" role="status" class="mt-3 text-sm text-emerald-700">{{ notice }}</p>
    <p v-if="loading" class="mt-4 text-sm text-slate-500">Memuat…</p>

    <section v-if="mySessions.length" class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4" data-testid="dna-my-sessions">
      <h2 class="font-medium">Asesmen untuk Anda</h2>
      <ul class="mt-2 space-y-1 text-sm">
        <li v-for="s in mySessions" :key="s.id">
          <RouterLink :to="`/m/dna/sessions/${s.id}`" class="text-blue-700">{{ s.status === 'scheduled' ? 'Mulai wawancara asesmen' : 'Lanjutkan wawancara' }}</RouterLink>
        </li>
      </ul>
    </section>

    <section v-if="!isLearner && !loading" class="mt-4 grid gap-3 sm:grid-cols-3">
      <div class="rounded-lg border bg-white p-4"><div class="text-2xl font-semibold">{{ people.length }}</div><div class="text-sm text-slate-500">Karyawan</div></div>
      <div class="rounded-lg border bg-white p-4"><div class="text-2xl font-semibold">{{ behind.length }}</div><div class="text-sm text-slate-500">Belum lulus program jenjangnya</div></div>
      <div v-if="session.role === 'hr_admin' || session.role === 'eta_admin'" class="rounded-lg border bg-white p-4" data-testid="dna-candidates">
        <div class="text-2xl font-semibold">{{ candidates.length }}</div><div class="text-sm text-slate-500">Saran kandidat promosi</div>
      </div>
    </section>

    <form v-if="isHr" class="mt-4 space-y-2 rounded-lg border bg-white p-4 text-sm" data-testid="dna-import" @submit.prevent="importResults">
      <h2 class="font-medium">Impor hasil wawancara DNA</h2>
      <p class="text-xs text-slate-500">Satu baris per karyawan per kompetensi. Kolom: employeeId atau email, competency (nama sesuai kamus kompetensi), score (0-4), evidence (opsional).</p>
      <div class="grid gap-2 sm:grid-cols-2">
        <label class="block">Pewawancara <input v-model="assessor" class="mt-1 w-full rounded border px-2 py-1" placeholder="Tim ETA" /></label>
        <label class="block">Tanggal wawancara <input v-model="assessedAt" type="date" class="mt-1 w-full rounded border px-2 py-1" /></label>
      </div>
      <label class="block">CSV <textarea v-model="csv" rows="4" class="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" placeholder="employeeId,competency,score,evidence" /></label>
      <button type="submit" class="rounded bg-slate-900 px-3 py-1.5 text-white">Impor</button>
    </form>

    <section v-if="!isLearner && people.length" class="mt-4 overflow-x-auto rounded-lg border bg-white">
      <table class="w-full text-sm" data-testid="dna-table">
        <thead class="bg-slate-50 text-left text-slate-500">
          <tr><th class="p-2">Nama</th><th class="p-2">Jenjang</th><th class="p-2">Kesiapan kompetensi</th><th class="p-2">Program</th><th class="p-2"></th></tr>
        </thead>
        <tbody>
          <tr v-for="p in people" :key="p.id" class="border-t">
            <td class="p-2">{{ p.name ?? p.email }}<div class="text-xs text-slate-400">{{ p.jobRoleName ?? 'Belum ada job role' }}</div></td>
            <td class="p-2">{{ p.career.currentLevel?.name ?? '-' }}</td>
            <td class="p-2">{{ pct(p.gap.readiness) }} <span v-if="p.gap.gaps" class="text-xs text-amber-700">({{ p.gap.gaps }} gap)</span></td>
            <td class="p-2">
              <span v-if="p.career.behindCurrentLevel" class="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Belum lulus {{ tier(p.career.currentLevel?.requiredProgramTier) }}</span>
              <span v-else-if="p.career.promotionCandidate" class="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Kandidat {{ p.career.nextLevel?.name }}</span>
              <span v-else class="text-xs text-slate-400">Sesuai jenjang</span>
            </td>
            <td class="p-2 text-right"><button class="text-blue-700" @click="open(p.id)">Detail</button></td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="detail" class="mt-4 rounded-lg border bg-white p-4" data-testid="dna-detail">
      <h2 class="font-medium">{{ detail.person.name ?? detail.person.email }}</h2>
      <p class="text-sm text-slate-600">
        Jenjang: {{ detail.career.currentLevel?.name ?? '-' }}
        <template v-if="detail.career.nextLevel"> · berikutnya {{ detail.career.nextLevel.name }} (syarat program {{ tier(detail.career.nextLevel.requiredProgramTier) }})</template>
      </p>
      <ul class="mt-3 divide-y text-sm">
        <li v-for="g in detail.gap.items" :key="g.competencyId" class="flex items-center justify-between py-2">
          <span>{{ g.name }} <span class="text-xs text-slate-400">{{ g.kind === 'core' ? 'inti' : 'jabatan' }}</span></span>
          <span v-if="g.status === 'not_assessed'" class="text-xs text-slate-400">Belum dinilai</span>
          <span v-else :class="g.status === 'gap' ? 'text-amber-700' : 'text-emerald-700'">
            {{ g.score }}/{{ g.required }}{{ g.status === 'gap' ? ' · perlu dikembangkan' : '' }}
            <span v-if="g.source" class="ml-1 text-xs text-slate-400">({{ ASSESSMENT_SOURCE_LABEL[g.source] ?? g.source }})</span>
          </span>
        </li>
      </ul>
      <p v-if="!detail.gap.items.length" class="mt-2 text-sm text-slate-500">Kompetensi jabatan belum disusun untuk posisi ini.</p>
    </section>
  </AppShell>
</template>
