<script setup lang="ts">
// B11 · Jabatan & kamus kompetensi. Tiap jabatan punya kamus kompetensinya sendiri; kamus diisi lewat layar impor.
import { computed, onMounted, reactive, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { tenantAdmin, SOURCE_LABEL, type Competency, type JobRole } from '@/api/tenantAdmin'
import { UiButton, UiCard, UiChip, UiDataTable, UiErrorSummary, UiField, UiNote, type UiColumn, type UiSortState } from '@/ui'
import AdminNav from './AdminNav.vue'

const jobs = ref<JobRole[]>([])
const loading = ref(true)
const loadError = ref('')
const notice = ref('')
const errors = ref<{ message: string; fieldId?: string }[]>([])
const busy = ref(false)
const sort = ref<UiSortState | null>(null)
const fail = (e: unknown) => (e instanceof ApiError ? e.message : 'Terjadi kesalahan. Coba lagi.')

async function load() {
  loadError.value = ''
  try { jobs.value = (await tenantAdmin.jobRoles()).data } catch (e) { loadError.value = fail(e) } finally { loading.value = false }
}
onMounted(load)

const COLUMNS: UiColumn[] = [
  { key: 'name', label: 'Jabatan', sortable: true },
  { key: 'dictionary', label: 'Kamus', sortable: true },
  { key: 'competencyCount', label: 'Kompetensi', sortable: true, align: 'right', mono: true },
  { key: 'employeeCount', label: 'Pegawai', sortable: true, align: 'right', mono: true },
  { key: 'sources', label: 'Sumber' },
  { key: 'aksi', label: 'Aksi' },
]
const rows = computed(() => jobs.value as unknown as Record<string, unknown>[])
const asJob = (row: Record<string, unknown>) => row as unknown as JobRole
const sourceText = (j: JobRole) => {
  if (!j.sources.length) return 'Belum ada kamus'
  const labels = j.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', ')
  return j.lastImport ? `${labels} · ${j.lastImport.filename}` : labels
}

const formOpen = ref(false)
const editing = ref<JobRole | null>(null)
const form = reactive({ name: '', division: '' })
function openForm(j?: JobRole) {
  editing.value = j ?? null
  Object.assign(form, { name: j?.name ?? '', division: j?.division ?? '' })
  errors.value = []
  notice.value = ''
  formOpen.value = true
}
async function submit() {
  if (!form.name.trim()) { errors.value = [{ message: 'Isi nama jabatan.', fieldId: 'job-nama' }]; return }
  busy.value = true
  errors.value = []
  try {
    const body = { name: form.name.trim(), division: form.division.trim() || null }
    if (editing.value) await tenantAdmin.updateJobRole(editing.value.id, body)
    else await tenantAdmin.createJobRole(body)
    notice.value = editing.value ? 'Jabatan diperbarui.' : `Jabatan ${body.name} ditambahkan. Impor kamus kompetensinya di layar Impor data.`
    formOpen.value = false
    await load()
  } catch (e) {
    errors.value = [{ message: fail(e), fieldId: e instanceof ApiError && e.code === 'DUPLICATE' ? 'job-nama' : undefined }]
  } finally {
    busy.value = false
  }
}

// kamus satu jabatan
const opened = ref<JobRole | null>(null)
const competencies = ref<Competency[]>([])
async function openDictionary(j: JobRole) {
  errors.value = []
  try {
    competencies.value = (await tenantAdmin.competencies(j.id)).data
    opened.value = j
  } catch (e) {
    errors.value = [{ message: fail(e) }]
  }
}
</script>

