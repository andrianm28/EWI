<script setup lang="ts">
// B16 Career & Promotion: peta karyawan per divisi, bukti, jalur jenjang, dan keputusan promosi dua tahap.
// Mengikuti layar "Career & Promotion" mockup final. Sistem hanya menandai yang memenuhi syarat; promosi tetap keputusan atasan dan HR.
import { computed, onMounted, ref, watch } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { useSessionStore } from '@/stores/session'
import { UiAuditLine, UiBreadcrumb, UiButton, UiCard, UiChip, UiDataTable, UiErrorSummary, UiKpiCard, UiNote, UiSegmented, UiTabs, type UiColumn } from '@/ui'
import { cpApi, TIER_LABEL, type Action, type CareerMap, type CareerStatus, type DecisionRow, type Evidence, type MapRow, type Paths } from './api'

type Tone = 'training' | 'improvement' | 'review' | 'success' | 'critical' | 'neutral'
const session = useSessionStore()
const role = computed(() => session.user?.role ?? '')

const TABS = [{ key: 'map', label: 'Karyawan per divisi' }, { key: 'path', label: 'Jalur jenjang' }, { key: 'dec', label: 'Keputusan promosi' }]
const tab = ref('map')
const error = ref('')
const loading = ref(true)
const map = ref<CareerMap | null>(null)
const division = ref('all')
const selected = ref<string | null>(null)
const evidence = ref<Evidence | null>(null)
const paths = ref<Paths | null>(null)
const decisions = ref<DecisionRow[] | null>(null)
const notes = ref<Record<string, string>>({})
const busy = ref<string | null>(null)
const done = ref('')

async function guard<T>(fn: () => Promise<T>): Promise<T | null> {
  error.value = ''
  try { return await fn() } catch (e) { error.value = e instanceof Error ? e.message : 'Terjadi kesalahan'; return null }
}

const okrMin = computed(() => map.value?.okrMin ?? paths.value?.okrMin ?? 80)
// CP-1: copy mockup untuk HR; atasan tetap bawahan langsung (PK-8, RG-3)
const scopeText = computed(() => (role.value === 'supervisor' ? 'Anda melihat bawahan langsung Anda.' : 'Seluruh divisi dan departemen.'))
const NO_DIVISION = '__none__'
const divisionOptions = computed(() => [
  { key: 'all', label: 'Semua' }, ...(map.value?.divisions ?? []).map((d) => ({ key: d, label: d })),
  ...((map.value?.employees ?? []).some((p) => !p.division) ? [{ key: NO_DIVISION, label: 'Tanpa divisi' }] : []),
])
const people = computed(() => (map.value?.employees ?? []).filter((p) => division.value === 'all' || (division.value === NO_DIVISION ? !p.division : p.division === division.value)))

function statusText(s: CareerStatus, next: { name: string } | null): string {
  switch (s) {
    case 'no_path': return 'Belum ada kamus kompetensi'
    case 'below_current': return 'Belum memenuhi kompetensi jabatan'
    case 'top_level': return 'Jenjang tertinggi'
    case 'next_no_requirement': return 'Jenjang berikutnya belum punya syarat program'
    case 'eligible': return `Memenuhi syarat ${next?.name ?? ''}`.trim()
    case 'program_passed_okr_low': return `Program lulus, OKR belum ${okrMin.value}%`
    case 'program_passed_no_okr': return 'Program lulus, data OKR belum ada'
    default: return next ? `Menuju ${next.name}` : 'Menuju jenjang berikutnya'
  }
}
const statusTone = (s: CareerStatus): Tone => (s === 'eligible' ? 'success' : s === 'below_current' ? 'critical' : s.startsWith('program_passed') || s === 'on_track' ? 'review' : 'neutral')
/** Sub status jenjang (CP-6, mockup `stOf`): apa yang kurang atau apa yang terjadi berikutnya. */
function statusSub(r: Pick<MapRow, 'status' | 'programs' | 'okr' | 'level' | 'nextLevel'>): string {
  const firstMissing = r.programs.find((p) => !p.passed)
  switch (r.status) {
    case 'below_current': return firstMissing ? `Perlu lulus ${TIER_LABEL[firstMissing.tier]}` : ''
    case 'eligible': return 'Program dan OKR terpenuhi; menunggu keputusan'
    case 'program_passed_okr_low': return r.okr ? `OKR saat ini ${fmtPct(r.okr.achievement)}` : ''
    case 'program_passed_no_okr': return 'OKR belum ada'
    case 'top_level': return r.level?.name ?? ''
    case 'on_track': return r.nextLevel?.requiredProgramTier ? `Perlu lulus ${TIER_LABEL[r.nextLevel.requiredProgramTier]}` : ''
    default: return ''
  }
}
const decisionText: Record<string, string> = { recommend: 'Direkomendasi', hold: 'Ditunda', approved: 'Disetujui' }
const SUPERVISOR_TEXT: Record<string, string> = { recommend: 'Merekomendasikan', hold: 'Menunda' }
const decisionTone = (d?: string): Tone => (d === 'approved' || d === 'recommend' ? 'success' : d === 'hold' ? 'review' : 'neutral')
const BLOCKED: Record<string, string> = {
  not_eligible: 'Belum memenuhi syarat', no_supervisor: 'Data atasan belum ada', waiting_supervisor: 'Menunggu atasan',
  self_recommended: 'Anda yang merekomendasi', approved: 'Sudah disetujui', held: 'Ditunda HR', view_only: 'Hanya melihat',
}
const ACTION_LABEL: Record<Action, string> = { recommend: 'Rekomendasikan', hold: 'Tunda', approve: 'Setujui' }

