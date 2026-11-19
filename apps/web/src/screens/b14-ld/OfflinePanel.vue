<script setup lang="ts">
// Tab Pelatihan offline: daftar + form tambah, dan detail (kelengkapan, peserta + kehadiran, asesmen, dokumentasi).
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ApiError } from '@/api/client'
import { UiButton, UiCard, UiErrorSummary, UiField, UiNote, UiStatus } from '@/ui'
import { ld, type AssessmentMode, type Doc, type Options, type Training, type TrainingDetail } from './api'
import { ASSESSMENT, CHECK_LABEL, groupLabel, tanggal } from './labels'

const props = defineProps<{ trainings: Training[] }>()
const emit = defineEmits<{ changed: [] }>()
const selected = defineModel<string | null>('selected', { default: null })

const detail = ref<TrainingDetail | null>(null)
const options = ref<Options | null>(null)
const error = ref('')
const notice = ref('')
const busy = ref(false)
const form = reactive({ title: '', vendorName: '', startsOn: '', venue: '' })
const formErrors = ref<{ message: string; fieldId: string }[]>([])
const pick = reactive({ jobRoleId: '', userId: '' })
const assessmentRef = ref('')
const scores = reactive<Record<string, string>>({})
const fileInput = ref<HTMLInputElement | null>(null)
const docKind = ref<Doc['kind']>('photo')

onMounted(async () => {
  try { options.value = (await ld.options()).data; form.vendorName = options.value.vendorName } catch { /* form tetap bisa dipakai tanpa pilihan */ }
})

async function loadDetail() {
  const id = selected.value ?? props.trainings[0]?.id ?? null
  if (!id) { detail.value = null; return }
  try {
    detail.value = (await ld.detail(id)).data
    selected.value = id
    assessmentRef.value = detail.value.assessmentRef ?? ''
    for (const p of detail.value.participantList) scores[p.userId] = p.score == null ? '' : String(p.score)
  } catch (e) { error.value = e instanceof ApiError ? e.message : 'Pelatihan tidak bisa dimuat' }
}
watch([selected, () => props.trainings.length], loadDetail, { immediate: true })

async function act(fn: () => Promise<unknown>, done = '') {
  busy.value = true; error.value = ''; notice.value = ''
  try { await fn(); notice.value = done; await loadDetail(); emit('changed') }
  catch (e) { error.value = e instanceof ApiError ? e.message : 'Tindakan gagal' } finally { busy.value = false }
}

async function add() {
  formErrors.value = []
  if (!form.title.trim()) formErrors.value.push({ message: 'Isi judul pelatihan', fieldId: 'ld-judul' })
  if (!form.startsOn) formErrors.value.push({ message: 'Isi tanggal pelatihan', fieldId: 'ld-tanggal' })
  if (formErrors.value.length) return
  await act(async () => {
    const { data } = await ld.create({ title: form.title, vendorName: form.vendorName, startsOn: form.startsOn, venue: form.venue })
    selected.value = data.id
    Object.assign(form, { title: '', startsOn: '', venue: '' })
  }, 'Pelatihan ditambahkan.')
}