<template>
  <AppShell>
    <AdminNav current="jobs" />
    <h1 class="el-h1">Jabatan &amp; kamus kompetensi</h1>
    <p class="el-muted adm__lead">Setiap jabatan memiliki kamus kompetensi dan kurikulum Basic · Intermediate · Advanced sendiri.</p>

    <UiNote v-if="loadError" tone="critical">{{ loadError }}</UiNote>
    <p v-else-if="loading" class="el-muted">Memuat jabatan…</p>
    <template v-else>
      <p v-if="notice" class="adm__notice" role="status" data-testid="adm-info">{{ notice }}</p>
      <UiErrorSummary v-if="!formOpen" :errors="errors" />

      <UiCard v-if="formOpen" class="adm__section" data-testid="job-form">
        <h2 class="el-h3">{{ editing ? 'Ubah jabatan' : 'Tambah jabatan' }}</h2>
        <form novalidate @submit.prevent="submit">
          <UiErrorSummary :errors="errors" />
          <div class="el-grid el-grid-2">
            <UiField id="job-nama" v-slot="{ attrs }" label="Nama jabatan">
              <input v-bind="attrs" v-model="form.name" class="el-input" type="text" maxlength="255" />
            </UiField>
            <UiField id="job-divisi" v-slot="{ attrs }" label="Divisi" hint="Opsional.">
              <input v-bind="attrs" v-model="form.division" class="el-input" type="text" maxlength="255" />
            </UiField>
          </div>
          <div class="adm__row adm__section">
            <UiButton type="submit" :disabled="busy">Simpan</UiButton>
            <UiButton variant="text" @click="formOpen = false">Batal</UiButton>
          </div>
        </form>
      </UiCard>

      <UiDataTable v-model:sort="sort" :columns="COLUMNS" :rows="rows" row-key="id" caption="Jabatan" caption-hidden empty-text="Belum ada jabatan. Tambahkan jabatan pertama." class="adm__section">
        <template #toolbar>
          <UiButton v-if="!formOpen" size="sm" data-testid="job-tambah" @click="openForm()">Tambah jabatan</UiButton>
          <UiButton variant="outlined" size="sm" :to="{ name: 'cfg' }">Impor kamus kompetensi</UiButton>
        </template>
        <template #cell-name="{ row }"><b>{{ asJob(row).name }}</b><span v-if="asJob(row).division" class="el-muted"> · {{ asJob(row).division }}</span></template>
        <template #cell-dictionary="{ row }">
          <UiChip :tone="asJob(row).dictionary === 'tersedia' ? 'success' : 'neutral'">{{ asJob(row).dictionary === 'tersedia' ? 'Tersedia' : 'Belum tersedia' }}</UiChip>
        </template>
        <template #cell-sources="{ row }"><span class="el-muted">{{ sourceText(asJob(row)) }}</span></template>
        <template #cell-aksi="{ row }">
          <div class="adm__row">
            <UiButton variant="text" size="sm" @click="openForm(asJob(row))">Ubah</UiButton>
            <UiButton v-if="asJob(row).competencyCount" variant="text" size="sm" @click="openDictionary(asJob(row))">Lihat kamus</UiButton>
          </div>
        </template>
      </UiDataTable>

      <UiCard v-if="opened" class="adm__section" data-testid="job-kamus">
        <div class="adm__row">
          <h2 class="el-h3">Kamus kompetensi · {{ opened.name }}</h2>
          <UiButton variant="text" size="sm" @click="opened = null">Tutup</UiButton>
        </div>
        <ul class="adm__list">
          <li v-for="c in competencies" :key="c.id"><span>{{ c.name }}</span><span class="el-muted">{{ c.source ? (SOURCE_LABEL[c.source] ?? c.source) : '' }}</span></li>
        </ul>
      </UiCard>
    </template>
  </AppShell>
</template>

<style scoped>
.adm__lead { margin: 0 0 16px; }
.adm__section { margin-top: 16px; }
.adm__row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: space-between; }
.adm__notice { margin: 0 0 12px; color: var(--el-success); font-weight: 500; }
.adm__list { list-style: none; margin: 8px 0 0; padding: 0; }
.adm__list li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid var(--el-outline-variant); }
</style>
