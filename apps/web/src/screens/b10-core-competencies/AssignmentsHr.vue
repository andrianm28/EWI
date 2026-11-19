<script setup lang="ts">
// Tab Wawancara AI untuk HR: menugaskan pimpinan dan atasan, memantau status dan hitungan tim.
// HR tidak menerima daftar karyawan per orang; percakapan dan sintesis menyusul di tahap 2.
import { computed, onMounted, ref } from 'vue'
import { cca, fmtDate, STATUS_LABEL, type Assignments, type AssignmentStatus, type LeaderRow } from '@/api/cca'
import { UiButton, UiCard, UiChip, UiDataTable, UiErrorSummary, UiField, UiKpiCard, UiNote, type UiColumn } from '@/ui'
import { defaultDue, todayIso } from './due'
import InterviewFlow from './InterviewFlow.vue'

type HrData = Extract<Assignments, { role: 'hr' }>
const data = ref<HrData | null>(null)
const loading = ref(true)
const errors = ref<{ message: string }[]>([])
const notice = ref('')
const due = ref(defaultDue())
const busy = ref(false)

async function load() {
  try {
    const res = await cca.assignments()
    data.value = res.role === 'hr' ? res : null
  } catch (e) { errors.value = [{ message: (e as Error).message }] } finally { loading.value = false }
}
onMounted(load)

const TONE: Record<AssignmentStatus, 'neutral' | 'review' | 'success'> = { none: 'neutral', assigned: 'review', in_progress: 'review', completed: 'success', cancelled: 'neutral' }
const COLUMNS: UiColumn[] = [
  { key: 'name', label: 'Pimpinan', sortable: true },
  { key: 'division', label: 'Divisi', sortable: true },
  { key: 'status', label: 'Status' },
  { key: 'dueDate', label: 'Batas waktu' },
  { key: 'team', label: 'Tim selesai', mono: true },
  { key: 'aksi', label: 'Tindakan' },
]
const unassigned = computed(() => (data.value?.leaders ?? []).filter((l) => l.status === 'none' || l.status === 'cancelled'))
const kpis = computed(() => {
  const k = data.value?.kpis
  if (!k) return []
  return [
    { label: 'Pimpinan ditugaskan', value: `${k.leadersAssigned} dari ${k.leadersEligible}`, note: 'oleh HR' },
    { label: 'Wawancara pimpinan selesai', value: `${k.leadersCompleted} dari ${k.leadersEligible}`, note: 'menjadi dasar persyaratan' },
    { label: 'Karyawan ditugaskan', value: String(k.employeesAssigned), note: 'oleh atasan masing-masing' },
    { label: 'Karyawan selesai', value: `${k.employeesCompleted} dari ${k.employeesAssigned}`, note: 'dari yang ditugaskan' },
  ]
})
const asRow = (r: Record<string, unknown>) => r as unknown as LeaderRow

async function run(fn: () => Promise<string>) {
  errors.value = []; notice.value = ''; busy.value = true
  try { const msg = await fn(); await load(); notice.value = msg } catch (e) { errors.value = [{ message: (e as Error).message }] } finally { busy.value = false }
}
const assign = (rows: LeaderRow[]) => run(async () => {
  const res = await cca.assign(rows.map((r) => r.userId), due.value)
  const left = res.skipped.length + res.rejected.length
  return `${res.assigned.length} pimpinan ditugaskan${left ? `, ${left} dilewati` : ''}.`
})
const cancel = (row: LeaderRow) => run(async () => { await cca.cancelAssignment(row.assignmentId!); return `Penugasan ${row.name} dibatalkan.` })
</script>

<template>
  <div class="cc-stack" data-testid="cc-wawancara-hr">
    <p class="el-muted">AI mewawancarai pimpinan tentang visi, misi, dan nilai, lalu mewawancarai karyawan untuk menilai gap terhadap hasil pimpinan. HR menugaskan ke atasan, atasan ke karyawan.</p>
    <InterviewFlow :active="1" />
    <UiErrorSummary v-if="errors.length" :errors="errors" />
    <p v-if="notice" role="status" class="el-muted">{{ notice }}</p>
    <p v-if="loading" class="el-muted">Memuat…</p>
    <template v-else-if="data">
      <div class="el-grid el-grid-4">
        <UiKpiCard v-for="k in kpis" :key="k.label" :label="k.label" :value="k.value" :note="k.note" />
      </div>
      <UiCard>
        <h3 class="el-h3">Penugasan ke pimpinan dan atasan</h3>
        <p class="el-muted">Topik: visi, misi, dan nilai korporasi. Atasan yang selesai bisa meneruskan wawancara ke anggota timnya.</p>
        <UiDataTable :columns="COLUMNS" :rows="data.leaders" row-key="userId" caption="Pimpinan dan atasan yang bisa ditugaskan" caption-hidden empty-text="Belum ada pengguna berperan atasan atau pimpinan. Impor data karyawan dulu.">
          <template #toolbar>
            <UiField id="cc-batas" v-slot="{ attrs }" label="Batas waktu penugasan baru"><input v-bind="attrs" v-model="due" class="el-input" type="date" :min="todayIso()" required /></UiField>
            <UiButton size="sm" :disabled="busy || !unassigned.length || !due" @click="assign(unassigned)">Tugaskan semua</UiButton>
          </template>
          <template #cell-name="{ row }"><b>{{ row.name }}</b><div v-if="row.jobRoleName" class="el-muted cc-small">{{ row.jobRoleName }}</div></template>
          <template #cell-division="{ row }">{{ row.division ?? '-' }}</template>
          <template #cell-status="{ row }"><UiChip :tone="TONE[asRow(row).status]">{{ STATUS_LABEL[asRow(row).status] }}</UiChip></template>
          <template #cell-dueDate="{ row }">{{ fmtDate(asRow(row).dueDate) }}</template>
          <template #cell-team="{ row }">{{ row.teamDone }} dari {{ row.teamTotal }}</template>
          <template #cell-aksi="{ row }">
            <UiButton v-if="row.status === 'none' || row.status === 'cancelled'" variant="tonal" size="sm" :disabled="busy || !due" @click="assign([asRow(row)])">Tugaskan<span class="el-sr-only"> {{ row.name }}</span></UiButton>
            <UiButton v-else-if="row.status === 'assigned'" variant="text" size="sm" :disabled="busy" @click="cancel(asRow(row))">Batalkan<span class="el-sr-only"> penugasan {{ row.name }}</span></UiButton>
            <span v-else class="el-muted">{{ row.status === 'completed' ? 'Selesai' : 'Sedang berjalan' }}</span>
          </template>
        </UiDataTable>
      </UiCard>
      <UiNote>Percakapan wawancara AI dan sintesis pimpinan dibanding karyawan belum tersedia di versi ini. Halaman ini baru mencatat penugasan dan statusnya.</UiNote>
    </template>
  </div>
</template>
