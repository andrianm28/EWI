<script setup lang="ts">
// B11 · Impor data & integrasi. Admin tenant menyiapkan model kompetensi per jabatan dan data kinerja per periode.
import { computed, onMounted, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { tenantAdmin, type ImportSummary, type LastImport } from '@/api/tenantAdmin'
import { UiCard, UiChip, UiField, UiNote } from '@/ui'
import AdminNav from './AdminNav.vue'
import ImportFlow from './ImportFlow.vue'

const summary = ref<ImportSummary | null>(null)
const loading = ref(true)
const loadError = ref('')
const jobRoleId = ref('')
const period = ref('')

async function load() {
  loadError.value = ''
  try {
    summary.value = (await tenantAdmin.importSummary()).data
    if (!jobRoleId.value) jobRoleId.value = summary.value.competencyModel[0]?.jobRoleId ?? ''
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Terjadi kesalahan. Coba lagi.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

// kamus dari layar ini selalu untuk satu jabatan, dengan sumber DACUM (spek 6.3)
const dnaOptions = computed(() => ({ jobRoleId: jobRoleId.value, source: 'dacum' }))
const tnaOptions = computed(() => ({ period: period.value.trim(), source: 'berkas' }))
const when = (s: string) => new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
const fileLine = (i: LastImport) => `${i.filename} · ${when(i.uploadedAt)}${i.uploadedByName ? ` · ${i.uploadedByName}` : ''}`
const LMS_LABEL: Record<string, string> = { elitementor: 'EliteMentor', moodle: 'Moodle' }
const em = computed(() => summary.value?.integrations.elitementor)
const emDetail = computed(() => {
  const e = em.value
  if (!e) return ''
  const parts = [e.sso ? 'SSO' : '', 'deep link', e.webhookSync ? 'sync-back' : ''].filter(Boolean)
  return e.status === 'tersambung' ? `tersambung (${parts.join(' · ')})` : 'belum dikonfigurasi'
})
</script>

<template>
  <AppShell>
    <AdminNav current="cfg" />
    <h1 class="el-h1">Impor data &amp; integrasi</h1>
    <p class="el-muted adm__lead">Admin tenant menyiapkan model kompetensi dan data kinerja perusahaannya.</p>

    <UiNote v-if="loadError" tone="critical">{{ loadError }}</UiNote>
    <p v-else-if="loading" class="el-muted">Memuat ringkasan impor…</p>
    <template v-else-if="summary">
      <div class="el-grid el-grid-2 adm__start">
        <UiCard data-testid="cfg-kamus">
          <h2 class="el-h3">1. Model kompetensi</h2>
          <p class="el-muted">Hasil DACUM Tool 1 sampai 3 (xlsx), per jabatan.</p>
          <ul class="adm__list">
            <li v-for="m in summary.competencyModel" :key="m.jobRoleId">
              <span><b>{{ m.jobRoleName }}</b><br /><span class="el-muted">{{ m.lastImport ? fileLine(m.lastImport) : 'Belum ada berkas yang diimpor' }}</span></span>
              <UiChip :tone="m.status === 'terimpor' ? 'success' : 'neutral'">{{ m.status === 'terimpor' ? `Terimpor · ${m.competencyCount} kompetensi` : 'Belum diimpor' }}</UiChip>
            </li>
          </ul>
          <p v-if="!summary.competencyModel.length" class="el-muted">Belum ada jabatan. <RouterLink :to="{ name: 'jobs' }">Tambah jabatan</RouterLink> lebih dulu.</p>
          <template v-else>
            <UiField id="cfg-jabatan" v-slot="{ attrs }" label="Impor kamus untuk jabatan" class="adm__section">
              <select v-bind="attrs" v-model="jobRoleId" class="el-input">
                <option v-for="m in summary.competencyModel" :key="m.jobRoleId" :value="m.jobRoleId">{{ m.jobRoleName }}</option>
              </select>
            </UiField>
            <ImportFlow area="dna" :options="dnaOptions" @imported="load" />
          </template>
        </UiCard>

        <UiCard data-testid="cfg-kpi">
          <h2 class="el-h3">2. KPI dan OKR</h2>
          <p class="el-muted">Data kinerja per periode dari HRIS atau berkas.</p>
          <ul class="adm__list">
            <li v-for="p in summary.performance" :key="p.period">
              <span><b>{{ p.period }}</b><br /><span class="el-muted">{{ p.lastImport ? fileLine(p.lastImport) : 'Diisi tanpa berkas' }}</span></span>
              <UiChip :tone="p.missed ? 'review' : 'success'">{{ p.records }} target · {{ p.missed }} belum tercapai</UiChip>
            </li>
          </ul>
          <p v-if="!summary.performance.length" class="el-muted">Belum ada data kinerja.</p>
          <UiField id="cfg-periode" v-slot="{ attrs }" label="Periode" hint="Misalnya 2026-Q4. Dipakai untuk baris yang kolom Periode-nya kosong." class="adm__section">
            <input v-bind="attrs" v-model="period" class="el-input" type="text" maxlength="32" />
          </UiField>
          <ImportFlow area="tna" :options="tnaOptions" @imported="load" />
        </UiCard>
      </div>

      <UiCard class="adm__section" data-testid="cfg-integrasi">
        <h2 class="el-h3">Integrasi pembelajaran</h2>
        <div class="adm__row">
          <UiChip :tone="em?.status === 'tersambung' ? 'success' : 'neutral'">EliteMentor: {{ emDetail }}</UiChip>
          <UiChip>Tujuan pembelajaran: {{ summary.integrations.lms.targets.map((t) => LMS_LABEL[t] ?? t).join(', ') || 'belum dipilih' }}</UiChip>
          <UiChip v-if="summary.integrations.lms.gapExport">LMS perusahaan: ekspor gap bila EliteMentor tidak dipakai</UiChip>
        </div>
        <p v-if="em && !em.organizationMapped" class="el-muted adm__section">Organisasi ini belum dipetakan ke EliteMentor. Hubungi ETA untuk menyambungkannya.</p>
      </UiCard>
    </template>
  </AppShell>
</template>

<style scoped>
.adm__lead { margin: 0 0 16px; }
.adm__section { margin-top: 16px; }
.adm__start { align-items: start; }
.adm__row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.adm__list { list-style: none; margin: 12px 0 0; padding: 0; }
.adm__list li { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--el-outline-variant); }
</style>
