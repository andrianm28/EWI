<script setup lang="ts">
// Learning Delivery (mockup Pak Eji, layar `ld`): Ringkasan, Sedang berjalan, Akan datang, Pelatihan offline.
import { computed, nextTick, onMounted, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { UiBreadcrumb, UiButton, UiCard, UiChip, UiDataTable, UiField, UiKpiCard, UiNote, UiProgressBar, UiSegmented, UiTabs, type UiColumn } from '@/ui'
import { ld, type Dashboard, type Training } from './api'
import { routeOpen } from '@/router'
import { ACTION_LABEL, SENT_NOUN, CHECK_LABEL, CHECK_SHORT, HEALTH, MODE, SOURCE_LABEL, TIER_LABEL, tanggal, tanggalPendek } from './labels'
import OfflinePanel from './OfflinePanel.vue'

const TABS = [{ key: 'ringkasan', label: 'Ringkasan' }, { key: 'berjalan', label: 'Sedang berjalan' }, { key: 'akan-datang', label: 'Akan datang' }, { key: 'offline', label: 'Pelatihan offline' }]
const tab = ref('ringkasan')
const mode = ref('semua')
const dash = ref<Dashboard | null>(null)
const rows = ref<Training[]>([])
const error = ref('')
const notice = ref('')
const busy = ref(false)
const openId = ref<string | null>(null)
const dates = ref({ id: '', startsOn: '', endsOn: '' })
const onlineRows = computed(() => rows.value.filter((t) => t.source !== 'manual' && ['running', 'upcoming'].includes(t.group)))
function pickDates(id: string) { const t = rows.value.find((x) => x.id === id); dates.value = { id, startsOn: t?.startsOn ?? '', endsOn: t?.endsOn ?? '' } }
async function saveDates() {
  busy.value = true; error.value = ''; notice.value = ''
  try { await ld.patch(dates.value.id, { startsOn: dates.value.startsOn || null, endsOn: dates.value.endsOn || null }); notice.value = 'Tanggal pelatihan disimpan.'; await load() }
  catch (e) { error.value = e instanceof ApiError ? e.message : 'Tanggal tidak bisa disimpan' } finally { busy.value = false }
}

async function load() {
  try {
    const [d, t] = await Promise.all([ld.dashboard(), ld.trainings()])
    dash.value = d.data; rows.value = t.data; error.value = ''
  } catch (e) { error.value = e instanceof ApiError ? e.message : 'Data pelatihan tidak bisa dimuat' }
}
onMounted(load)

const running = computed(() => rows.value.filter((t) => t.group === 'running' && (mode.value === 'semua' || t.mode === mode.value)))
const upcoming = computed(() => rows.value.filter((t) => t.group === 'upcoming'))
const offline = computed(() => rows.value.filter((t) => t.source === 'manual'))
const RUN_COLS: UiColumn[] = [
  { key: 'title', label: 'Program, course, atau modul', sortable: true }, { key: 'source', label: 'Sumber data' },
  { key: 'participants', label: 'Peserta', align: 'right', sortable: true }, { key: 'progressPct', label: 'Progres', sortable: true },
  { key: 'health', label: 'Status' }, { key: 'endsOn', label: 'Batas', sortable: true },
]
const SOON_COLS: UiColumn[] = [
  { key: 'startsOn', label: 'Tanggal', sortable: true }, { key: 'title', label: 'Pelatihan' }, { key: 'mode', label: 'Jenis' },
  { key: 'checks', label: 'Kesiapan' }, { key: 'aksi', label: 'Tindakan' },
]
const asRow = (t: Training) => t as unknown as Record<string, unknown>
const asTraining = (r: Record<string, unknown>) => r as unknown as Training

/** Subjudul baris berjalan (LD-5): kode modul · tier · vendor, yang tersedia saja. */
const runSub = (t: Training) => [t.moduleCode, t.programTier ? TIER_LABEL[t.programTier] ?? t.programTier : null, t.vendorName].filter(Boolean).join(' · ')
/** Baris saran kesiapan (LD-8): cek pertama yang belum siap. */
function readinessTip(t: Training) {
  const miss = t.checks.find((c) => !c.ok)
  return miss ? `Saran: siapkan ${CHECK_LABEL[miss.key].toLowerCase()} sebelum hari-H` : 'Siap dilaksanakan'
}
/** Subjudul baris akan datang (LD-8): vendor · tempat. */
const soonSub = (t: Training) => [t.vendorName ?? SOURCE_LABEL[t.source], t.venue ?? (t.mode === 'offline' ? 'tempat belum diisi' : null)].filter(Boolean).join(' · ')
async function toSaran() { tab.value = 'ringkasan'; await nextTick(); document.getElementById('ld-saran')?.focus() }
function open(id: string) { openId.value = id; tab.value = 'offline' }
// Aksi yang sudah terkirim di kunjungan ini (mockup ldDone): tombol berganti teks selesai dan nonaktif
const done = ref<Record<string, boolean>>({})
async function runAction(a: Dashboard['actions'][number]) {
  const t = rows.value.find((x) => x.id === a.trainingId)
  if (a.kind === 'open_training') { if (t?.source === 'manual') return open(a.trainingId); tab.value = 'berjalan'; return }
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const { data } = await ld.remind(a.trainingId, a.kind)
    done.value = { ...done.value, [a.key]: true }
    notice.value = `${SENT_NOUN[a.kind]} dikirim ke ${data.sent} dari ${data.recipients} peserta${data.failed ? `, ${data.failed} gagal` : ''}.`
  } catch (e) {
    // jatah 24 jam per pelatihan sudah terpakai: pesan sudah terkirim sebelumnya, tombol ditandai selesai
    if (e instanceof ApiError && e.code === 'REMINDER_RECENT') done.value = { ...done.value, [a.key]: true }
    error.value = e instanceof ApiError ? e.message : 'Pesan gagal dikirim'
  } finally { busy.value = false }
}
/** "Lihat program" (mockup ldSoon): baris online yang semua cek kesiapannya terpenuhi, bila layar Program terbuka. */
const progOpen = computed(() => routeOpen('prog', 'hr'))
const ready = (t: Training) => t.checks.every((c) => c.ok)
</script>

