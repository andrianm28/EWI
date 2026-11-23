<script setup lang="ts">
// Library modul KSA (mockup Pak Eji, layar `lib`): KPI, prioritas Pareto, filter, daftar, dan detail modul.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import './li.css'
import { ApiError } from '@/api/client'
import { UiBreadcrumb, UiButton, UiCard, UiChip, UiKpiCard, UiNote, UiSegmented } from '@/ui'
import { li, type CatalogItem, type Library, type ModuleDetail, type ModuleRow } from './api'
import { KIND_LABEL, LEVEL_LABEL, jobChip, pct, priorityLabel, shortVendor, statusLabel } from './labels'

const route = useRoute()
const router = useRouter()
const lib = ref<Library | null>(null)
const detail = ref<ModuleDetail | null>(null)
const error = ref('')
const notice = ref('')
const busy = ref(false)
const filter = reactive({ jobRoleId: '', priority: '', type: '', level: '', stream: '' })
const catalog = ref<CatalogItem[]>([])
const courseId = ref('')

// Penjaga urutan: filter bisa diganti sebelum respons sebelumnya tiba; hanya respons permintaan terakhir yang dipakai.
let listSeq = 0
let detailSeq = 0
async function load() {
  const seq = ++listSeq
  try {
    const res = await li.library({ ...filter })
    if (seq !== listSeq) return
    lib.value = res
    error.value = ''
    const keep = detail.value && res.data.find((m) => m.id === detail.value!.id)
    const first = keep ?? res.data.find((m) => m.id === route.query.modul) ?? res.data[0]
    if (first) await pick(first)
    else { detailSeq++; detail.value = null }
  } catch (e) { if (seq === listSeq) error.value = e instanceof ApiError ? e.message : 'Library tidak bisa dimuat' }
}
async function pick(m: ModuleRow) {
  const seq = ++detailSeq
  try {
    const res = (await li.module(m.id, filter.jobRoleId || undefined)).data
    if (seq === detailSeq) detail.value = res
  } catch (e) { if (seq === detailSeq) error.value = e instanceof ApiError ? e.message : 'Modul tidak bisa dimuat' }
}
const filtered = computed(() => Object.values(filter).some(Boolean))
function clearFilters() { Object.assign(filter, { jobRoleId: '', priority: '', type: '', level: '', stream: '' }) }
onMounted(async () => {
  await load()
  try { catalog.value = (await li.catalog()).data } catch { /* tanpa katalog, tautan course disembunyikan */ }
})
watch(filter, load)

const vendor = computed(() => lib.value?.vendorName ?? 'vendor')
const groups = computed(() => (['K', 'S', 'A'] as const).map((k) => ({ kind: k, label: KIND_LABEL[k], items: (detail.value?.items ?? []).filter((i) => i.kind === k) })).filter((g) => g.items.length))