async function loadMap() {
  const data = await guard(() => cpApi.map())
  if (!data) return
  map.value = data
  if (!selected.value || !data.employees.some((p) => p.id === selected.value)) selected.value = data.employees[0]?.id ?? null
}
async function loadEvidence() {
  evidence.value = null
  const id = selected.value
  if (!id) return
  const data = await guard(() => cpApi.evidence(id))
  if (data) evidence.value = data
}
async function loadTab() {
  if (tab.value === 'path') { const data = await guard(() => cpApi.paths()); if (data) paths.value = data }
  else if (tab.value === 'dec') { const data = await guard(() => cpApi.decisions()); if (data) decisions.value = data }
  else await loadMap()
}
async function act(row: DecisionRow, action: Action) {
  const stage = action === 'approve' || role.value === 'hr_admin' ? 'hr' : 'supervisor'
  busy.value = `${row.employee.id}:${action}`
  done.value = ''
  const res = await guard(() => cpApi.decide(row.employee.id, stage, action, notes.value[row.employee.id]))
  busy.value = null
  if (!res) return
  notes.value[row.employee.id] = ''
  done.value = `${ACTION_LABEL[action]}: ${row.employee.name ?? 'karyawan'} tercatat.`
  const fresh = await guard(() => cpApi.decisions())
  if (fresh) decisions.value = fresh
}

onMounted(async () => { await loadMap(); loading.value = false })
watch(tab, loadTab)
watch(selected, loadEvidence)

const MAP_COLUMNS: UiColumn[] = [
  { key: 'name', label: 'Karyawan', sortable: true }, { key: 'division', label: 'Divisi', sortable: true },
  { key: 'level', label: 'Jabatan', sortValue: (r) => (r as unknown as MapRow).level?.name }, { key: 'programs', label: 'Program kompetensi' },
  { key: 'status', label: 'Status jenjang', sortable: true },
]
/** CP-9: syarat seperti mockup. */
function reqText(r: DecisionRow): string {
  const okr = r.requirement.okr
  if (!okr) return 'Program lulus · OKR belum ada'
  return okr.met ? 'Program dan OKR terpenuhi' : `OKR ${fmtPct(okr.achievement)} < ${okr.min}%`
}
const DEC_COLUMNS: UiColumn[] = [
  { key: 'employee', label: 'Karyawan' }, { key: 'move', label: 'Usulan jenjang' }, { key: 'req', label: 'Syarat (program + OKR)' },
  { key: 'supervisor', label: 'Atasan' }, { key: 'hr', label: 'HR' }, { key: 'actions', label: 'Tindakan' },
]
const decisionRows = computed(() => (decisions.value ?? []).map((d) => ({ ...d, id: d.employee.id })))
const fmtTime = (iso: string) => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
// C2: pembulatan tampilan tidak boleh menyeberangi ambang (79,5 tampil 79%, bukan 80%)
const fmtPct = (n: number) => { const r = Math.round(n); return `${r >= okrMin.value && n < okrMin.value ? Math.floor(n) : r}%` }
const decNote = computed(() => (role.value === 'supervisor'
  ? 'Anda memberi rekomendasi. Keputusan akhir ada di HR.'
  : 'HR memutuskan setelah ada rekomendasi atasan. Memenuhi dua syarat (program dan OKR) tidak otomatis disetujui.'))
