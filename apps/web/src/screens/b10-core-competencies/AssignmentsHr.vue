<script setup lang="ts">
// Tab Wawancara AI untuk HR: menugaskan pimpinan dan atasan, memantau status dan hitungan tim.
// HR tidak menerima daftar karyawan per orang; sintesis pimpinan vs karyawan di SynthesisCard (tahap 2).
import { computed, onMounted, ref } from 'vue'
import { cca, fmtDate, STATUS_LABEL, type Assignments, type AssignmentStatus, type LeaderRow } from '@/api/cca'
import { UiButton, UiCard, UiChip, UiDataTable, UiErrorSummary, UiKpiCard, type UiColumn } from '@/ui'
import AssignDueDialog from './AssignDueDialog.vue'
import InterviewFlow from './InterviewFlow.vue'
import SynthesisCard from './SynthesisCard.vue'

type HrData = Extract<Assignments, { role: 'hr' }>
const data = ref<HrData | null>(null)
const loading = ref(true)
const errors = ref<{ message: string }[]>([])
const notice = ref('')
/** P8 R2 (AH-2): pimpinan yang akan ditugaskan; tenggatnya dipilih di dialog. */
const pending = ref<LeaderRow[] | null>(null)
const busy = ref(false)
const themes = ref<number | null>(null)

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
    { label: 'Karyawan selesai', value: `${k.employeesCompleted} dari ${k.employeesAssigned}`, note: 'ditugaskan oleh atasan masing-masing' },
    // Paritas P5 AH-1: kartu ke-4 dari sintesis (SynthesisCard memuatnya sendiri dan melapor lewat @loaded)
    { label: 'Tema tersintesis', value: themes.value === null ? '-' : String(themes.value), note: 'visi, misi, dan nilai' },
  ]
})
const asRow = (r: Record<string, unknown>) => r as unknown as LeaderRow

async function run(fn: () => Promise<string>) {
  errors.value = []; notice.value = ''; busy.value = true
  try { const msg = await fn(); await load(); notice.value = msg } catch (e) { errors.value = [{ message: (e as Error).message }] } finally { busy.value = false }
}
const assign = (rows: LeaderRow[], dueDate: string) => run(async () => {
  pending.value = null
  const res = await cca.assign(rows.map((r) => r.userId), dueDate)
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
        <!-- P8 R2 (AH-2): "Tugaskan semua" di kanan header kartu -->
        <div class="cc-row cc-cardhead">
          <h3 class="el-h3">Penugasan ke pimpinan dan atasan</h3>
          <UiButton size="sm" :disabled="busy || !unassigned.length" @click="pending = unassigned">Tugaskan semua</UiButton>
        </div>
        <p class="el-muted cc-cardsub">Topik: visi, misi, dan nilai korporasi. Atasan yang selesai bisa meneruskan wawancara ke anggota timnya.</p>
        <UiDataTable :columns="COLUMNS" :rows="data.leaders" row-key="userId" caption="Pimpinan dan atasan yang bisa ditugaskan" caption-hidden empty-text="Belum ada pengguna berperan atasan atau pimpinan. Impor data karyawan dulu.">
          <template #cell-name="{ row }"><b>{{ row.name }}</b><div v-if="row.jobRoleName" class="el-muted cc-small">{{ row.jobRoleName }}</div></template>
          <template #cell-division="{ row }">{{ row.division ?? '-' }}</template>
          <!-- P8 R2 (AH-3): tenggat jadi teks kecil di sel Status -->
          <template #cell-status="{ row }">
            <UiChip :tone="TONE[asRow(row).status]">{{ STATUS_LABEL[asRow(row).status] }}</UiChip>
            <div v-if="asRow(row).dueDate" class="el-muted cc-small">Batas {{ fmtDate(asRow(row).dueDate, 'short') }}</div>
          </template>
          <template #cell-team="{ row }">{{ row.teamDone }} dari {{ row.teamTotal }}</template>
          <template #cell-aksi="{ row }">
            <UiButton v-if="row.status === 'none' || row.status === 'cancelled'" variant="tonal" size="sm" :disabled="busy" @click="pending = [asRow(row)]">Tugaskan<span class="el-sr-only"> {{ row.name }}</span></UiButton>
            <UiButton v-else-if="row.status === 'assigned'" variant="text" size="sm" :disabled="busy" @click="cancel(asRow(row))">Batalkan<span class="el-sr-only"> penugasan {{ row.name }}</span></UiButton>
            <span v-else class="el-muted">{{ row.status === 'completed' ? 'Selesai' : 'Sedang berjalan' }}</span>
          </template>
        </UiDataTable>
      </UiCard>
      <AssignDueDialog
        :open="!!pending" title="Tugaskan wawancara pimpinan" :busy="busy"
        :who="pending?.length === 1 ? pending[0]!.name : `${pending?.length ?? 0} pimpinan`"
        @close="pending = null" @confirm="assign(pending ?? [], $event)"
      />
      <SynthesisCard @loaded="themes = $event" />
    </template>
  </div>
</template>