// Filter = baris label + chip (LI-5). Kunci '' berarti "Semua", sama dengan kontrak li.library(filter).
type FilterKey = keyof typeof filter
const filterRows = computed<{ key: FilterKey; label: string; options: { key: string; label: string }[] }[]>(() => {
  const f = lib.value?.filters
  if (!f) return []
  const all = (label = 'Semua') => ({ key: '', label })
  return [
    { key: 'jobRoleId', label: 'Jabatan', options: [all('Semua jabatan'), ...f.jobRoles.map((j) => ({ key: j.id, label: j.name }))] },
    { key: 'priority', label: 'Prioritas', options: [all('Semua modul'), { key: 'pareto', label: 'Prioritas Pareto saja' }] },
    { key: 'type', label: 'Tipe', options: [all(), ...Object.entries(KIND_LABEL).map(([key, label]) => ({ key, label }))] },
    { key: 'level', label: 'Level', options: [all(), ...Object.entries(LEVEL_LABEL).map(([key, label]) => ({ key, label }))] },
    { key: 'stream', label: 'Rumpun', options: [all(), ...f.streams.map((s) => ({ key: s, label: s }))] },
  ]
})
const jobName = computed(() => lib.value?.filters.jobRoles.find((j) => j.id === filter.jobRoleId)?.name ?? '')
const onlyJob = computed(() => (lib.value?.filters.jobRoles.length === 1 ? lib.value.filters.jobRoles[0]!.name : ''))
// N2: tenant dengan satu jabatan menyebut jabatan itu walau filter "Semua jabatan" (mockup)
const gapOf = computed(() => (jobName.value || onlyJob.value ? `total gap jabatan ${jobName.value || onlyJob.value}` : 'total gap'))
const paretoNote = computed(() => {
  const p = lib.value?.pareto
  if (!p) return ''
  if (!p.available) return 'Training Needs belum aktif untuk tenant ini, jadi prioritas belum bisa dihitung.'
  if (!p.count) return 'Belum ada gap training yang terhubung ke modul. Prioritas muncul setelah hasil Training Needs tersedia.'
  const head = `${p.count} modul prioritas Pareto (${p.codes.join(', ')}) menyumbang sekitar ${pct(p.cumulativeShare)} ${gapOf.value}. ${p.withoutGapData} modul lain belum punya data gap.`
  // jumlah modul prioritas yang spesifik perusahaan hanya benar bila daftar tidak dipersempit filter lain
  const narrowed = filter.priority || filter.type || filter.level || filter.stream
  const dev = narrowed ? 0 : (lib.value?.data ?? []).filter((m) => m.priority && m.recommendation === 'dev').length
  return dev ? `${head} ${dev} modul prioritas bersifat spesifik perusahaan dan perlu dikembangkan bersama ELGOS.` : head
})

async function act(fn: () => Promise<string>) {
  busy.value = true; notice.value = ''; error.value = ''
  try { notice.value = await fn(); await load() } catch (e) { error.value = e instanceof ApiError ? e.message : 'Tindakan gagal' } finally { busy.value = false }
}
const requestOne = (m: ModuleDetail) => act(async () => { await li.requestModule(m.id); return `Permintaan ${m.code} dicatat. Hubungi ${vendor.value} untuk meneruskannya.` })
const requestPriority = () => act(async () => {
  const { data } = await li.requestBulk({ scope: 'pareto', jobRoleId: filter.jobRoleId || undefined })
  return data.created ? `${data.created} permintaan dicatat.` : 'Tidak ada modul prioritas generik yang masih tanpa sumber.'
})
const linkCourse = (m: ModuleDetail, id: string | null) => act(async () => { await li.linkCourse(m.id, id); courseId.value = ''; return id ? 'Course ditautkan. Modul kini tersedia.' : 'Tautan course dilepas.' })
async function develop(m: ModuleDetail) {
  busy.value = true; error.value = ''
  try { const { data } = await li.startDraft(m.id); await router.push({ name: 'req-draf', params: { id: data.id } }) }
  catch (e) { error.value = e instanceof ApiError ? e.message : 'Draf tidak bisa dibuat' } finally { busy.value = false }
}
</script>

