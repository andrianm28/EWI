<script setup lang="ts">
// Library modul KSA (mockup Pak Eji, layar `lib`): KPI, prioritas Pareto, filter, daftar, dan detail modul.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { UiButton, UiCard, UiChip, UiKpiCard, UiNote, UiStatus } from '@/ui'
import { li, type CatalogItem, type Library, type ModuleDetail, type ModuleRow } from './api'
import { KIND_LABEL, LEVEL_LABEL, jobLabel, pct, priorityLabel, statusLabel } from './labels'

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

async function load() {
  try {
    lib.value = await li.library(filter)
    error.value = ''
    const keep = detail.value && lib.value.data.find((m) => m.id === detail.value!.id)
    const first = keep ?? lib.value.data.find((m) => m.id === route.query.modul) ?? lib.value.data[0]
    if (first) await pick(first)
    else detail.value = null
  } catch (e) { error.value = e instanceof ApiError ? e.message : 'Library tidak bisa dimuat' }
}
async function pick(m: ModuleRow) {
  try { detail.value = (await li.module(m.id, filter.jobRoleId || undefined)).data } catch (e) { error.value = e instanceof ApiError ? e.message : 'Modul tidak bisa dimuat' }
}
onMounted(async () => {
  await load()
  try { catalog.value = (await li.catalog()).data } catch { /* tanpa katalog, tautan course disembunyikan */ }
})
watch(filter, load)