const d = computed(() => detail.value)
const closed = computed(() => !!d.value && ['done', 'cancelled'].includes(d.value.group))
const candidates = computed(() => (options.value?.employees ?? []).filter((e) => !d.value?.participantList.some((p) => p.userId === e.id)))
const addByRole = () => act(() => ld.addParticipants(d.value!.id, { jobRoleId: pick.jobRoleId }), 'Peserta ditambahkan.')
const addOne = () => act(async () => { await ld.addParticipants(d.value!.id, { userIds: [pick.userId] }); pick.userId = '' }, 'Peserta ditambahkan.')
const removeOne = (userId: string) => act(() => ld.removeParticipant(d.value!.id, userId))
const mark = (userId: string, present: boolean | null) => act(() => ld.attendance(d.value!.id, { entries: [{ userId, present }] }))
const allPresent = () => act(() => ld.attendance(d.value!.id, { allPresent: true }), 'Semua peserta dicatat hadir.')
const setMode = (mode: AssessmentMode) => act(() => ld.assessment(d.value!.id, { mode, assessmentRef: assessmentRef.value }))
const saveScores = () => act(() => ld.scores(d.value!.id, d.value!.participantList.filter((p) => p.attendance !== false).map((p) => ({ userId: p.userId, score: scores[p.userId] === '' || scores[p.userId] == null ? null : Number(scores[p.userId]) }))), 'Skor disimpan.')
const patch = (body: Record<string, unknown>, done = '') => act(() => ld.patch(d.value!.id, body), done)
function upload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  void act(() => ld.upload(d.value!.id, file, docKind.value), 'Berkas diunggah.').finally(() => { if (fileInput.value) fileInput.value.value = '' })
}
async function download(doc: Doc) {
  try {
    const url = URL.createObjectURL(await ld.download(doc))
    const a = document.createElement('a'); a.href = url; a.download = doc.filename; a.click()
    URL.revokeObjectURL(url)
  } catch (e) { error.value = e instanceof ApiError ? e.message : 'Berkas tidak bisa diunduh' }
}
const removeDoc = (doc: Doc) => act(() => ld.removeDoc(doc.id), 'Berkas dihapus.')
const attendanceLabel = (v: boolean | null) => (v === true ? 'Hadir' : v === false ? 'Tidak hadir' : 'Belum dicatat')
</script>

