<script setup lang="ts">
// Program & Course (mockup, layar `prog`): program Basic/Intermediate/Advanced per jabatan, tersusun dari modul Library.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import './li.css'
import { ApiError } from '@/api/client'
import { UiButton, UiCard, UiChip, UiKpiCard, UiNote, UiStatus, UiTabs } from '@/ui'
import { li, type Level, type ModuleRow, type Programs } from './api'
import { LEVEL_LABEL, jobLabel, priorityLabel, statusLabel } from './labels'

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
const tabs = computed(() => (p.value?.levels ?? []).map((l) => ({ key: l.level, label: `${LEVEL_LABEL[l.level]} (${l.count})` })))
const tab = computed({ get: () => level.value as string, set: (v) => { level.value = v as Level; void load() } })
function pickJob(id: string) { jobRoleId.value = id; void load() }

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
    : { label: `Minta ke ${vendor.value}`, run: async () => { await li.requestModule(m.id); return `Permintaan ${m.code} dicatat.` } }
}
</script>

<template>
  <AppShell>
    <p class="el-muted">Learning Intervention › Program &amp; Course</p>
    <h1 class="el-h1">Program &amp; Course</h1>
    <p class="el-muted">Program Basic, Intermediate, dan Advanced per jabatan, tersusun dari modul-modul di Library (DACUM Tool 3).</p>
    <UiNote v-if="error" tone="critical" data-testid="galat">{{ error }}</UiNote>
    <UiNote v-if="notice" tone="success" data-testid="info">{{ notice }}</UiNote>

    <template v-if="p">
      <div class="li-chips li-gap" role="group" aria-label="Jabatan">
        <span class="el-muted">Jabatan:</span>
        <UiButton
          v-for="j in p.jobRoles" :key="j.id" size="sm" :variant="j.id === p.jobRoleId ? 'filled' : 'outlined'"
          :aria-pressed="j.id === p.jobRoleId" @click="pickJob(j.id)"
        >{{ j.name }}{{ j.hasDictionary ? '' : ' · kamus belum tersedia' }}</UiButton>
      </div>
      <p v-if="!p.jobRoles.length" class="el-muted">Belum ada jabatan. Tambahkan jabatan dan impor library modul lebih dulu.</p>

      <template v-if="job">
        <UiNote v-if="!job.hasDictionary" tone="warning" class="li-gap">Kamus kompetensi dan library modul untuk {{ job.name }} belum tersedia, jadi programnya belum bisa disusun.</UiNote>
        <template v-else>
          <UiTabs id="prog" v-model="tab" :tabs="tabs" label="Level program" class="li-gap" />
          <div :id="`prog-panel-${level}`" role="tabpanel" :aria-labelledby="`prog-tab-${level}`">
            <div class="el-grid el-grid-4 li-gap">
              <UiKpiCard label="Course" :value="p.kpis.courses" />
              <UiKpiCard label="Tersedia" :value="p.kpis.available" />
              <UiKpiCard label="Sedang diproses" :value="p.kpis.inProgress" />
              <UiKpiCard label="Belum ada sumber" :value="p.kpis.noSource" />
            </div>
            <p class="li-gap"><b>Prioritas Pareto:</b>
              {{ !p.pareto.available ? 'Training Needs belum aktif.' : p.pareto.codes.length ? `${p.pareto.codes.length} course di program ini termasuk prioritas.` : 'Belum ada course prioritas di program ini.' }}
              Course prioritas tampil paling atas di tiap rumpun.</p>
            <UiCard tonal class="li-row">
              <span><b>{{ vendor }}</b> menyediakan modul yang bersifat generik. Modul spesifik proses perusahaan perlu dikembangkan bersama ELGOS.</span>
              <UiButton variant="tonal" size="sm" :disabled="busy || !p.kpis.noSource" @click="requestAll">Minta semua modul generik di program ini</UiButton>
            </UiCard>
            <section v-for="g in p.groups" :key="g.stream" class="li-gap" :aria-label="g.stream">
              <h2 class="el-h3">{{ g.stream }} <span class="el-muted">· {{ g.modules.length }} course</span></h2>
              <UiCard v-for="m in g.modules" :key="m.id" class="li-row li-course" :data-testid="`course-${m.code}`">
                <div>
                  <span class="el-mono">{{ m.code }}</span> <b>{{ m.name }}</b>
                  <div class="li-chips li-small">
                    <span class="el-muted">K {{ m.counts.K }} · S {{ m.counts.S }} · A {{ m.counts.A }} · {{ jobLabel(m) }}</span>
                    <UiStatus :tone="statusLabel(m.status.key, vendor).tone">{{ statusLabel(m.status.key, vendor).text }}</UiStatus>
                    <UiChip v-if="m.priority" tone="review" icon="flag">{{ priorityLabel(m) }}</UiChip>
                  </div>
                </div>
                <div class="li-chips">
                  <UiButton variant="text" size="sm" :to="{ name: 'lib', query: { modul: m.id } }">Detail</UiButton>
                  <UiButton v-if="primary(m)" variant="tonal" size="sm" :disabled="busy" @click="act(primary(m)!.run)">{{ primary(m)!.label }}</UiButton>
                </div>
              </UiCard>
            </section>
            <p v-if="!p.groups.length" class="el-muted li-gap">Belum ada course pada level ini.</p>
          </div>
        </template>
      </template>
    </template>
  </AppShell>
</template>

<style>
.li-course { margin-top: 8px; padding: 12px 16px; }
</style>