<template>
  <AppShell>
    <UiBreadcrumb :items="[{ label: 'Learning Delivery' }]" />
    <h1 class="el-h1">Learning Delivery</h1>
    <p class="el-muted ld-sub">Pelatihan yang sedang dan akan berjalan. Pelatihan online diambil otomatis dari ELGOS, EliteMentor, atau LMS; pelatihan offline diinput ke ELGOS.</p>
    <UiNote v-if="error" tone="critical" data-testid="galat">{{ error }}</UiNote>
    <div v-if="notice" role="status"><UiNote tone="success" data-testid="info">{{ notice }}</UiNote></div>
    <UiTabs id="ld" v-model="tab" :tabs="TABS" label="Bagian Learning Delivery" class="ld-gap" />

    <div v-if="tab === 'ringkasan' && dash" id="ld-panel-ringkasan" role="tabpanel" aria-labelledby="ld-tab-ringkasan">
      <div class="el-grid el-grid-4 ld-gap">
        <UiKpiCard label="Program berjalan" :value="dash.kpis.running" :note="`${dash.kpis.online} online, ${dash.kpis.offline} offline`" />
        <UiKpiCard label="Peserta aktif" :value="dash.kpis.activeLearners" note="belum selesai" />
        <UiKpiCard label="Rata-rata progres" :value="`${dash.kpis.avgProgress}%`" note="rata-rata antar program" />
        <UiKpiCard label="Perlu perhatian" :value="dash.kpis.attention" note="terlambat atau di bawah jadwal" />
      </div>
      <div class="el-grid el-grid-2 ld-gap">
        <UiCard as="section" aria-label="Insight">
          <h2 class="el-h3">Insight</h2>
          <p class="el-muted ld-small">Dihitung dari data pelatihan dengan aturan tetap, bukan oleh AI.</p>
          <p v-if="!dash.insights.length" class="el-muted">Tidak ada yang perlu diperhatikan saat ini.</p>
          <div v-for="i in dash.insights" :key="i.key" class="ld-mod ld-mb">
            <div class="ld-head"><b>{{ i.title }}</b><UiChip>{{ i.source }}</UiChip></div>
            <p class="el-muted ld-small">{{ i.detail }}</p>
          </div>
        </UiCard>
        <UiCard as="section" aria-label="Saran tindakan untuk HR">
          <h2 id="ld-saran" class="el-h3" tabindex="-1">Saran tindakan untuk HR</h2>
          <p v-if="!dash.actions.length" class="el-muted">Belum ada saran tindakan.</p>
          <div v-for="a in dash.actions" :key="a.key" class="ld-item ld-row">
            <div class="ld-min"><p class="ld-strong">{{ a.title }}</p><p class="el-muted ld-xs">{{ a.detail }}</p></div>
            <UiButton variant="tonal" size="sm" :disabled="busy || done[a.key]" @click="runAction(a)">{{ done[a.key] ? ACTION_LABEL[a.kind].done : ACTION_LABEL[a.kind].cta }}</UiButton>
          </div>
        </UiCard>
      </div>
    </div>

    <div v-else-if="tab === 'berjalan'" id="ld-panel-berjalan" role="tabpanel" aria-labelledby="ld-tab-berjalan" class="ld-gap">
      <UiDataTable :columns="RUN_COLS" :rows="running.map(asRow)" row-key="id" caption="Pelatihan yang sedang berjalan" caption-hidden empty-text="Belum ada pelatihan yang berjalan.">
        <template #toolbar>
          <UiSegmented v-model="mode" label="Jenis" :options="[{ key: 'semua', label: 'Semua' }, { key: 'online', label: 'Online' }, { key: 'offline', label: 'Offline' }]" />
        </template>
        <template #cell-title="{ row }"><b>{{ asTraining(row).title }}</b><div v-if="runSub(asTraining(row))" class="el-muted ld-xs">{{ runSub(asTraining(row)) }}</div></template>
        <template #cell-source="{ row }"><UiChip :tone="MODE[asTraining(row).mode].tone">{{ MODE[asTraining(row).mode].text }}</UiChip><div class="el-muted ld-xs">{{ SOURCE_LABEL[asTraining(row).source] }}</div></template>
        <template #cell-participants="{ row }"><span class="el-mono">{{ asTraining(row).participants }}</span></template>
        <template #cell-progressPct="{ row }"><div class="ld-bar"><UiProgressBar :value="asTraining(row).progressPct" :tone="asTraining(row).health === 'late' ? 'critical' : 'primary'" :label="`Progres ${asTraining(row).title}`" /><span class="el-mono ld-pct">{{ asTraining(row).progressPct }}%</span></div></template>
        <template #cell-health="{ row }"><UiChip :tone="HEALTH[asTraining(row).health].tone">{{ HEALTH[asTraining(row).health].text }}</UiChip></template>
        <template #cell-endsOn="{ row }"><span class="el-mono">{{ tanggalPendek(asTraining(row).endsOn) }}</span></template>
      </UiDataTable>
      <UiNote class="ld-gap-s">Data pelatihan online masuk otomatis; progres, skor, dan kehadiran offline berasal dari input HR di tab Pelatihan offline.</UiNote>
      <!-- LD-7: fitur kelola di luar mockup dipertahankan di pola sekunder (K-P7-2) -->
      <details v-if="onlineRows.length" class="ld-more ld-gap">
        <summary>Kelola tanggal pelatihan online</summary>
        <UiCard tonal class="ld-gap-s" as="section" aria-label="Atur tanggal pelatihan online">
          <p class="el-muted ld-small">Data lain datang dari EliteMentor atau LMS. Batas yang diisi HR tidak ditimpa sinkron.</p>
          <form class="ld-dates" @submit.prevent="saveDates">
            <UiField id="ld-tgl-pelatihan" v-slot="{ attrs }" label="Pelatihan">
              <select v-bind="attrs" v-model="dates.id" class="el-input" @change="pickDates(dates.id)"><option value="">Pilih pelatihan</option><option v-for="t in onlineRows" :key="t.id" :value="t.id">{{ t.title }}</option></select>
            </UiField>
            <UiField id="ld-tgl-mulai" v-slot="{ attrs }" label="Tanggal mulai"><input v-bind="attrs" v-model="dates.startsOn" class="el-input" type="date" :disabled="!dates.id"></UiField>
            <UiField id="ld-tgl-batas" v-slot="{ attrs }" label="Batas"><input v-bind="attrs" v-model="dates.endsOn" class="el-input" type="date" :disabled="!dates.id"></UiField>
            <UiButton type="submit" variant="tonal" size="sm" :disabled="busy || !dates.id">Simpan tanggal</UiButton>
          </form>
        </UiCard>
      </details>
    </div>

    <div v-else-if="tab === 'akan-datang'" id="ld-panel-akan-datang" role="tabpanel" aria-labelledby="ld-tab-akan-datang" class="ld-gap">
      <UiDataTable :columns="SOON_COLS" :rows="upcoming.map(asRow)" row-key="id" caption="Pelatihan yang akan datang" caption-hidden empty-text="Belum ada pelatihan yang dijadwalkan.">
        <template #cell-startsOn="{ row }"><span class="el-mono">{{ tanggal(asTraining(row).startsOn) }}</span></template>
        <template #cell-title="{ row }"><b>{{ asTraining(row).title }}</b><div class="el-muted ld-xs">{{ soonSub(asTraining(row)) }}</div></template>
        <template #cell-mode="{ row }"><UiChip :tone="MODE[asTraining(row).mode].tone">{{ MODE[asTraining(row).mode].text }}</UiChip></template>
        <template #cell-checks="{ row }">
          <span class="ld-chips"><UiChip v-for="c in asTraining(row).checks" :key="c.key" :tone="c.ok ? 'success' : 'review'">{{ CHECK_SHORT[c.key] }}<span class="el-sr-only">{{ c.ok ? ': siap' : ': perlu disiapkan' }}</span></UiChip></span>
          <div class="el-muted ld-xs ld-tip">{{ readinessTip(asTraining(row)) }}</div>
        </template>
        <template #cell-aksi="{ row }">
          <UiButton v-if="asTraining(row).source === 'manual'" variant="tonal" size="sm" @click="open(asTraining(row).id)">Kelola<span class="el-sr-only"> {{ asTraining(row).title }}</span></UiButton>
          <UiButton v-else-if="progOpen && ready(asTraining(row))" variant="tonal" size="sm" :to="{ name: 'prog' }">Lihat program<span class="el-sr-only"> {{ asTraining(row).title }}</span></UiButton>
          <UiButton v-else variant="tonal" size="sm" @click="toSaran">Lihat saran<span class="el-sr-only"> {{ asTraining(row).title }}</span></UiButton>
        </template>
      </UiDataTable>
    </div>

    <div v-else-if="tab === 'offline'" id="ld-panel-offline" role="tabpanel" aria-labelledby="ld-tab-offline" class="ld-gap">
      <OfflinePanel v-model:selected="openId" :trainings="offline" @changed="load" />
    </div>
  </AppShell>
</template>

<style>
.ld-gap { margin-top: 16px; }
.ld-gap-s { margin-top: 12px; }
.ld-sub { margin: 0 0 4px; }
.ld-small { font-size: 13px; }
.ld-xs { font-size: 12px; }
.ld-min { min-width: 0; }
.ld-strong { font-weight: 500; }
.ld-mb { margin-bottom: 8px; }
.ld-pct { width: 36px; }
.ld-tip { margin-top: 4px; }
/* `.mod` mockup: kotak outlined radius 12 */
.ld-mod { border: 1px solid var(--el-outline-variant); border-radius: 12px; padding: 12px 14px; background: var(--el-surface-card); }
.ld-mod p { margin: 0; }
.ld-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.ld-more > summary { cursor: pointer; color: var(--el-primary); font-weight: 500; }
.ld-row { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.ld-item { padding: 12px 0; border-bottom: 1px solid var(--el-outline-variant); }
.ld-item p { margin: 0; }
.ld-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.ld-bar { display: flex; gap: 8px; align-items: center; min-width: 140px; }
.ld-bar > :first-child { flex: 1; }
.ld-dates { display: flex; gap: 12px; flex-wrap: wrap; align-items: end; }
</style>