<template>
  <div class="ld-split">
    <UiCard as="section" aria-label="Daftar pelatihan offline">
      <h2 class="el-h3">Pelatihan offline</h2>
      <p v-if="!trainings.length" class="el-muted">Belum ada pelatihan offline.</p>
      <ul class="ld-list">
        <li v-for="t in trainings" :key="t.id">
          <button type="button" class="ld-pick" :aria-current="selected === t.id ? 'true' : undefined" @click="selected = t.id">
            <span class="ld-row"><b>{{ t.title }}</b><UiStatus :tone="groupLabel(t).tone">{{ groupLabel(t).text }}</UiStatus></span>
            <span class="el-muted ld-small">{{ tanggal(t.startsOn) }} · {{ t.vendorName ?? 'Tanpa vendor' }}</span>
          </button>
        </li>
      </ul>
      <h3 class="el-h3 ld-gap">Tambah pelatihan</h3>
      <form class="ld-form" novalidate @submit.prevent="add">
        <UiErrorSummary v-if="formErrors.length" :errors="formErrors" />
        <UiField id="ld-judul" v-slot="{ attrs }" label="Judul pelatihan"><input v-bind="attrs" v-model="form.title" class="el-input" type="text"></UiField>
        <UiField id="ld-vendor" v-slot="{ attrs }" label="Vendor atau penyedia"><input v-bind="attrs" v-model="form.vendorName" class="el-input" type="text"></UiField>
        <UiField id="ld-tanggal" v-slot="{ attrs }" label="Tanggal"><input v-bind="attrs" v-model="form.startsOn" class="el-input" type="date"></UiField>
        <UiField id="ld-tempat" v-slot="{ attrs }" label="Tempat"><input v-bind="attrs" v-model="form.venue" class="el-input" type="text"></UiField>
        <UiButton type="submit" :disabled="busy">Tambahkan</UiButton>
      </form>
    </UiCard>

    <UiCard v-if="d" as="section" aria-label="Detail pelatihan" data-testid="detail-pelatihan">
      <UiNote v-if="error" tone="critical" data-testid="galat-offline">{{ error }}</UiNote>
      <UiNote v-if="notice" tone="success" data-testid="info-offline">{{ notice }}</UiNote>
      <div class="ld-row">
        <div><h2 class="el-h2">{{ d.title }}</h2><p class="el-muted">{{ tanggal(d.startsOn) }} · {{ d.venue ?? 'Tempat belum diisi' }} · {{ d.vendorName ?? 'Tanpa vendor' }}</p></div>
        <UiStatus :tone="groupLabel(d).tone">{{ groupLabel(d).text }}</UiStatus>
      </div>
      <div v-if="!closed" class="ld-actions">
        <UiButton v-if="!d.materialsReady" variant="outlined" size="sm" :disabled="busy" @click="patch({ materialsReady: true }, 'Materi ditandai siap.')">Tandai materi siap</UiButton>
        <UiButton variant="tonal" size="sm" :disabled="busy" @click="patch({ status: 'done', sessionsDone: d.sessionCount ?? 1 }, 'Pelatihan ditandai selesai.')">Tandai selesai</UiButton>
        <UiButton variant="text" size="sm" :disabled="busy" @click="patch({ status: 'cancelled' }, 'Pelatihan dibatalkan.')">Batalkan pelatihan</UiButton>
      </div>

      <h3 class="el-h3 ld-gap">Kelengkapan data</h3>
      <ul class="ld-list" aria-label="Kelengkapan data">
        <li v-for="c in d.readiness" :key="c.key" class="ld-item">
          <UiStatus :tone="c.state === 'complete' ? 'success' : c.state === 'waiting' ? 'info' : c.optional ? 'neutral' : 'warning'">
            {{ CHECK_LABEL[c.key] }}: {{ c.state === 'complete' ? 'lengkap' : c.state === 'waiting' ? 'menunggu' : c.optional ? 'belum ada (tidak wajib)' : 'belum lengkap' }}
          </UiStatus>
        </li>
      </ul>

      <h3 class="el-h3 ld-gap">Daftar peserta dan kehadiran</h3>
      <div v-if="!closed" class="ld-add">
        <label class="el-label">Tambah per jabatan
          <select v-model="pick.jobRoleId" class="el-input"><option value="">Pilih jabatan</option><option v-for="j in options?.jobRoles ?? []" :key="j.id" :value="j.id">{{ j.name }} ({{ j.people }} orang)</option></select>
        </label>
        <UiButton variant="tonal" size="sm" :disabled="busy || !pick.jobRoleId" @click="addByRole">Tambah semua</UiButton>
        <label class="el-label">Tambah karyawan
          <select v-model="pick.userId" class="el-input"><option value="">Pilih karyawan</option><option v-for="e in candidates" :key="e.id" :value="e.id">{{ e.name ?? e.email }}</option></select>
        </label>
        <UiButton variant="tonal" size="sm" :disabled="busy || !pick.userId" @click="addOne">Tambah</UiButton>
      </div>
      <p v-if="!d.participantList.length" class="el-muted">Belum ada peserta.</p>
      <div v-else class="ld-scroll">
        <table class="ld-table">
          <caption class="el-sr-only">Peserta dan kehadiran</caption>
          <thead><tr><th scope="col">Peserta</th><th scope="col">Kehadiran</th><th v-if="d.assessmentMode !== 'none'" scope="col">Skor</th><th scope="col">Tindakan</th></tr></thead>
          <tbody>
            <tr v-for="p in d.participantList" :key="p.userId">
              <td>{{ p.name ?? p.email }}<div class="el-muted ld-small">{{ p.jobRoleName ?? '' }}</div></td>
              <td><UiStatus :tone="p.attendance === true ? 'success' : p.attendance === false ? 'critical' : 'neutral'">{{ attendanceLabel(p.attendance) }}</UiStatus></td>
              <td v-if="d.assessmentMode !== 'none'">
                <input
                  v-if="d.assessmentMode === 'vendor_manual' && p.attendance !== false" v-model="scores[p.userId]" class="el-input ld-score" type="number" min="0" max="100" step="0.5"
                  :aria-label="`Skor ${p.name ?? p.email}`"
                >
                <span v-else>{{ p.score ?? '–' }}</span>
              </td>
              <td class="ld-chips">
                <UiButton variant="text" size="sm" :disabled="busy" @click="mark(p.userId, true)">Hadir</UiButton>
                <UiButton variant="text" size="sm" :disabled="busy" @click="mark(p.userId, false)">Tidak hadir</UiButton>
                <UiButton v-if="!closed" variant="text" size="sm" :disabled="busy" :aria-label="`Hapus ${p.name ?? p.email} dari peserta`" @click="removeOne(p.userId)">Hapus</UiButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="d.participantList.length" class="ld-actions">
        <UiButton variant="outlined" size="sm" :disabled="busy" @click="allPresent">Catat semua hadir</UiButton>
        <UiButton v-if="d.assessmentMode === 'vendor_manual'" size="sm" :disabled="busy" @click="saveScores">Simpan skor</UiButton>
      </div>

      <h3 class="el-h3 ld-gap">Asesmen</h3>
      <UiCard tonal>
        <p><b>{{ ASSESSMENT[d.assessmentStatus].label }}</b></p>
        <p class="el-muted ld-small">{{ ASSESSMENT[d.assessmentStatus].text }}</p>
        <UiField id="ld-kode-asesmen" v-slot="{ attrs }" label="Kode asesmen di EliteMentor" hint="Diperlukan bila skor diambil dari EliteMentor">
          <input v-bind="attrs" v-model="assessmentRef" class="el-input" type="text">
        </UiField>
        <div class="ld-actions">
          <UiButton variant="tonal" size="sm" :disabled="busy || !assessmentRef.trim()" @click="setMode('elitementor')">Ambil skor dari EliteMentor</UiButton>
          <UiButton variant="tonal" size="sm" :disabled="busy" @click="setMode('vendor_manual')">Input skor dari vendor</UiButton>
          <UiButton v-if="d.assessmentMode !== 'none'" variant="text" size="sm" :disabled="busy" @click="setMode('none')">Tanpa asesmen</UiButton>
        </div>
      </UiCard>

      <h3 class="el-h3 ld-gap">Dokumentasi</h3>
      <UiNote v-if="!d.storageReady" tone="warning">Penyimpanan berkas belum dikonfigurasi di server ini, jadi unggah belum bisa dipakai.</UiNote>
      <p v-if="!d.documents.length" class="el-muted">Belum ada berkas.</p>
      <ul class="ld-list" aria-label="Berkas dokumentasi">
        <li v-for="doc in d.documents" :key="doc.id" class="ld-item ld-row">
          <span>{{ doc.filename }} <span class="el-muted ld-small">· {{ doc.kind === 'material' ? 'materi' : doc.kind === 'photo' ? 'foto' : 'video' }} · {{ Math.max(1, Math.round(doc.sizeBytes / 1024)) }} KB</span></span>
          <span class="ld-chips">
            <UiButton variant="text" size="sm" icon="download" @click="download(doc)">Unduh</UiButton>
            <UiButton variant="text" size="sm" :disabled="busy" @click="removeDoc(doc)">Hapus</UiButton>
          </span>
        </li>
      </ul>
      <div v-if="d.storageReady" class="ld-add">
        <label class="el-label">Jenis berkas
          <select v-model="docKind" class="el-input"><option value="photo">Foto</option><option value="video">Video</option><option value="material">Materi</option></select>
        </label>
        <label class="el-label">Unggah foto, video, atau materi
          <input ref="fileInput" class="el-input" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf" :disabled="busy" @change="upload">
        </label>
      </div>
      <p class="el-muted ld-small ld-gap">Catatan UU PDP: foto peserta hanya dipakai untuk dokumentasi pelatihan dan hanya bisa dibuka oleh HR.</p>
    </UiCard>
  </div>
