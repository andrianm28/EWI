<script setup lang="ts">
// Learning Delivery (mockup Pak Eji, layar `ld`): Ringkasan, Sedang berjalan, Akan datang, Pelatihan offline.
import { computed, onMounted, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { UiBreadcrumb, UiButton, UiCard, UiDataTable, UiKpiCard, UiNote, UiProgressBar, UiSegmented, UiStatus, UiTabs, type UiColumn } from '@/ui'
import { ld, type Dashboard, type Training } from './api'
import { CHECK_SHORT, HEALTH, SOURCE_LABEL, tanggal } from './labels'
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

function open(id: string) { openId.value = id; tab.value = 'offline' }
async function runAction(a: Dashboard['actions'][number]) {
  const t = rows.value.find((x) => x.id === a.trainingId)
  if (a.kind === 'open_training' && t?.source === 'manual') return open(a.trainingId)
  if (a.kind !== 'remind') { tab.value = 'berjalan'; return }
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const { data } = await ld.remind(a.trainingId)
    notice.value = `Pengingat dikirim ke ${data.sent} dari ${data.recipients} peserta${data.failed ? `, ${data.failed} gagal` : ''}.`
  } catch (e) { error.value = e instanceof ApiError ? e.message : 'Pengingat gagal dikirim' } finally { busy.value = false }
}
</script>