const FLOW = computed(() => [
  { who: 'Sistem', tone: 'training' as Tone, t: `Menandai karyawan yang memenuhi dua syarat: lulus program tingkat berikutnya dan OKR ≥ ${okrMin.value}%.` },
  { who: 'Atasan', tone: 'review' as Tone, t: 'Menilai kesiapan di pekerjaan dan memberi rekomendasi: setuju atau tunda.' },
  { who: 'HR', tone: 'review' as Tone, t: 'Meninjau rekomendasi, bukti, dan formasi, lalu memutuskan.' },
  { who: 'Hasil', tone: 'success' as Tone, t: 'Keputusan dicatat. Kenaikan jabatan berlaku setelah ada surat keputusan.' },
])
/** Kalimat aturan per jenjang (mockup): syarat naik ke jenjang berikutnya. */
function ruleFor(i: number): string {
  const levels = paths.value?.levels ?? []
  const next = levels[i + 1]
  if (!next) return 'Jenjang tertinggi pada jalur ini.'
  if (!next.requiredProgramTier) return `Naik ke ${next.name}: syarat program belum ditetapkan.`
  return `Naik ke ${next.name}: lulus program ${TIER_LABEL[next.requiredProgramTier]} dan OKR ≥ ${okrMin.value}%, lalu disetujui atasan dan HR.`
}
</script>