<template>
  <AppShell>
    <UiBreadcrumb :items="[{ label: 'Learning Intervention' }, { label: 'Library' }]" />
    <h1 class="el-h1">Library</h1>
    <p class="el-muted"><template v-if="onlyJob">Saat ini seluruh modul berlaku untuk jabatan {{ onlyJob }}. </template>Semua modul Knowledge, Skill, dan Attitude (KSA) yang teridentifikasi dari DACUM Tool 2. Setiap modul dapat diminta dari {{ vendor }} atau dikembangkan bersama ELGOS.</p>

    <UiNote v-if="error" tone="critical" data-testid="galat">{{ error }}</UiNote>
    <UiNote v-if="notice" tone="success" data-testid="info">{{ notice }}</UiNote>

    <template v-if="lib">
      <div class="el-grid el-grid-4 li-gap">
        <UiKpiCard label="Modul" :value="lib.kpis.modules" :note="`DACUM Tool 2 dan 3, ${lib.kpis.streams} rumpun`" />
        <UiKpiCard label="Butir Knowledge" :value="lib.kpis.knowledge" note="pengetahuan" />
        <UiKpiCard label="Butir Skill" :value="lib.kpis.skill" note="keterampilan" />
        <UiKpiCard label="Butir Attitude" :value="lib.kpis.attitude" note="sikap kerja" />
      </div>

      <UiNote class="li-row li-gap">
        <span><b>Prioritas Pareto 20/80:</b> {{ paretoNote }}</span>
        <UiButton v-if="lib.pareto.count" size="sm" :disabled="busy" @click="requestPriority">Minta modul prioritas yang generik ke {{ shortVendor(vendor) }}</UiButton>
      </UiNote>

      <UiCard tonal class="li-filter li-gap" data-testid="filter-modul">
        <div v-for="r in filterRows" :key="r.key" class="li-filter__row">
          <span class="li-filter__label" aria-hidden="true">{{ r.label }}</span>
          <UiSegmented v-model="filter[r.key]" variant="chips" :label="r.label" :options="r.options" />
        </div>
      </UiCard>

      <div class="li-split li-gap">
        <div>
          <p class="el-muted li-count" data-testid="jumlah-modul">{{ lib.data.length }} dari {{ lib.kpis.modules }} modul</p>
          <p v-if="!lib.kpis.modules" class="el-muted">Belum ada modul. Impor library modul (templat nomor 9) lewat menu impor data.</p>
          <UiCard v-else-if="!lib.data.length" class="li-row">
            <span class="el-muted">Tidak ada modul yang cocok dengan filter.</span>
            <UiButton v-if="filtered" variant="text" size="sm" @click="clearFilters">Hapus semua filter</UiButton>
          </UiCard>
          <ul v-else class="li-list" aria-label="Daftar modul">
            <li v-for="m in lib.data" :key="m.id">
              <button type="button" class="li-item" :aria-current="detail?.id === m.id ? 'true' : undefined" @click="pick(m)">
                <span class="el-mono li-code">{{ m.code }}</span>
                <span class="li-item__body">
                  <span class="li-item__name">{{ m.name }}</span>
                  <span class="el-muted li-meta">{{ m.stream ?? 'Tanpa rumpun' }} · {{ LEVEL_LABEL[m.level] }}</span>
                  <span class="li-chips li-chips--tight">
                    <UiChip>K {{ m.counts.K }}</UiChip><UiChip>S {{ m.counts.S }}</UiChip><UiChip>A {{ m.counts.A }}</UiChip>
                    <UiChip tone="training">{{ jobChip(m) }}</UiChip>
                    <UiChip v-if="m.priority" tone="critical">{{ priorityLabel(m) }}</UiChip>
                  </span>
                </span>
                <UiChip :tone="statusLabel(m.status.key, vendor).tone">{{ statusLabel(m.status.key, vendor).text }}</UiChip>
              </button>
            </li>
          </ul>
        </div>

        <UiCard v-if="detail" as="section" aria-label="Detail modul" data-testid="detail-modul" class="li-detail">
          <p class="li-chips li-chips--tight"><UiChip class="el-mono">{{ detail.code }}</UiChip><UiChip tone="training">{{ LEVEL_LABEL[detail.level] }}</UiChip><UiChip>{{ detail.stream ?? 'Tanpa rumpun' }}</UiChip></p>
          <h2 class="el-h2">{{ detail.name }}</h2>
          <p class="li-chips">
            <UiChip :tone="statusLabel(detail.status.key, vendor).tone">{{ statusLabel(detail.status.key, vendor).text }}</UiChip>
            <UiChip v-if="detail.priority" tone="critical">{{ priorityLabel(detail) }}</UiChip>
          </p>
          <p v-if="detail.priority" class="el-muted li-small">Termasuk modul yang bersama-sama menyumbang sekitar {{ pct(detail.priority.cumulativeShare) }} {{ gapOf }} (kumulatif sampai urutan ini). Sediakan lebih dulu.</p>
          <p v-else-if="lib.pareto.count" class="el-muted li-small">Tidak termasuk modul prioritas Pareto.</p>
          <h3 class="el-h3">Berlaku untuk jabatan</h3>
          <p class="li-chips li-chips--tight">
            <UiChip v-for="j in detail.jobRoles" :key="j.id" tone="training">{{ j.name }}</UiChip>
            <span v-if="!detail.jobRoles.length" class="el-muted">Belum ada jabatan</span>
          </p>
          <p class="el-muted li-small">Satu modul dapat dipakai untuk beberapa jabatan. Jabatan lain ditambahkan setelah kamus kompetensinya tersedia.</p>
          <h3 class="el-h3">Tujuan pembelajaran (DACUM)</h3>
          <p class="el-muted">{{ detail.objective || 'Belum diisi.' }}</p>
          <div v-for="g in groups" :key="g.kind">
            <h4 class="li-h4">{{ g.label }} ({{ g.items.length }})</h4>
            <ul class="li-ksa"><li v-for="(it, i) in g.items" :key="i">{{ it.text }}</li></ul>
          </div>
          <UiNote class="li-gap li-small">
            <b>Sumber yang disarankan: {{ detail.recommendation === 'dev' ? 'Dikembangkan bersama ELGOS' : vendor }}.</b>
            {{ detail.recommendation === 'dev' ? 'Topik spesifik proses perusahaan, sehingga kecil kemungkinan ada di katalog umum.' : 'Topik generik yang dapat disediakan mitra pelatihan.' }}
            Usulan awal, dapat diubah.
          </UiNote>
          <template v-if="detail.status.key === 'none'">
            <div class="li-actions li-actions--row">
              <UiButton icon="inventory_2" :disabled="busy" aria-describedby="li-minta-hint" @click="requestOne(detail)">Minta ke {{ vendor }}</UiButton>
              <UiButton variant="tonal" icon="auto_awesome" :disabled="busy" @click="develop(detail)">Kembangkan dengan ELGOS</UiButton>
            </div>
            <!-- P8 R20 (PK-1, LI-4): kalimat vendor jadi petunjuk kecil di bawah tombol -->
            <p id="li-minta-hint" class="el-muted li-hint">Tombol Minta hanya mencatat permintaan di ELGOS; ELGOS tidak mengirim apa pun ke {{ vendor }}.</p>
          </template>
          <div v-else-if="detail.draft" class="li-actions">
            <UiButton variant="tonal" :to="{ name: 'req-draf', params: { id: detail.draft.id } }">Buka rancangan modul</UiButton>
          </div>
          <p v-else-if="detail.request && detail.request.status !== 'installed'" class="el-muted">Permintaan sudah dicatat. Pantau di <RouterLink :to="{ name: 'req' }">Permintaan &amp; pengembangan</RouterLink>.</p>
          <section v-if="catalog.length" class="li-gap" aria-label="Course di katalog">
            <h3 class="el-h3">Course di katalog</h3>
            <p v-if="detail.catalogItemId" class="li-row">
              <span>Tertaut ke {{ catalog.find((c) => c.id === detail!.catalogItemId)?.title ?? 'course katalog' }}.</span>
              <UiButton variant="text" size="sm" :disabled="busy" @click="linkCourse(detail, null)">Lepas tautan</UiButton>
            </p>
            <div v-else class="li-filters">
              <p class="el-muted li-small">Tautkan course yang sudah dipasang di LMS atau EliteMentor supaya modul ini tersedia di rencana belajar.</p>
              <label class="el-label">Pilih course
                <select v-model="courseId" class="el-input"><option value="">Pilih course</option><option v-for="c in catalog" :key="c.id" :value="c.id">{{ c.title }}</option></select>
              </label>
              <UiButton variant="tonal" size="sm" :disabled="busy || !courseId" @click="linkCourse(detail, courseId)">Tautkan course</UiButton>
            </div>
          </section>
        </UiCard>
      </div>
    </template>
  </AppShell>
</template>