<template>
  <AppShell>
    <UiBreadcrumb :items="[{ label: 'Learning Delivery' }]" />
    <h1 class="el-h1">Learning Delivery</h1>
    <p class="el-muted">Pelatihan yang sedang dan akan berjalan. Pelatihan online diambil otomatis dari EliteMentor atau LMS; pelatihan offline diinput ke ELGOS.</p>
    <UiNote v-if="error" tone="critical" data-testid="galat">{{ error }}</UiNote>
    <UiNote v-if="notice" tone="success" data-testid="info">{{ notice }}</UiNote>
    <UiTabs id="ld" v-model="tab" :tabs="TABS" label="Bagian Learning Delivery" class="ld-gap" />

    <div v-if="tab === 'ringkasan' && dash" id="ld-panel-ringkasan" role="tabpanel" aria-labelledby="ld-tab-ringkasan">
      <div class="el-grid el-grid-4 ld-gap">
        <UiKpiCard label="Program berjalan" :value="dash.kpis.running" :note="`${dash.kpis.online} online · ${dash.kpis.offline} offline`" />
        <UiKpiCard label="Peserta aktif" :value="dash.kpis.activeLearners" note="belum selesai" />
        <UiKpiCard label="Rata-rata progres" :value="`${dash.kpis.avgProgress}%`" />
        <UiKpiCard label="Perlu perhatian" :value="dash.kpis.attention"  />
      </div>
      <div class="el-grid el-grid-2 ld-gap">
        <UiCard as="section" aria-label="Insight">
          <h2 class="el-h3">Insight</h2>
          <p class="el-muted ld-small">Dihitung dari data pelatihan dengan aturan tetap, bukan oleh AI.</p>
          <p v-if="!dash.insights.length" class="el-muted">Tidak ada yang perlu diperhatikan saat ini.</p>
          <div v-for="i in dash.insights" :key="i.key" class="ld-item">
            <p><b>{{ i.title }}</b> <span class="el-pill">{{ i.source }}</span></p>
            <p class="el-muted ld-small">{{ i.detail }}</p>
          </div>
        </UiCard>
        <UiCard as="section" aria-label="Saran tindakan untuk HR">
          <h2 class="el-h3">Saran tindakan untuk HR</h2>
          <p v-if="!dash.actions.length" class="el-muted">Belum ada saran tindakan.</p>
          <div v-for="a in dash.actions" :key="a.key" class="ld-item ld-row">
            <div><p>{{ a.title }}</p><p class="el-muted ld-small">{{ a.detail }}</p></div>
            <UiButton variant="tonal" size="sm" :disabled="busy" @click="runAction(a)">{{ a.kind === 'remind' ? 'Kirim pengingat' : 'Buka pelatihan' }}</UiButton>
          </div>
        </UiCard>
      </div>
    </div>

    <div v-else-if="tab === 'berjalan'" id="ld-panel-berjalan" role="tabpanel" aria-labelledby="ld-tab-berjalan" class="ld-gap">
      <UiDataTable :columns="RUN_COLS" :rows="running.map(asRow)" row-key="id" caption="Pelatihan yang sedang berjalan" caption-hidden empty-text="Belum ada pelatihan yang berjalan.">
        <template #toolbar>
          <UiSegmented v-model="mode" label="Jenis" :options="[{ key: 'semua', label: 'Semua' }, { key: 'online', label: 'Online' }, { key: 'offline', label: 'Offline' }]" />
        </template>
        <template #cell-title="{ row }"><b>{{ asTraining(row).title }}</b><div v-if="asTraining(row).moduleCode" class="el-muted ld-small">Modul {{ asTraining(row).moduleCode }}</div></template>
        <template #cell-source="{ row }">{{ asTraining(row).mode === 'online' ? 'Online' : 'Offline' }}<div class="el-muted ld-small">{{ SOURCE_LABEL[asTraining(row).source] }}</div></template>
        <template #cell-progressPct="{ row }"><div class="ld-bar"><UiProgressBar :value="asTraining(row).progressPct" :label="`Progres ${asTraining(row).title}`" /><span>{{ asTraining(row).progressPct }}%</span></div></template>
        <template #cell-health="{ row }"><UiStatus :tone="HEALTH[asTraining(row).health].tone">{{ HEALTH[asTraining(row).health].text }}</UiStatus></template>
        <template #cell-endsOn="{ row }">{{ tanggal(asTraining(row).endsOn) }}</template>
      </UiDataTable>
      <UiCard v-if="onlineRows.length" tonal class="ld-gap" as="section" aria-label="Atur tanggal pelatihan online">
        <h2 class="el-h3">Atur tanggal pelatihan online</h2>
        <p class="el-muted ld-small">Data lain datang dari EliteMentor atau LMS. Batas yang diisi HR tidak ditimpa sinkron.</p>
        <form class="ld-dates" @submit.prevent="saveDates">
          <label class="el-label">Pelatihan
            <select v-model="dates.id" class="el-input" @change="pickDates(dates.id)"><option value="">Pilih pelatihan</option><option v-for="t in onlineRows" :key="t.id" :value="t.id">{{ t.title }}</option></select>
          </label>
          <label class="el-label">Tanggal mulai<input v-model="dates.startsOn" class="el-input" type="date" :disabled="!dates.id"></label>
          <label class="el-label">Batas<input v-model="dates.endsOn" class="el-input" type="date" :disabled="!dates.id"></label>
          <UiButton type="submit" variant="tonal" size="sm" :disabled="busy || !dates.id">Simpan tanggal</UiButton>
        </form>
      </UiCard>
      <p class="el-muted ld-small ld-gap">Data pelatihan online masuk otomatis; progres, skor, dan kehadiran offline berasal dari input HR di tab Pelatihan offline.</p>
    </div>

    <div v-else-if="tab === 'akan-datang'" id="ld-panel-akan-datang" role="tabpanel" aria-labelledby="ld-tab-akan-datang" class="ld-gap">
      <UiDataTable :columns="SOON_COLS" :rows="upcoming.map(asRow)" row-key="id" caption="Pelatihan yang akan datang" caption-hidden empty-text="Belum ada pelatihan yang dijadwalkan.">
        <template #cell-startsOn="{ row }">{{ tanggal(asTraining(row).startsOn) }}</template>
        <template #cell-title="{ row }"><b>{{ asTraining(row).title }}</b><div class="el-muted ld-small">{{ asTraining(row).vendorName ?? SOURCE_LABEL[asTraining(row).source] }}</div></template>
        <template #cell-mode="{ row }">{{ asTraining(row).mode === 'online' ? 'Online' : 'Offline' }}</template>
        <template #cell-checks="{ row }">
          <span class="ld-chips"><UiStatus v-for="c in asTraining(row).checks" :key="c.key" :tone="c.ok ? 'success' : 'warning'">{{ CHECK_SHORT[c.key] }}{{ c.ok ? '' : ' belum siap' }}</UiStatus></span>
        </template>
        <template #cell-aksi="{ row }"><UiButton v-if="asTraining(row).source === 'manual'" variant="tonal" size="sm" @click="open(asTraining(row).id)">Lengkapi</UiButton></template>
      </UiDataTable>
    </div>

    <div v-else-if="tab === 'offline'" id="ld-panel-offline" role="tabpanel" aria-labelledby="ld-tab-offline" class="ld-gap">
      <OfflinePanel v-model:selected="openId" :trainings="offline" @changed="load" />
    </div>
  </AppShell>
</template>

<style>
.ld-gap { margin-top: 16px; }
.ld-small { font-size: 13px; }
.ld-row { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.ld-item { padding: 12px 0; border-bottom: 1px solid var(--el-outline-variant); }
.ld-item p { margin: 0; }
.ld-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.ld-bar { display: flex; gap: 8px; align-items: center; min-width: 140px; }
.ld-bar > :first-child { flex: 1; }
.ld-dates { display: flex; gap: 12px; flex-wrap: wrap; align-items: end; }
</style>
