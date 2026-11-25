<script setup lang="ts">
// Rute `aiv`: atasan melihat wawancara pimpinannya dan menugaskan tim; karyawan melihat penugasannya sendiri.
// Atasan hanya melihat status tim, tidak pernah isi jawaban. Peserta menjalankan wawancaranya di InterviewSession (tahap 2).
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '@/api/client'
import { cca, fmtDate, STATUS_LABEL, type Assignment, type Assignments, type AssignmentStatus, type TeamRow } from '@/api/cca'
import AppShell from '@/components/AppShell.vue'
import { useSessionStore } from '@/stores/session'
import { EMPTY, UiBreadcrumb, UiButton, UiCard, UiChip, UiDataTable, UiErrorSummary, UiNote, type UiColumn } from '@/ui'
import AssignDueDialog from './AssignDueDialog.vue'
import { focusIfLost } from './focus'
import InterviewFlow from './InterviewFlow.vue'
import InterviewSession from './InterviewSession.vue'
import './cc.css'

const session = useSessionStore()
const data = ref<Assignments | null>(null)
const loading = ref(true)
const disabled = ref(false)
const errors = ref<{ message: string }[]>([])
const notice = ref('')
/** P8 R2 (AA-4): anggota tim yang akan ditugaskan; tenggatnya dipilih di dialog. */
const pending = ref<TeamRow[] | null>(null)
const busy = ref(false)
/** Galat penugasan dari API, tampil di dialog selama dialog terbuka (triase P8 #2). */
const dialogErrors = ref<{ message: string }[]>([])
const noticeEl = ref<HTMLElement | null>(null)
function openDialog(rows: TeamRow[]) { dialogErrors.value = []; pending.value = rows }

async function load() {
  try { data.value = await cca.assignments() } catch (e) {
    if (e instanceof ApiError && e.code === 'FEATURE_DISABLED') disabled.value = true
    else errors.value = [{ message: (e as Error).message }]
  } finally { loading.value = false }
}
onMounted(load)

// Tampilan atasan hanya bermakna bila API mengenali pemanggil sebagai pimpinan
const asLeader = computed(() => session.activeView === 'atasan' && data.value?.role === 'leader')
const leader = computed(() => (data.value?.role === 'leader' ? data.value : null))
const mineLeader = computed(() => data.value?.mine.leader ?? null)
const mineEmployee = computed(() => data.value?.mine.employee ?? null)

const TONE: Record<AssignmentStatus, 'neutral' | 'review' | 'success'> = { none: 'neutral', assigned: 'review', in_progress: 'review', completed: 'success', cancelled: 'neutral' }
const statusOf = (a: Assignment | null): AssignmentStatus => a?.status ?? 'none'
// Paritas P5 AA-3: label khusus kartu peserta (STATUS_LABEL bersama tetap untuk tabel HR)
const mineLabel = (s: AssignmentStatus) => (s === 'assigned' ? 'Perlu wawancara' : STATUS_LABEL[s])
// Sesi yang sedang dibuka peserta (penugasannya sendiri)
const openId = ref<string | null>(null)
const ACTION: Partial<Record<AssignmentStatus, string>> = { assigned: 'Mulai wawancara', in_progress: 'Lanjutkan wawancara', completed: 'Lihat ringkasan' }
async function finished() { await load() }
const COLUMNS: UiColumn[] = [
  { key: 'name', label: 'Anggota tim', sortable: true },
  { key: 'jobRoleName', label: 'Jabatan', sortable: true },
  { key: 'status', label: 'Status' },
  { key: 'aksi', label: 'Tindakan' },
]
const asRow = (r: Record<string, unknown>) => r as unknown as TeamRow
const open = (s: AssignmentStatus) => s === 'none' || s === 'cancelled'
const unassigned = computed(() => (leader.value?.team ?? []).filter((m) => open(m.status)))

