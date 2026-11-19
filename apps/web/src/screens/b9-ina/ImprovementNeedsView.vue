<script setup lang="ts">
// B9 Improvement Needs: tindakan perbaikan non-pelatihan, akses atasan (K1), dan verifikasi AI.
// Mengikuti blok INA mockup Pak Eji. Otorisasi data ada di API; layar hanya menyesuaikan dengan `meta.level`.
import { computed, onMounted, reactive, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import {
  ina, CATEGORY_LABEL, STATUS_LABEL, NEXT_STATUS, VERIFICATION_LABEL, REPORTED_LABEL,
  type ActionCategory, type ActionStatus, type InaAction, type InaKpis, type InaLevel, type OwnerOption, type SupervisorAccess, type Verification,
} from '@/api/ina'
import { useSessionStore } from '@/stores/session'
import { UiButton, UiCard, UiChip, UiDataTable, UiErrorSummary, UiField, UiKpiCard, UiNote, UiStatus, type UiColumn, type UiSortState } from '@/ui'

const session = useSessionStore()
const aiOn = computed(() => session.access?.flags['ina.ai_verification'] === true)

const level = ref<InaLevel | null>(null)
const actions = ref<InaAction[]>([])
const kpis = ref<InaKpis | null>(null)
const hiddenCount = ref(0)
const showHidden = ref(false)
const loading = ref(true)
const loadError = ref('')
const notice = ref('')
const manage = computed(() => level.value === 'manage')

const owners = ref<OwnerOption[]>([])
const supervisors = ref<SupervisorAccess[]>([])
const verifications = ref<Verification[]>([])

const fail = (e: unknown) => (e instanceof ApiError ? e.message : 'Terjadi kesalahan. Coba lagi.')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await ina.actions(showHidden.value)
    level.value = res.meta.level
    actions.value = res.data
    kpis.value = res.kpis
    hiddenCount.value = res.meta.hiddenIndividual ?? 0
    if (res.meta.level === 'manage') {
      const [o, s, v] = await Promise.all([ina.owners(), ina.access(), aiOn.value ? ina.verifications() : Promise.resolve({ data: [] as Verification[] })])
      owners.value = o.data
      supervisors.value = s.data
      verifications.value = v.data
    }
  } catch (e) {
    loadError.value = e instanceof ApiError && e.code === 'NO_INA_ACCESS'
      ? 'HR belum memberi Anda akses ke tindakan perbaikan. Hubungi HR bila Anda membutuhkannya.'
      : fail(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function toggleHidden() {
  showHidden.value = !showHidden.value
  await load()
}

// ---------- tabel ----------
const sort = ref<UiSortState | null>(null)
const columns = computed<UiColumn[]>(() => [
  { key: 'title', label: 'Temuan', sortable: true },
  { key: 'category', label: 'Kategori', sortable: true },
  { key: 'ownerName', label: 'Pemilik', sortable: true },
  { key: 'ownerJobRoleName', label: 'Jabatan pemilik', sortable: true },
  { key: 'sourceRef', label: 'Asal gap', mono: true },
  { key: 'dueDate', label: 'Tenggat', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  ...(manage.value ? [{ key: 'aksi', label: 'Aksi' }] : []),
])
const rows = computed(() => actions.value as unknown as Record<string, unknown>[])
const asAction = (row: Record<string, unknown>) => row as unknown as InaAction
const STATUS_TONE: Record<ActionStatus, 'info' | 'warning' | 'success' | 'neutral'> = { new: 'info', in_progress: 'warning', done: 'success', rejected: 'neutral' }
const formatDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Belum ditentukan')

async function changeStatus(a: InaAction, ev: Event) {
  const el = ev.target as HTMLSelectElement
  const status = el.value as ActionStatus
  notice.value = ''
  try {
    await ina.updateAction(a.id, { status })
    notice.value = `Status "${a.title}" diubah menjadi ${STATUS_LABEL[status]}.`
    await load()
  } catch (e) {
    el.value = a.status
    formErrors.value = [{ message: fail(e) }]
  }
}

// ---------- formulir tambah / ubah ----------
const CATEGORIES = Object.keys(CATEGORY_LABEL) as ActionCategory[]
const formOpen = ref(false)
const editing = ref<InaAction | null>(null)
const saving = ref(false)
const formErrors = ref<{ message: string; fieldId?: string }[]>([])
// detail tidak ada di daftar; dimuat terpisah. Selama belum termuat, detail tidak dikirim agar tidak terhapus.
const detailLoaded = ref(true)
const form = reactive({ title: '', detail: '', category: 'sop' as ActionCategory, subLabel: '', ownerUserId: '', sourceRef: '', dueDate: '', involvesIndividual: false })

function openForm(a?: InaAction) {
  editing.value = a ?? null
  Object.assign(form, {
    title: a?.title ?? '', detail: '', category: a?.category ?? 'sop', subLabel: a?.subLabel ?? '', ownerUserId: a?.ownerUserId ?? '',
    sourceRef: a?.sourceRef ?? '', dueDate: a?.dueDate ?? '', involvesIndividual: a?.involvesIndividual ?? false,
  })
  formErrors.value = []
  formOpen.value = true
  detailLoaded.value = !a
  if (a) {
    ina.action(a.id).then((res) => {
      if (editing.value?.id === a.id) { form.detail = res.data.detail ?? ''; detailLoaded.value = true }
    }).catch(() => { /* detail tetap tidak dikirim */ })
  }
}

async function submit() {
  const errs: { message: string; fieldId?: string }[] = []
  if (form.title.trim().length < 3) errs.push({ message: 'Tulis temuan atau tindakan, minimal 3 karakter.', fieldId: 'ina-judul' })
  if (form.category === 'lainnya' && !form.subLabel.trim()) errs.push({ message: 'Isi sub-label untuk kategori Lainnya.', fieldId: 'ina-sublabel' })
  formErrors.value = errs
  if (errs.length) return
  const body: Record<string, unknown> = {
    title: form.title.trim(), category: form.category,
    subLabel: form.category === 'lainnya' ? form.subLabel.trim() : null, ownerUserId: form.ownerUserId || null,
    sourceRef: form.sourceRef.trim() || null, dueDate: form.dueDate || null, involvesIndividual: form.involvesIndividual,
  }
  if (detailLoaded.value) body.detail = form.detail.trim() || null
  saving.value = true
  try {
    if (editing.value) await ina.updateAction(editing.value.id, body)
    else await ina.createAction(body)
    notice.value = editing.value ? 'Tindakan diperbarui.' : 'Tindakan ditambahkan.'
    formOpen.value = false
    await load()
  } catch (e) {
    formErrors.value = [{ message: fail(e) }]
  } finally {
    saving.value = false
  }
}

// ---------- akses atasan (K1) ----------
async function toggleAccess(s: SupervisorAccess) {
  notice.value = ''
  try {
    if (s.granted) await ina.revoke(s.supervisorId)
    else await ina.grant(s.supervisorId)
    notice.value = s.granted ? `Akses ${s.name ?? s.email} dicabut.` : `Akses diberikan kepada ${s.name ?? s.email}.`
    supervisors.value = (await ina.access()).data
  } catch (e) {
    formErrors.value = [{ message: fail(e) }]
  }
}

// ---------- verifikasi AI ----------
const canVerify = (a: InaAction) => aiOn.value && !!a.ownerUserId && !a.involvesIndividual && ['new', 'in_progress'].includes(a.status)
  && !(a.lastVerification && ['assigned', 'in_progress'].includes(a.lastVerification.status))
async function assign(a: InaAction) {
  notice.value = ''
  try {
    await ina.assign(a.id, null)
    notice.value = `Verifikasi untuk "${a.title}" ditugaskan kepada ${a.ownerName ?? 'pemilik'}.`
    await load()
  } catch (e) {
    formErrors.value = [{ message: fail(e) }]
  }
}
async function cancelVerification(v: Verification) {
  try {
    await ina.cancel(v.id)
    notice.value = 'Verifikasi dibatalkan.'
    await load()
  } catch (e) {
    formErrors.value = [{ message: fail(e) }]
  }
}
const REPORTED_TONE = { done: 'success', in_progress: 'info', blocked: 'critical' } as const
</script>

<template>
  <AppShell>
    <h1 class="el-h1">Improvement Needs</h1>
    <p class="el-muted ina__lead">Tindakan perbaikan untuk masalah di luar pelatihan: SOP, alat, sistem, dan budaya kerja.</p>

    <UiNote v-if="loadError" tone="critical" data-testid="ina-galat">{{ loadError }}</UiNote>
    <p v-else-if="loading && !kpis" class="el-muted">Memuat tindakan perbaikan…</p>

    <template v-if="kpis && !loadError">
      <p v-if="notice" class="ina__notice" role="status" data-testid="ina-info">{{ notice }}</p>
      <UiErrorSummary v-if="!formOpen" :errors="formErrors" />

      <UiCard v-if="manage && aiOn" tonal class="ina__section" data-testid="ina-ai">
        <div class="ina__row">
          <h2 class="el-h3">Agen AI · Verifikasi tindakan perbaikan</h2>
          <UiChip tone="review">Pilot</UiChip>
        </div>
        <p class="el-muted">AI menanyakan status tindakan kepada pemiliknya lewat percakapan singkat, lalu meringkasnya untuk HR. Isi percakapan hanya bisa dibuka pemiliknya. Status tindakan tetap Anda yang memutuskan.</p>
        <UiDataTable
          v-if="verifications.length" :columns="[{ key: 'actionTitle', label: 'Tindakan' }, { key: 'ownerName', label: 'Pemilik' }, { key: 'status', label: 'Verifikasi' }, { key: 'reportedStatus', label: 'Dilaporkan pemilik' }, { key: 'summary', label: 'Ringkasan' }, { key: 'aksi', label: 'Aksi' }]"
          :rows="(verifications as unknown as Record<string, unknown>[])" row-key="id" caption="Verifikasi tindakan perbaikan" caption-hidden class="ina__sub"
        >
          <template #cell-status="{ row }">{{ VERIFICATION_LABEL[(row as unknown as Verification).status] }}</template>
          <template #cell-reportedStatus="{ row }">
            <UiStatus v-if="(row as unknown as Verification).reportedStatus" :tone="REPORTED_TONE[(row as unknown as Verification).reportedStatus!]">{{ REPORTED_LABEL[(row as unknown as Verification).reportedStatus!] }}</UiStatus>
            <span v-else class="el-muted">Belum ada</span>
          </template>
          <template #cell-summary="{ row }">{{ (row as unknown as Verification).summary ?? 'Belum ada' }}</template>
          <template #cell-aksi="{ row }">
            <UiButton v-if="['assigned', 'in_progress'].includes((row as unknown as Verification).status)" variant="text" size="sm" @click="cancelVerification(row as unknown as Verification)">Batalkan</UiButton>
          </template>
        </UiDataTable>
        <p v-else class="el-muted ina__sub">Belum ada verifikasi. Pilih "Verifikasi lewat AI" pada tindakan yang punya pemilik.</p>
      </UiCard>

      <div class="el-grid el-grid-4 ina__section" data-testid="ina-kpi">
        <UiKpiCard label="Tindakan" :value="String(kpis.total)" :note="kpis.overdue ? `${kpis.overdue} lewat tenggat` : 'tidak ada yang lewat tenggat'" />
        <UiKpiCard label="Selesai" :value="String(kpis.done)" />
        <UiKpiCard label="SOP / Alat / Sistem" :value="String(kpis.process)" />
        <UiKpiCard label="Budaya" :value="String(kpis.culture)" />
      </div>

      <UiNote v-if="level === 'summary'" class="ina__section">Anda melihat angka ringkasan. Daftar tindakan hanya untuk HR dan atasan langsung yang diberi akses oleh HR.</UiNote>

      <template v-else>
        <UiCard v-if="formOpen" class="ina__section" data-testid="ina-form">
          <h2 class="el-h3">{{ editing ? 'Ubah tindakan' : 'Tambah tindakan' }}</h2>
          <form novalidate @submit.prevent="submit">
            <UiErrorSummary :errors="formErrors" />
            <div class="el-grid el-grid-2">
              <UiField id="ina-judul" v-slot="{ attrs }" label="Temuan atau tindakan" hint="Tulis masalah proses atau sistemnya, bukan nama orang.">
                <input v-bind="attrs" v-model="form.title" class="el-input" type="text" maxlength="255" />
              </UiField>
              <UiField id="ina-kategori" v-slot="{ attrs }" label="Kategori">
                <select v-bind="attrs" v-model="form.category" class="el-input">
                  <option v-for="c in CATEGORIES" :key="c" :value="c">{{ CATEGORY_LABEL[c] }}</option>
                </select>
              </UiField>
              <UiField v-if="form.category === 'lainnya'" id="ina-sublabel" v-slot="{ attrs }" label="Sub-label">
                <input v-bind="attrs" v-model="form.subLabel" class="el-input" type="text" maxlength="64" />
              </UiField>
              <UiField id="ina-pemilik" v-slot="{ attrs }" label="Pemilik">
                <select v-bind="attrs" v-model="form.ownerUserId" class="el-input">
                  <option value="">Belum ditentukan</option>
                  <option v-for="o in owners" :key="o.id" :value="o.id">{{ o.name ?? 'Tanpa nama' }}{{ o.jobRoleName ? ` · ${o.jobRoleName}` : '' }}</option>
                </select>
              </UiField>
              <UiField id="ina-asal" v-slot="{ attrs }" label="Asal gap" hint="Misalnya kode kompetensi atau nama target.">
                <input v-bind="attrs" v-model="form.sourceRef" class="el-input" type="text" maxlength="255" />
              </UiField>
              <UiField id="ina-tenggat" v-slot="{ attrs }" label="Tenggat">
                <input v-bind="attrs" v-model="form.dueDate" class="el-input" type="date" />
              </UiField>
            </div>
            <UiField id="ina-detail" v-slot="{ attrs }" label="Detail" class="ina__sub">
              <textarea v-bind="attrs" v-model="form.detail" class="el-input" maxlength="4000" :disabled="!detailLoaded" :placeholder="detailLoaded ? '' : 'Memuat detail…'" />
            </UiField>
            <label class="el-check ina__sub">
              <input v-model="form.involvesIndividual" type="checkbox" />
              <span>Menyangkut individu tertentu. Tindakan ini disembunyikan dari daftar dan hanya terlihat oleh HR.</span>
            </label>
            <div class="ina__row ina__sub">
              <UiButton type="submit" :disabled="saving">{{ saving ? 'Menyimpan…' : 'Simpan' }}</UiButton>
              <UiButton variant="text" @click="formOpen = false">Batal</UiButton>
            </div>
          </form>
        </UiCard>

        <UiDataTable
          v-model:sort="sort" :columns="columns" :rows="rows" row-key="id" class="ina__section"
          :caption="showHidden ? 'Tindakan yang menyangkut individu' : 'Tindakan perbaikan'"
          :empty-text="showHidden ? 'Tidak ada tindakan yang menyangkut individu.' : 'Belum ada tindakan perbaikan.'"
        >
          <template v-if="manage" #toolbar>
            <UiButton v-if="!formOpen" size="sm" data-testid="ina-tambah" @click="openForm()">Tambah tindakan</UiButton>
            <UiButton v-if="hiddenCount || showHidden" variant="text" size="sm" data-testid="ina-tersembunyi" @click="toggleHidden">
              {{ showHidden ? 'Kembali ke daftar utama' : `Lihat ${hiddenCount} tindakan yang menyangkut individu` }}
            </UiButton>
          </template>
          <template #cell-category="{ row }">
            <UiChip tone="improvement">{{ CATEGORY_LABEL[asAction(row).category] }}{{ asAction(row).subLabel ? ` · ${asAction(row).subLabel}` : '' }}</UiChip>
          </template>
          <template #cell-ownerName="{ row }">{{ asAction(row).ownerName ?? 'Belum ditentukan' }}</template>
          <template #cell-ownerJobRoleName="{ row }">{{ asAction(row).ownerJobRoleName ?? '' }}</template>
          <template #cell-sourceRef="{ row }">{{ asAction(row).sourceRef ?? '' }}</template>
          <template #cell-dueDate="{ row }">
            {{ formatDate(asAction(row).dueDate) }}
            <UiChip v-if="asAction(row).overdue" tone="critical">Lewat tenggat</UiChip>
          </template>
          <template #cell-status="{ row }">
            <template v-if="manage">
              <label class="el-sr-only" :for="`status-${asAction(row).id}`">Status {{ asAction(row).title }}</label>
              <select :id="`status-${asAction(row).id}`" class="el-input ina__status" :value="asAction(row).status" @change="changeStatus(asAction(row), $event)">
                <option :value="asAction(row).status">{{ STATUS_LABEL[asAction(row).status] }}</option>
                <option v-for="s in NEXT_STATUS[asAction(row).status]" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
              </select>
            </template>
            <UiStatus v-else :tone="STATUS_TONE[asAction(row).status]">{{ STATUS_LABEL[asAction(row).status] }}</UiStatus>
          </template>
          <template #cell-aksi="{ row }">
            <div class="ina__row">
              <UiButton variant="text" size="sm" @click="openForm(asAction(row))">Ubah</UiButton>
              <UiButton v-if="canVerify(asAction(row))" variant="tonal" size="sm" @click="assign(asAction(row))">Verifikasi lewat AI</UiButton>
            </div>
          </template>
        </UiDataTable>

        <UiNote class="ina__section">
          Akses: HR melihat semua tindakan. Atasan langsung melihat tindakan timnya hanya bila HR memberinya akses. Temuan yang menyangkut individu tidak ditampilkan di sini; hanya masalah proses dan sistem.
        </UiNote>

        <UiCard v-if="manage" class="ina__section" data-testid="ina-akses">
          <h2 class="el-h3">Akses atasan</h2>
          <p class="el-muted">Atasan yang diberi akses melihat tindakan milik dirinya dan bawahan langsungnya. Akses ini juga berlaku untuk daftar temuan di luar pelatihan. Setiap perubahan dicatat di log audit.</p>
          <ul v-if="supervisors.length" class="ina__list">
            <li v-for="s in supervisors" :key="s.supervisorId">
              <span><b>{{ s.name ?? s.email }}</b> <span class="el-muted">{{ s.email }}</span></span>
              <UiStatus :tone="s.granted ? 'success' : 'neutral'">{{ s.granted ? 'Punya akses' : 'Tanpa akses' }}</UiStatus>
              <UiButton :variant="s.granted ? 'outlined' : 'tonal'" size="sm" @click="toggleAccess(s)">{{ s.granted ? 'Cabut akses' : 'Beri akses' }}</UiButton>
            </li>
          </ul>
          <p v-else class="el-muted">Belum ada akun berperan Atasan di organisasi ini.</p>
        </UiCard>
      </template>
    </template>
  </AppShell>
</template>

<style scoped>
.ina__lead { margin: 0 0 16px; }
.ina__section { margin-top: 16px; }
.ina__sub { margin-top: 12px; }
.ina__row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.ina__notice { margin: 0 0 12px; color: var(--el-success); font-weight: 500; }
.ina__status { height: 36px; min-width: 120px; padding: 0 8px; }
.ina__list { list-style: none; margin: 12px 0 0; padding: 0; }
.ina__list li { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: space-between; padding: 10px 0; border-top: 1px solid var(--el-outline-variant); }
</style>
