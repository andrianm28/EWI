<script setup lang="ts">
// Program & Course (mockup, layar `prog`): program Basic/Intermediate/Advanced per jabatan, tersusun dari modul Library.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import './li.css'
import { ApiError } from '@/api/client'
import { UiBreadcrumb, UiButton, UiCard, UiChip, UiKpiCard, UiNote, UiTabs } from '@/ui'
import { li, type Level, type ModuleRow, type Programs } from './api'
import { LEVEL_LABEL, jobChip, priorityLabel, shortVendor, statusLabel } from './labels'

const router = useRouter()
const res = ref<Programs | null>(null)
const error = ref('')
const notice = ref('')
const busy = ref(false)
const level = ref<Level>('basic')
const jobRoleId = ref<string | null>(null)

async function load() {
  try {
    res.value = await li.programs({ jobRoleId: jobRoleId.value, level: level.value })
    jobRoleId.value = res.value.data.jobRoleId
    error.value = ''
  } catch (e) { error.value = e instanceof ApiError ? e.message : 'Program tidak bisa dimuat' }
}
onMounted(load)

const p = computed(() => res.value?.data ?? null)
const vendor = computed(() => res.value?.vendorName ?? 'vendor')
const job = computed(() => p.value?.jobRoles.find((j) => j.id === p.value?.jobRoleId) ?? null)
const tabs = computed(() => (p.value?.levels ?? []).map((l) => ({ key: l.level, label: `${LEVEL_LABEL[l.level]} · ${l.count} course` })))
const tab = computed({ get: () => level.value as string, set: (v) => { level.value = v as Level; void load() } })
function pickJob(id: string) { jobRoleId.value = id; void load() }
// LI-18: kode course prioritas di program yang sedang dilihat
const prioCodes = computed(() => (p.value?.groups ?? []).flatMap((g) => g.modules).filter((m) => m.priority).map((m) => m.code))
const paretoNote = computed(() => {
  if (!p.value?.pareto.available) return 'Training Needs belum aktif, jadi prioritas belum bisa dihitung.'
  return prioCodes.value.length
    ? `${prioCodes.value.length} dari ${p.value.kpis.courses} course di program ini adalah prioritas Pareto: ${prioCodes.value.join(', ')}.`
    : 'Tidak ada course prioritas Pareto di program ini.'
})

async function act(fn: () => Promise<string>) {
  busy.value = true; notice.value = ''; error.value = ''
  try { notice.value = await fn(); await load() } catch (e) { error.value = e instanceof ApiError ? e.message : 'Tindakan gagal' } finally { busy.value = false }
}
const requestAll = () => act(async () => {
  const { data } = await li.requestBulk({ scope: 'program', jobRoleId: jobRoleId.value ?? undefined, level: level.value })
  return data.created ? `${data.created} permintaan dicatat.` : 'Tidak ada modul generik tanpa sumber di program ini.'
})
function primary(m: ModuleRow) {
  if (m.status.key !== 'none') return null
  return m.recommendation === 'dev'
    ? { label: 'Kembangkan', run: async () => { const { data } = await li.startDraft(m.id); await router.push({ name: 'req-draf', params: { id: data.id } }); return '' } }
    : { label: `Minta ke ${shortVendor(vendor.value)}`, run: async () => { await li.requestModule(m.id); return `Permintaan ${m.code} dicatat.` } }
}
</script>