<template>
  <AppShell>
    <UiBreadcrumb :items="[{ label: 'Career & Promotion' }]" />
    <h1 class="el-h1">Career &amp; Promotion</h1>
    <p class="el-muted" style="margin:0 0 4px">Posisi karyawan pada jenjang jabatan berdasarkan program kompetensi yang sudah lulus dan pencapaian OKR. {{ scopeText }}</p>
    <UiNote tone="warning" style="margin:12px 0">
      <b>Lulus program bukan berarti otomatis naik jabatan.</b> Promosi mensyaratkan dua hal sekaligus: lulus program jenjang berikutnya dan OKR memenuhi ambang (≥ {{ okrMin }}%).
      Itu pun baru syarat; kenaikan jabatan tetap keputusan atasan dan HR.
    </UiNote>
    <UiErrorSummary v-if="error" :errors="[{ message: error }]" style="margin-bottom:16px" />
    <p v-if="loading" class="el-muted">Memuat…</p>

    <template v-else>
      <UiTabs id="cp" v-model="tab" :tabs="TABS" label="Bagian Career & Promotion" />

      <div v-if="tab === 'map'" id="cp-panel-map" role="tabpanel" aria-labelledby="cp-tab-map" data-testid="cp-map">
        <template v-if="map">
          <div class="el-grid el-grid-4">
            <UiKpiCard label="Karyawan" :value="map.kpi.employees" :note="`${map.kpi.divisions} divisi`" />
            <UiKpiCard label="Memenuhi syarat jenjang berikutnya" :value="map.kpi.eligible" :note="`program dan OKR ≥ ${map.okrMin}%; belum keputusan`" />
            <UiKpiCard label="Menunggu keputusan" :value="map.kpi.awaitingDecision" note="atasan atau HR" />
            <UiKpiCard label="Belum memenuhi kompetensi jabatan" :value="map.kpi.belowCurrent" note="perlu lulus program tingkat jabatannya" />
          </div>
          <div class="cp-row" style="margin:16px 0 12px;gap:8px">
            <span class="el-muted" style="font-weight:500" aria-hidden="true">Divisi:</span>
            <UiSegmented v-model="division" :options="divisionOptions" label="Divisi" />
          </div>
          <UiDataTable :columns="MAP_COLUMNS" :rows="people" row-key="id" caption="Karyawan dan status jenjang" caption-hidden empty-text="Belum ada karyawan.">
            <!-- CP-4 / K-P7-3: baris dipilih lewat tombol nama (keyboard), baris terpilih disorot -->
            <template #cell-name="{ row }"><button type="button" class="cp-pick" :aria-current="row.id === selected ? 'true' : undefined" :aria-label="`Pilih ${row.name ?? ''}`" @click="selected = String(row.id)">{{ row.name ?? '(tanpa nama)' }}</button><div class="el-muted" style="font-size:12px">{{ row.jobRoleName ?? 'Tanpa jabatan' }}</div></template>
            <template #cell-division="{ value }">{{ value ?? 'Tanpa divisi' }}</template>
            <template #cell-level="{ row }"><UiChip v-if="row.level" tone="training">{{ row.level.name }}</UiChip><span v-else class="el-muted">–</span></template>
            <template #cell-programs="{ row }">
              <UiChip v-if="!row.programs.length">Belum ada kamus</UiChip>
              <span v-else class="cp-row"><UiChip v-for="p in row.programs" :key="p.tier" :tone="p.passed ? 'success' : 'neutral'">{{ TIER_LABEL[p.tier] }}<span class="el-sr-only">{{ p.passed ? ' lulus' : ' belum lulus' }}</span></UiChip></span>
            </template>
            <template #cell-status="{ row }">
              <UiChip :tone="statusTone(row.status)">{{ statusText(row.status, row.nextLevel) }}</UiChip>
              <div v-if="statusSub(row as unknown as MapRow)" class="el-muted" style="font-size:12px;margin-top:2px">{{ statusSub(row as unknown as MapRow) }}</div>
            </template>
          </UiDataTable>

          <UiCard v-if="evidence" style="margin-top:16px" data-testid="cp-evidence">
            <div class="cp-between">
              <div>
                <h2 class="el-h3" style="margin:0">Bukti untuk {{ evidence.person.name ?? '(tanpa nama)' }}</h2>
                <div class="el-muted">{{ [evidence.person.division, evidence.person.jobRoleName, evidence.person.level?.name].filter(Boolean).join(' · ') }}</div>
              </div>
              <UiChip :tone="statusTone(evidence.status)">{{ statusText(evidence.status, evidence.nextLevel) }}</UiChip>
            </div>
            <div class="el-grid el-grid-4" style="margin-top:12px">
              <div class="cp-mod"><span class="el-muted" style="font-size:12px">Program lulus</span><b>{{ evidence.programsPassed.length ? evidence.programsPassed.map((t) => TIER_LABEL[t]).join(', ') : 'Belum ada' }}</b></div>
              <div class="cp-mod"><span class="el-muted" style="font-size:12px">Pencapaian OKR (syarat ≥ {{ evidence.okr?.min ?? okrMin }}%)</span><b>{{ evidence.okr ? `${fmtPct(evidence.okr.achievement)} · ${evidence.okr.met ? 'terpenuhi' : 'belum'}` : 'Belum ada data' }}</b><span v-if="evidence.okr?.period" class="el-muted" style="font-size:12px">Periode {{ evidence.okr.period }}</span></div>
              <div class="cp-mod"><span class="el-muted" style="font-size:12px">Wawancara ulang AI</span><b>Belum tersedia</b></div>
              <div class="cp-mod"><span class="el-muted" style="font-size:12px">Review atasan</span><b>{{ evidence.supervisorRecommendation ? `${decisionText[evidence.supervisorRecommendation.decision]} oleh ${evidence.supervisorRecommendation.byName ?? 'atasan'}` : 'Belum ada' }}</b></div>
            </div>
            <p class="el-muted" style="font-size:12px;margin-top:8px">Promosi memerlukan dua syarat: lulus program jenjang berikutnya dan OKR ≥ {{ okrMin }}%. AI hanya menyusun ringkasan dan tidak merekomendasikan keputusan.</p>
          </UiCard>
        </template>
      </div>

      <div v-else-if="tab === 'path'" id="cp-panel-path" role="tabpanel" aria-labelledby="cp-tab-path" data-testid="cp-path">
        <template v-if="paths">
          <UiNote v-if="!paths.jobRole" tone="info">Belum ada jabatan dengan jenjang karier.</UiNote>
          <template v-else>
            <UiNote tone="info" style="margin-bottom:12px">Jalur untuk jabatan <b>{{ paths.jobRole.name }}</b>. Jenjang jabatan lain mengikuti setelah kamus kompetensinya dibuat lewat DACUM.</UiNote>
            <div class="el-grid el-grid-3" style="align-items:stretch">
              <UiCard v-for="(l, i) in paths.levels" :key="l.id">
                <UiChip tone="training">Jenjang {{ i + 1 }}</UiChip>
                <h2 class="el-h2" style="margin:8px 0 4px">{{ l.name }}</h2>
                <p class="el-muted">{{ l.requiredProgramTier ? `Kompetensi jabatan: lulus program ${TIER_LABEL[l.requiredProgramTier]} (${l.moduleCount} modul).` : 'Belum ada syarat program.' }}</p>
                <div class="cp-mod" style="margin-top:12px">
                  <span class="cp-between"><span>Karyawan pada jenjang ini</span><b class="el-mono">{{ l.employees }}</b></span>
                  <span class="cp-between"><span>Sudah memenuhi syarat jenjang berikutnya</span><b class="el-mono">{{ l.readyForNext }}</b></span>
                </div>
                <p class="el-muted" style="font-size:13px;margin-top:12px">{{ ruleFor(i) }}</p>
              </UiCard>
            </div>
            <UiCard style="margin-top:16px">
              <h2 class="el-h3">Cara kerja kenaikan jabatan</h2>
              <div v-for="(f, i) in FLOW" :key="i" class="cp-flow"><UiChip :tone="f.tone">{{ f.who }}</UiChip><span>{{ f.t }}</span></div>
            </UiCard>
          </template>
        </template>
      </div>

      <div v-else id="cp-panel-dec" role="tabpanel" aria-labelledby="cp-tab-dec" data-testid="cp-dec">
        <template v-if="decisions">
          <UiNote tone="info" style="margin-bottom:12px">{{ decNote }}</UiNote>
          <p v-if="done" role="status" class="el-muted">{{ done }}</p>
          <UiDataTable :columns="DEC_COLUMNS" :rows="decisionRows" row-key="id" caption="Keputusan promosi" caption-hidden empty-text="Belum ada karyawan yang memenuhi syarat kompetensi.">
            <template #cell-employee="{ row }"><span style="font-weight:500">{{ row.employee.name ?? '(tanpa nama)' }}</span><div class="el-muted" style="font-size:12px">{{ row.employee.division ?? 'Tanpa divisi' }}</div></template>
            <template #cell-move="{ row }">{{ row.fromLevel?.name }} → {{ row.toLevel?.name }}</template>
            <template #cell-req="{ row }">
              <UiChip :tone="row.eligible ? 'success' : 'review'">{{ reqText(row as unknown as DecisionRow) }}</UiChip>
            </template>
            <template #cell-supervisor="{ row }">
              <UiChip :tone="decisionTone(row.supervisor?.decision)">{{ row.supervisor ? SUPERVISOR_TEXT[row.supervisor.decision] : 'Belum' }}</UiChip>
              <UiAuditLine v-if="row.supervisor" :items="[row.supervisor.byName ?? 'atasan', fmtTime(row.supervisor.at)]" />
              <div v-if="row.supervisor?.note" class="el-muted" style="font-size:12px">{{ row.supervisor.note }}</div>
            </template>
            <template #cell-hr="{ row }">
              <UiChip :tone="decisionTone(row.hr?.decision)">{{ row.hr ? decisionText[row.hr.decision] : 'Menunggu' }}</UiChip>
              <UiAuditLine v-if="row.hr" :items="[row.hr.byName ?? 'HR', fmtTime(row.hr.at)]" />
              <div v-if="row.hr?.note" class="el-muted" style="font-size:12px">{{ row.hr.note }}</div>
            </template>
            <template #cell-actions="{ row }">
              <div v-if="row.actions.length" class="cp-actions">
                <span class="cp-row">
                  <UiButton v-for="a in row.actions" :key="a" :variant="a === 'hold' ? 'outlined' : 'tonal'" size="sm" :disabled="busy !== null"
                    :aria-label="`${ACTION_LABEL[a]} ${row.employee.name ?? ''}`" @click="act(row, a)">{{ ACTION_LABEL[a] }}</UiButton>
                </span>
                <!-- CP-10: catatan audit dipertahankan di pola sekunder -->
                <details class="cp-note">
                  <summary>Tambah catatan<span class="el-sr-only"> untuk {{ row.employee.name }}</span></summary>
                  <label class="el-sr-only" :for="`note-${row.id}`">Catatan untuk {{ row.employee.name }}</label>
                  <input :id="`note-${row.id}`" v-model="notes[row.id]" class="el-input" maxlength="2000" placeholder="Catatan (opsional)" />
                </details>
              </div>
              <span v-else class="el-muted" style="font-size:13px">{{ BLOCKED[row.blockedReason ?? ''] ?? '–' }}</span>
            </template>
          </UiDataTable>
          <p class="el-muted" style="font-size:12px;margin-top:8px">Keputusan dicatat dengan nama pengambil keputusan dan waktunya untuk keperluan audit.</p>
        </template>
      </div>
    </template>
  </AppShell>
</template>

<style>
.cp-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.cp-between { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.cp-mod { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--el-outline-variant); background: var(--el-surface-card); }
.cp-flow { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--el-outline-variant); }
.cp-actions { display: flex; flex-direction: column; gap: 6px; min-width: 200px; }
.cp-pick { border: 0; background: none; padding: 0; font: inherit; font-weight: 500; color: inherit; cursor: pointer; text-align: left; }
.cp-pick:hover { text-decoration: underline; }
/* baris terpilih latar abu (mockup #ECEFF5) */
[data-testid='cp-map'] tr:has(.cp-pick[aria-current='true']) td { background: var(--el-surface-2); }
.cp-note > summary { cursor: pointer; color: var(--el-primary); font-size: 13px; }
.cp-note .el-input { margin-top: 6px; }
</style>