const vendor = computed(() => lib.value?.vendorName ?? 'vendor')
const groups = computed(() => (['K', 'S', 'A'] as const).map((k) => ({ kind: k, label: KIND_LABEL[k], items: (detail.value?.items ?? []).filter((i) => i.kind === k) })).filter((g) => g.items.length))
const paretoNote = computed(() => {
  const p = lib.value?.pareto
  if (!p) return ''
  if (!p.available) return 'Training Needs belum aktif untuk tenant ini, jadi prioritas belum bisa dihitung.'
  if (!p.count) return 'Belum ada gap training yang terhubung ke modul. Prioritas muncul setelah hasil Training Needs tersedia.'
  return `${p.count} modul menutup ${pct(p.cumulativeShare)} gap training${filter.jobRoleId ? ' jabatan ini' : ''}. ${p.withoutGapData} modul belum punya data gap.`
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
    <p class="el-muted">Learning Intervention › Library</p>
    <h1 class="el-h1">Library</h1>
    <p class="el-muted">Semua modul Knowledge, Skill, dan Attitude (KSA) dari DACUM Tool 2. Setiap modul dapat diminta dari {{ vendor }} atau dikembangkan bersama ELGOS.</p>

    <UiNote v-if="error" tone="critical" data-testid="galat">{{ error }}</UiNote>
    <UiNote v-if="notice" tone="success" data-testid="info">{{ notice }}</UiNote>

    <template v-if="lib">
      <div class="el-grid el-grid-4 li-gap">
        <UiKpiCard label="Modul" :value="lib.kpis.modules" :note="`${lib.kpis.streams} rumpun`" />
        <UiKpiCard label="Knowledge" :value="lib.kpis.knowledge" note="butir" />
        <UiKpiCard label="Skill" :value="lib.kpis.skill" note="butir" />
        <UiKpiCard label="Attitude" :value="lib.kpis.attitude" note="butir" />
      </div>

      <UiCard tonal class="li-row li-gap">
        <span><b>Prioritas Pareto 20/80:</b> {{ paretoNote }}</span>
        <UiButton v-if="lib.pareto.count" variant="tonal" size="sm" :disabled="busy" @click="requestPriority">Minta modul prioritas yang generik ke {{ vendor }}</UiButton>
      </UiCard>
      <p class="el-muted li-small">Tombol "Minta" hanya mencatat permintaan di ELGOS. ELGOS tidak mengirim apa pun ke {{ vendor }}.</p>

      <div class="li-filters li-gap">
        <label class="el-label">Jabatan
          <select v-model="filter.jobRoleId" class="el-input"><option value="">Semua</option><option v-for="j in lib.filters.jobRoles" :key="j.id" :value="j.id">{{ j.name }}</option></select>
        </label>
        <label class="el-label">Prioritas
          <select v-model="filter.priority" class="el-input"><option value="">Semua</option><option value="pareto">Prioritas Pareto</option></select>
        </label>
        <label class="el-label">Tipe
          <select v-model="filter.type" class="el-input"><option value="">Semua</option><option v-for="(l, k) in KIND_LABEL" :key="k" :value="k">{{ l }}</option></select>
        </label>
        <label class="el-label">Level
          <select v-model="filter.level" class="el-input"><option value="">Semua</option><option v-for="(l, k) in LEVEL_LABEL" :key="k" :value="k">{{ l }}</option></select>
        </label>
        <label class="el-label">Rumpun
          <select v-model="filter.stream" class="el-input"><option value="">Semua</option><option v-for="s in lib.filters.streams" :key="s" :value="s">{{ s }}</option></select>
        </label>
      </div>

      <div class="li-split li-gap">
        <UiCard>
          <h2 class="el-h3" data-testid="jumlah-modul">{{ lib.data.length }} modul</h2>
          <p v-if="!lib.kpis.modules" class="el-muted">Belum ada modul. Impor library modul (templat nomor 9) lewat menu impor data.</p>
          <ul class="li-list" aria-label="Daftar modul">
            <li v-for="m in lib.data" :key="m.id">
              <button type="button" class="li-item" :aria-current="detail?.id === m.id ? 'true' : undefined" @click="pick(m)">
                <span class="el-mono">{{ m.code }}</span>
                <span class="li-item__body">
                  <b>{{ m.name }}</b>
                  <span class="el-muted li-small">{{ LEVEL_LABEL[m.level] }} · {{ m.stream ?? 'Tanpa rumpun' }} · K {{ m.counts.K }} · S {{ m.counts.S }} · A {{ m.counts.A }} · {{ jobLabel(m) }}</span>
                  <span class="li-chips">
                    <UiStatus :tone="statusLabel(m.status.key, vendor).tone">{{ statusLabel(m.status.key, vendor).text }}</UiStatus>
                    <UiChip v-if="m.priority" tone="review" icon="flag">{{ priorityLabel(m) }}</UiChip>
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </UiCard>

        <UiCard v-if="detail" as="section" aria-label="Detail modul" data-testid="detail-modul">
          <p class="el-muted"><span class="el-mono">{{ detail.code }}</span> · {{ LEVEL_LABEL[detail.level] }} · {{ detail.stream ?? 'Tanpa rumpun' }}</p>
          <h2 class="el-h2">{{ detail.name }}</h2>
          <p class="li-chips">
            <UiStatus :tone="statusLabel(detail.status.key, vendor).tone">{{ statusLabel(detail.status.key, vendor).text }}</UiStatus>
            <UiChip v-if="detail.priority" tone="review" icon="flag">{{ priorityLabel(detail) }}</UiChip>
          </p>
          <p v-if="detail.priority" class="el-muted li-small">Termasuk modul yang menutup {{ pct(detail.priority.cumulativeShare) }} gap training.</p>
          <h3 class="el-h3">Berlaku untuk jabatan</h3>
          <p>{{ jobLabel(detail) }}</p>
          <p class="el-muted li-small">Satu modul dapat dipakai untuk beberapa jabatan. Jabatan lain ditambahkan setelah kamus kompetensinya tersedia.</p>
          <h3 class="el-h3">Tujuan pembelajaran (DACUM)</h3>
          <p>{{ detail.objective || 'Belum diisi.' }}</p>
          <div v-for="g in groups" :key="g.kind">
            <h4 class="li-h4">{{ g.label }} ({{ g.items.length }})</h4>
            <ul><li v-for="(it, i) in g.items" :key="i">{{ it.text }}</li></ul>
          </div>
          <UiNote class="li-gap">
            <b>Sumber yang disarankan: {{ detail.recommendation === 'dev' ? 'dikembangkan bersama ELGOS' : vendor }}.</b>
            {{ detail.recommendation === 'dev' ? 'Modul ini spesifik proses perusahaan.' : 'Modul ini bersifat generik.' }}
          </UiNote>
          <div v-if="detail.status.key === 'none'" class="li-actions">
            <UiButton icon="inventory_2" :disabled="busy" @click="requestOne(detail)">Minta ke {{ vendor }}</UiButton>
            <UiButton variant="tonal" icon="smart_toy" :disabled="busy" @click="develop(detail)">Kembangkan dengan ELGOS</UiButton>
          </div>
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

<style>
.li-gap { margin-top: 16px; }
.li-small { font-size: 13px; }
.li-row { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.li-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.li-split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 1100px) { .li-split { grid-template-columns: minmax(0, 1fr); } }
.li-list { list-style: none; margin: 0; padding: 0; max-height: 640px; overflow: auto; }
.li-item {
  display: flex; gap: 12px; width: 100%; text-align: left; padding: 12px; border: 0; border-bottom: 1px solid var(--el-outline-variant);
  background: none; color: inherit; font: inherit; cursor: pointer; border-radius: 8px;
}
.li-item:hover { background: var(--el-surface-1); }
.li-item[aria-current='true'] { background: var(--el-secondary-container); color: var(--el-on-secondary-container); }
.li-item:focus-visible { outline: 2px solid var(--el-primary); outline-offset: -2px; }
.li-item__body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.li-chips { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.li-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
.li-h4 { font-size: 14px; font-weight: 500; margin: 12px 0 4px; }
</style>