</template>

<style>
.ld-split { display: grid; grid-template-columns: minmax(260px, 1fr) minmax(0, 2fr); gap: 16px; align-items: start; }
@media (max-width: 1100px) { .ld-split { grid-template-columns: minmax(0, 1fr); } }
.ld-list { list-style: none; margin: 0; padding: 0; }
.ld-pick {
  display: flex; flex-direction: column; gap: 4px; width: 100%; text-align: left; padding: 12px; border: 0; border-bottom: 1px solid var(--el-outline-variant);
  background: none; color: inherit; font: inherit; cursor: pointer; border-radius: 8px;
}
.ld-pick[aria-current='true'] { background: var(--el-secondary-container); color: var(--el-on-secondary-container); }
.ld-pick:focus-visible { outline: 2px solid var(--el-primary); outline-offset: -2px; }
.ld-form { display: grid; gap: 12px; }
.ld-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.ld-add { display: flex; gap: 12px; flex-wrap: wrap; align-items: end; margin-bottom: 12px; }
.ld-scroll { overflow-x: auto; }
.ld-table { width: 100%; border-collapse: collapse; }
.ld-table th { text-align: left; font-size: 12px; text-transform: uppercase; color: var(--el-on-surface-variant); padding: 8px; border-bottom: 1px solid var(--el-outline-variant); }
.ld-table td { padding: 8px; border-bottom: 1px solid var(--el-outline-variant); vertical-align: middle; }
.ld-score { width: 96px; }
</style>