<template>
  <AppShell>
    <UiBreadcrumb :items="[{ label: 'Learning Intervention' }, { label: 'Program & Course' }]" />
    <h1 class="el-h1">Program &amp; Course</h1>
    <p class="el-muted">Program Basic, Intermediate, dan Advanced {{ job ? `untuk ${job.name}` : 'per jabatan' }}, tersusun dari modul-modul di Library (DACUM Tool 3).</p>
    <UiNote v-if="error" tone="critical" data-testid="galat">{{ error }}</UiNote>
    <UiNote v-if="notice" tone="success" data-testid="info">{{ notice }}</UiNote>

    <template v-if="p">
      <div class="li-chips li-gap" role="group" aria-label="Jabatan">
        <span class="el-muted li-pick__label">Jabatan:</span>
        <button
          v-for="j in p.jobRoles" :key="j.id" type="button" class="li-pick" :aria-pressed="j.id === p.jobRoleId" @click="pickJob(j.id)"
        >{{ j.name }} <UiChip :tone="j.hasDictionary ? 'success' : 'neutral'">{{ j.hasDictionary ? 'Kamus tersedia' : 'Belum tersedia' }}</UiChip></button>
      </div>
      <p v-if="!p.jobRoles.length" class="el-muted">Belum ada jabatan. Tambahkan jabatan dan impor library modul lebih dulu.</p>

      <template v-if="job">
        <UiNote v-if="!job.hasDictionary" tone="warning" class="li-gap">Kamus kompetensi dan library modul untuk {{ job.name }} belum tersedia, jadi programnya belum bisa disusun.</UiNote>
        <template v-else>
          <UiNote class="li-gap"><b>Program ini untuk jabatan {{ job.name }}.</b> Susunan Basic, Intermediate, dan Advanced mengikuti kamus kompetensinya. Course yang sama dapat dipakai ulang di program jabatan lain.</UiNote>
          <UiTabs id="prog" v-model="tab" :tabs="tabs" label="Level program" class="li-gap" />
          <div :id="`prog-panel-${level}`" role="tabpanel" :aria-labelledby="`prog-tab-${level}`">
            <div class="el-grid el-grid-4 li-gap">
              <UiKpiCard label="Course" :value="p.kpis.courses" :note="`program ${LEVEL_LABEL[level]} · ${job.name}`" />
              <UiKpiCard label="Tersedia" :value="p.kpis.available" :note="`dari ${shortVendor(vendor)}`" />
              <UiKpiCard label="Diminta / draf" :value="p.kpis.inProgress" note="sedang diproses" />
              <UiKpiCard label="Belum ada sumber" :value="p.kpis.noSource" note="perlu diminta atau dikembangkan" />
            </div>
            <UiNote tone="warning" class="li-gap"><b>Prioritas Pareto:</b> {{ paretoNote }} Course prioritas tampil paling atas di tiap rumpun.</UiNote>
            <UiNote class="li-row li-gap">
              <span><b>{{ vendor }}</b> menyediakan modul yang bersifat generik. Modul spesifik proses perusahaan perlu dikembangkan bersama ELGOS.</span>
              <UiButton size="sm" :disabled="busy || !p.kpis.noSource" @click="requestAll">Minta semua modul generik di program ini</UiButton>
            </UiNote>
            <UiCard v-for="g in p.groups" :key="g.stream" as="section" class="li-gap" :aria-label="g.stream">
              <h2 class="el-h3">{{ g.stream }} <span class="el-muted li-normal">· {{ g.modules.length }} course</span></h2>
              <div v-for="m in g.modules" :key="m.id" class="li-line li-row" :data-testid="`course-${m.code}`">
                <div class="li-course__body">
                  <span class="el-mono el-muted li-code">{{ m.code }}</span> <b>{{ m.name }}</b>
                  <div class="li-chips li-chips--tight li-course__chips">
                    <UiChip>K {{ m.counts.K }}</UiChip><UiChip>S {{ m.counts.S }}</UiChip><UiChip>A {{ m.counts.A }}</UiChip>
                    <UiChip tone="training">{{ jobChip(m) }}</UiChip>
                    <UiChip :tone="statusLabel(m.status.key, vendor).tone">{{ statusLabel(m.status.key, vendor).text }}</UiChip>
                    <UiChip v-if="m.priority" tone="critical">{{ priorityLabel(m) }}</UiChip>
                  </div>
                </div>
                <div class="li-chips">
                  <UiButton variant="text" size="sm" :to="{ name: 'lib', query: { modul: m.id } }">Detail</UiButton>
                  <UiButton v-if="primary(m)" variant="tonal" size="sm" :disabled="busy" @click="act(primary(m)!.run)">{{ primary(m)!.label }}</UiButton>
                </div>
              </div>
            </UiCard>
            <p v-if="!p.groups.length" class="el-muted li-gap">Belum ada course pada level ini.</p>
          </div>
        </template>
      </template>
    </template>
  </AppShell>
</template>

<style>
.li-pick__label { font-weight: 500; }
.li-pick {
  display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 8px 14px; border-radius: 8px;
  border: 1px solid var(--el-outline-variant); background: var(--el-surface-card); color: var(--el-on-surface); font: inherit; cursor: pointer; text-align: left;
}
.li-pick[aria-pressed='true'] { border-color: var(--el-primary); }
.li-pick:focus-visible { outline: 2px solid var(--el-primary); outline-offset: 2px; }
.li-normal { font-weight: 400; }
.li-course__body { flex: 1 1 320px; min-width: 0; }
.li-course__chips { margin-top: 6px; }
</style>