async function assign(rows: TeamRow[], dueDate: string) {
  // Dialog tetap terbuka sampai berhasil (tombol Tugaskan nonaktif selama `busy`); galat tampil di dialog
  errors.value = []; dialogErrors.value = []; notice.value = ''; busy.value = true
  try {
    const res = await cca.assign(rows.map((r) => r.userId), dueDate)
    pending.value = null
    await load()
    const left = res.skipped.length + res.rejected.length
    notice.value = `${res.assigned.length} anggota tim ditugaskan${left ? `, ${left} dilewati` : ''}.`
    await focusIfLost(() => noticeEl.value)
  } catch (e) { dialogErrors.value = [{ message: (e as Error).message }] } finally { busy.value = false }
}
</script>

<template>
  <AppShell>
    <UiBreadcrumb :items="[{ label: 'Learning Needs Analysis' }, { label: 'Wawancara AI' }]" />
    <div class="cc-stack" data-testid="cc-wawancara">
      <div class="cc-row">
        <!-- P8 R15 (AIV-1): h1 mockup "Wawancara AI" juga untuk karyawan; judul kartu tetap "Wawancara visi, misi, dan nilai" -->
        <h1 class="el-h1">Wawancara AI</h1>
        <UiChip tone="review">Pilot</UiChip>
      </div>
      <p class="el-muted cc-sub">
        <template v-if="session.activeView === 'atasan'">Anda diwawancarai AI sebagai pimpinan, lalu menugaskan wawancara ke anggota tim Anda.</template>
        <template v-else>AI mewawancarai Anda tentang pemahaman visi, misi, dan nilai perusahaan. Ditugaskan oleh atasan Anda.</template>
      </p>
      <UiErrorSummary v-if="errors.length" :errors="errors" />
      <p v-if="notice" ref="noticeEl" role="status" tabindex="-1" class="el-muted">{{ notice }}</p>
      <p v-if="loading" class="el-muted">Memuat…</p>
      <UiNote v-else-if="disabled" tone="warning">Wawancara AI Core Competencies belum diaktifkan untuk organisasi Anda.</UiNote>

      <template v-else-if="data">
        <InterviewFlow :active="asLeader ? 2 : 3" />

        <template v-if="asLeader && leader">
          <UiCard data-testid="cc-wawancara-pimpinan">
            <!-- AA-2: teks kiri, tombol primer kanan satu baris -->
            <div class="cc-leadcard">
              <div style="min-width: 0">
                <UiChip :tone="TONE[statusOf(mineLeader)]">{{ mineLabel(statusOf(mineLeader)) }}</UiChip>
                <h2 class="el-h3" style="margin: 8px 0 4px">Wawancara pimpinan dari HR</h2>
                <p v-if="mineLeader" class="el-muted" style="margin: 0">
                  Topik: visi, misi, dan nilai korporasi. Batas waktu {{ fmtDate(mineLeader.dueDate, 'short') }}. Sekitar {{ mineLeader.durationMinutes }} menit; jawaban diringkas AI sebelum dikirim ke HR.
                </p>
                <p v-else class="el-muted" style="margin: 0">HR belum menugaskan wawancara pimpinan kepada Anda.</p>
              </div>
              <UiButton v-if="mineLeader && ACTION[mineLeader.status] && openId !== mineLeader.id" @click="openId = mineLeader.id">{{ ACTION[mineLeader.status] }}</UiButton>
            </div>
            <InterviewSession v-if="mineLeader && openId === mineLeader.id" :key="mineLeader.id" :assignment-id="mineLeader.id" style="margin-top: 16px" @finished="finished" @close="openId = null" />
          </UiCard>
          <UiCard>
            <!-- P8 R2 (AA-4): tanpa field tanggal di toolbar; "Tugaskan semua" dipertahankan di header kartu -->
            <div class="cc-row cc-cardhead">
              <h3 class="el-h3">Teruskan wawancara ke tim Anda</h3>
              <UiButton v-if="leader.canAssign" size="sm" :disabled="busy || !unassigned.length" @click="openDialog(unassigned)">Tugaskan semua</UiButton>
            </div>
            <p class="el-muted cc-cardsub">Karyawan diwawancarai AI untuk menilai gap terhadap hasil wawancara Anda. Penugasan dari Anda, hasilnya masuk ke HR.</p>
            <UiNote v-if="!leader.canAssign" tone="warning" style="margin: 12px 0">Selesaikan wawancara pimpinan Anda dulu sebelum menugaskan anggota tim.</UiNote>
            <UiDataTable :columns="COLUMNS" :rows="leader.team" row-key="userId" caption="Anggota tim Anda" caption-hidden empty-text="Belum ada anggota tim yang tercatat sebagai bawahan langsung Anda.">
              <template #cell-jobRoleName="{ row }">{{ row.jobRoleName ?? EMPTY }}</template>
              <template #cell-status="{ row }"><UiChip :tone="TONE[asRow(row).status]">{{ STATUS_LABEL[asRow(row).status] }}</UiChip></template>
              <template #cell-aksi="{ row }">
                <UiButton v-if="open(asRow(row).status)" variant="tonal" size="sm" :disabled="busy || !leader.canAssign" @click="openDialog([asRow(row)])">Tugaskan<span class="el-sr-only"> {{ row.name }}</span></UiButton>
                <span v-else class="el-muted">{{ row.status === 'completed' ? 'Selesai' : 'Menunggu karyawan' }}</span>
              </template>
            </UiDataTable>
            <UiNote style="margin-top: 12px">Atasan hanya melihat status tim. Isi jawaban karyawan diringkas dan tidak ditampilkan per orang.</UiNote>
          </UiCard>
          <AssignDueDialog
            :open="!!pending" title="Tugaskan wawancara tim" :busy="busy" :errors="dialogErrors"
            :who="pending?.length === 1 ? pending[0]!.name : `${pending?.length ?? 0} anggota tim`"
            @close="pending = null" @confirm="assign(pending ?? [], $event)"
          />
        </template>

        <!-- AIV-6: sesi karyawan tampil di kartu "Percakapan" mandiri, menggantikan kartu penugasan -->
        <UiCard v-else-if="mineEmployee && openId === mineEmployee.id" data-testid="cc-wawancara-sesi">
          <InterviewSession :key="mineEmployee.id" :assignment-id="mineEmployee.id" @finished="finished" @close="openId = null" />
        </UiCard>
        <UiCard v-else data-testid="cc-wawancara-karyawan">
          <UiChip :tone="TONE[statusOf(mineEmployee)]">{{ STATUS_LABEL[statusOf(mineEmployee)] }}</UiChip>
          <h2 class="el-h2" style="margin: 8px 0 4px">Wawancara visi, misi, dan nilai</h2>
          <p v-if="!mineEmployee || mineEmployee.status === 'cancelled'">Atasan Anda belum menugaskan wawancara ini.</p>
          <template v-else>
            <p>Atasan Anda menugaskan wawancara singkat tentang pemahaman Anda terhadap visi, misi, dan nilai perusahaan. Hasilnya dibandingkan dengan hasil wawancara pimpinan.</p>
            <ul class="cc-list">
              <li>Sekitar {{ mineEmployee.durationMinutes }} menit. Batas waktu {{ fmtDate(mineEmployee.dueDate) }}.</li>
              <li>Dipakai untuk rencana belajar, bukan penilaian kinerja.</li>
              <li>Atasan hanya melihat status selesai atau belum.</li>
            </ul>
            <UiButton v-if="ACTION[mineEmployee.status]" @click="openId = mineEmployee.id">{{ ACTION[mineEmployee.status] }}</UiButton>
          </template>
        </UiCard>

      </template>
    </div>
  </AppShell>
</template>

