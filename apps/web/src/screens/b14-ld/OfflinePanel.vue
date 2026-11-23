<script setup lang="ts">
// Tab Pelatihan offline: daftar + form tambah, dan detail (kelengkapan, peserta + kehadiran, asesmen, dokumentasi).
// Tata letak ikut mockup (P7 LD-9..15); fitur kelola di luar mockup ada di <details> sekunder (K-P7-2).
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { ApiError } from '@/api/client'
import { UiButton, UiCard, UiChip, UiDataTable, UiErrorSummary, UiField, UiNote, type UiColumn } from '@/ui'
import { ld, type AssessmentMode, type CheckKey, type Doc, type Options, type Participant, type Training, type TrainingDetail } from './api'
import { ASSESSMENT, CHECK_LABEL, DOC_KIND_LABEL, groupLabel, tanggal, type Tone } from './labels'

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
const assessmentEl = ref<HTMLElement | null>(null)
const edit = reactive({ title: '', vendorName: '', venue: '', startsOn: '', endsOn: '', sessionCount: 1, sessionsDone: 0 })
const editOpen = ref(false)
const peopleOpen = ref(false)
const emPicked = ref(false)

onMounted(async () => {
  try { options.value = (await ld.options()).data; form.vendorName = options.value.vendorName } catch { /* form tetap bisa dipakai tanpa pilihan */ }
})

// Muat ulang bisa terpicu beruntun (pilih pelatihan, daftar berubah). Hanya respons terakhir yang dipakai, dan
// formulir ubah hanya diisi ulang saat pelatihan yang dibuka berganti, supaya isian HR tidak tertimpa.
let loadSeq = 0
async function loadDetail() {
  const id = selected.value ?? props.trainings[0]?.id ?? null
  if (!id) { detail.value = null; return }
  const seq = ++loadSeq
  try {
    const next = (await ld.detail(id)).data
    if (seq !== loadSeq) return
    const switched = detail.value?.id !== next.id
    detail.value = next
    selected.value = id
    assessmentRef.value = next.assessmentRef ?? ''
    const t = next
    if (switched) {
      Object.assign(edit, { title: t.title, vendorName: t.vendorName ?? '', venue: t.venue ?? '', startsOn: t.startsOn ?? '', endsOn: t.endsOn ?? '', sessionCount: t.sessionCount ?? 1, sessionsDone: t.sessionsDone ?? 0 })
      editOpen.value = false; peopleOpen.value = false; emPicked.value = false
    }
    for (const p of next.participantList) scores[p.userId] = p.score == null ? '' : String(p.score)
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
/** Jenis berkas dari MIME (LD-15): gambar = foto, video = video, selain itu materi. */
const kindOf = (file: File): Doc['kind'] => (file.type.startsWith('image/') ? 'photo' : file.type.startsWith('video/') ? 'video' : 'material')
function upload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  void act(() => ld.upload(d.value!.id, file, kindOf(file)), 'Berkas diunggah.').finally(() => { if (fileInput.value) fileInput.value.value = '' })
}
async function download(doc: Doc) {
  try {
    const url = URL.createObjectURL(await ld.download(doc))
    const a = document.createElement('a'); a.href = url; a.download = doc.filename; a.click()
    URL.revokeObjectURL(url)
  } catch (e) { error.value = e instanceof ApiError ? e.message : 'Berkas tidak bisa diunduh' }
}
const removeDoc = (doc: Doc) => act(() => ld.removeDoc(doc.id), 'Berkas dihapus.')
const saveEdit = () => patch({ ...edit, vendorName: edit.vendorName || null, venue: edit.venue || null, endsOn: edit.endsOn || null }, 'Data pelatihan disimpan.')
const attendanceLabel = (v: boolean | null) => (v === true ? 'Hadir' : v === false ? 'Tidak hadir' : 'Belum dicatat')
const attendanceTone = (v: boolean | null): Tone => (v === true ? 'success' : v === false ? 'critical' : 'neutral')

/** Baris kelengkapan data (LD-12): chip, detail dari data detail, dan satu tindakan. */
type ReadinessRow = { key: CheckKey; chip: { text: string; tone: Tone }; detail: string; action: string; disabled: boolean; run: () => void }
const STATE_CHIP = {
  complete: { text: 'Lengkap', tone: 'success' }, waiting: { text: 'Menunggu', tone: 'training' }, missing: { text: 'Kurang', tone: 'review' }, optional: { text: 'Opsional', tone: 'neutral' },
} as const
async function openEdit() { editOpen.value = true; await nextTick(); document.getElementById('ld-ubah-judul')?.focus() }
async function openPeople() { peopleOpen.value = true; await nextTick(); document.getElementById('ld-tambah-jabatan')?.focus() }
function toAssessment() { assessmentEl.value?.scrollIntoView({ block: 'start' }); assessmentEl.value?.focus() }
const readinessRows = computed<ReadinessRow[]>(() => {
  const t = d.value
  if (!t) return []
  const n = t.participantList.length
  const recorded = t.participantList.filter((p) => p.attendance !== null).length
  const present = t.participantList.filter((p) => p.attendance === true).length
  const media = t.documents.filter((x) => x.kind !== 'material').length
  const info: Record<CheckKey, Omit<ReadinessRow, 'key' | 'chip'>> = {
    schedule: { detail: `${tanggal(t.startsOn)} · ${t.venue ?? 'tempat belum diisi'}`, action: 'Ubah', disabled: closed.value, run: openEdit },
    materials: { detail: t.materialsReady ? 'Materi siap' : 'Materi belum ditandai siap', action: 'Tandai siap', disabled: closed.value || t.materialsReady || busy.value, run: () => patch({ materialsReady: true }, 'Materi ditandai siap.') },
    participants: { detail: `${n} peserta`, action: 'Tambah', disabled: closed.value, run: openPeople },
    attendance: { detail: `${recorded} dari ${n} sudah dicatat, hadir ${present}`, action: 'Tandai semua hadir', disabled: closed.value || !n || busy.value, run: allPresent },
    assessment: { detail: ASSESSMENT[t.assessmentStatus].label, action: 'Atur di bawah', disabled: false, run: toAssessment },
    documentation: { detail: `${media} foto atau video`, action: 'Unggah', disabled: !t.storageReady || busy.value, run: () => fileInput.value?.click() },
  }
  return t.readiness.map((c) => ({
    key: c.key, chip: STATE_CHIP[c.state === 'missing' && c.optional ? 'optional' : c.state], ...info[c.key],
  }))
})

const assessmentTone = computed<Tone>(() => {
  const s = d.value?.assessmentStatus
  return s === 'synced' || s === 'manual' ? 'success' : s === 'none' ? 'review' : 'training'
})
const showRef = computed(() => emPicked.value || d.value?.assessmentMode === 'elitementor')

const PEOPLE_COLS = computed<UiColumn[]>(() => [
  { key: 'name', label: 'Peserta' }, { key: 'attendance', label: 'Kehadiran' },
  ...(d.value?.assessmentMode !== 'none' ? [{ key: 'score', label: 'Skor' }] : []),
  ...(closed.value ? [] : [{ key: 'aksi', label: 'Tindakan' }]),
])
const peopleRows = computed(() => (d.value?.participantList ?? []).map((p) => ({ ...p, id: p.userId }) as unknown as Record<string, unknown>))
const asP = (r: Record<string, unknown>) => r as unknown as Participant
</script>

<template>
  <div class="ld-split">
    <UiCard as="section" aria-label="Daftar pelatihan offline">
      <h2 class="el-h3">Pelatihan offline</h2>
      <p v-if="!trainings.length" class="el-muted">Belum ada pelatihan offline.</p>
      <ul class="ld-list">
        <li v-for="t in trainings" :key="t.id">
          <button type="button" class="ld-pick" :aria-current="selected === t.id ? 'true' : undefined" @click="selected = t.id">
            <span class="ld-head"><b>{{ t.title }}</b><UiChip :tone="groupLabel(t).tone">{{ groupLabel(t).text }}</UiChip></span>
            <span class="el-muted ld-xs">{{ tanggal(t.startsOn) }} · {{ t.vendorName ?? 'Tanpa vendor' }}</span>
          </button>
        </li>
      </ul>
      <h3 class="el-h3 ld-gap">Tambah pelatihan</h3>
      <form class="ld-form" novalidate @submit.prevent="add">
        <UiErrorSummary v-if="formErrors.length" :errors="formErrors" />
        <UiField id="ld-judul" v-slot="{ attrs }" label="Judul pelatihan"><input v-bind="attrs" v-model="form.title" class="el-input" type="text" placeholder="Judul pelatihan"></UiField>
        <UiField id="ld-vendor" v-slot="{ attrs }" label="Vendor atau penyedia"><input v-bind="attrs" v-model="form.vendorName" class="el-input" type="text" placeholder="Vendor atau penyedia"></UiField>
        <UiField id="ld-tanggal" v-slot="{ attrs }" label="Tanggal"><input v-bind="attrs" v-model="form.startsOn" class="el-input" type="date"></UiField>
        <UiField id="ld-tempat" v-slot="{ attrs }" label="Tempat"><input v-bind="attrs" v-model="form.venue" class="el-input" type="text" placeholder="Tempat"></UiField>
        <UiButton type="submit" :disabled="busy">Tambahkan</UiButton>
      </form>
    </UiCard>

    <UiCard v-if="d" as="section" aria-label="Detail pelatihan" data-testid="detail-pelatihan">
      <UiNote v-if="error" tone="critical" data-testid="galat-offline">{{ error }}</UiNote>
      <div v-if="notice" role="status"><UiNote tone="success" data-testid="info-offline">{{ notice }}</UiNote></div>
      <div class="ld-head">
        <div><h2 class="el-h2 ld-m0">{{ d.title }}</h2><p class="el-muted ld-m0">{{ tanggal(d.startsOn) }} · {{ d.venue ?? 'Tempat belum diisi' }} · {{ d.vendorName ?? 'Tanpa vendor' }}</p></div>
        <UiChip :tone="groupLabel(d).tone">{{ groupLabel(d).text }}</UiChip>
      </div>

      <h3 class="el-h3 ld-gap">Kelengkapan data</h3>
      <ul class="ld-list" aria-label="Kelengkapan data">
        <li v-for="r in readinessRows" :key="r.key" class="ld-check">
          <div class="ld-min">
            <UiChip :tone="r.chip.tone">{{ r.chip.text }}</UiChip> <b class="ld-check__title">{{ CHECK_LABEL[r.key] }}</b>
            <div class="el-muted ld-xs">{{ r.detail }}</div>
          </div>
          <UiButton variant="tonal" size="sm" :disabled="r.disabled" @click="r.run()">{{ r.action }}<span v-if="r.action !== 'Tandai semua hadir'" class="el-sr-only"> {{ CHECK_LABEL[r.key] }}</span></UiButton>
        </li>
      </ul>

      <UiCard v-if="editOpen && !closed" tonal class="ld-gap-s" as="section" aria-label="Ubah jadwal dan data pelatihan">
        <h3 class="el-h3">Ubah jadwal dan data pelatihan</h3>
        <form class="ld-form" @submit.prevent="saveEdit">
          <UiField id="ld-ubah-judul" v-slot="{ attrs }" label="Judul"><input v-bind="attrs" v-model="edit.title" class="el-input" type="text"></UiField>
          <UiField id="ld-ubah-vendor" v-slot="{ attrs }" label="Vendor atau penyedia"><input v-bind="attrs" v-model="edit.vendorName" class="el-input" type="text"></UiField>
          <UiField id="ld-ubah-tempat" v-slot="{ attrs }" label="Tempat"><input v-bind="attrs" v-model="edit.venue" class="el-input" type="text"></UiField>
          <UiField id="ld-ubah-mulai" v-slot="{ attrs }" label="Tanggal mulai"><input v-bind="attrs" v-model="edit.startsOn" class="el-input" type="date"></UiField>
          <UiField id="ld-ubah-selesai" v-slot="{ attrs }" label="Tanggal selesai"><input v-bind="attrs" v-model="edit.endsOn" class="el-input" type="date"></UiField>
          <UiField id="ld-ubah-sesi" v-slot="{ attrs }" label="Jumlah sesi"><input v-bind="attrs" v-model.number="edit.sessionCount" class="el-input" type="number" min="1" max="100"></UiField>
          <UiField id="ld-ubah-selesai-sesi" v-slot="{ attrs }" label="Sesi yang sudah berjalan"><input v-bind="attrs" v-model.number="edit.sessionsDone" class="el-input" type="number" min="0" :max="edit.sessionCount"></UiField>
          <div class="ld-actions">
            <UiButton type="submit" variant="tonal" :disabled="busy">Simpan data pelatihan</UiButton>
            <UiButton variant="text" @click="editOpen = false">Tutup</UiButton>
          </div>
        </form>
      </UiCard>

      <h3 class="el-h3 ld-gap">Daftar peserta dan kehadiran</h3>
      <p v-if="!d.participantList.length" class="el-muted">Belum ada peserta.</p>
      <UiDataTable v-else :columns="PEOPLE_COLS" :rows="peopleRows" row-key="id" caption="Peserta dan kehadiran" caption-hidden>
        <template #cell-name="{ row }"><span class="ld-strong">{{ asP(row).name ?? asP(row).email }}</span><div v-if="asP(row).jobRoleName" class="el-muted ld-xs">{{ asP(row).jobRoleName }}</div></template>
        <template #cell-attendance="{ row }"><UiChip :tone="attendanceTone(asP(row).attendance)">{{ attendanceLabel(asP(row).attendance) }}</UiChip></template>
        <template #cell-score="{ row }">
          <input
            v-if="d.assessmentMode === 'vendor_manual' && asP(row).attendance !== false" v-model="scores[asP(row).userId]" class="el-input ld-score" type="number" min="0" max="100" step="0.5"
            :aria-label="`Skor ${asP(row).name ?? asP(row).email}`"
          >
          <span v-else class="el-mono">{{ asP(row).score ?? '–' }}</span>
        </template>
        <template #cell-aksi="{ row }">
          <UiButton variant="tonal" size="sm" :disabled="busy" @click="mark(asP(row).userId, asP(row).attendance !== true)">
            {{ asP(row).attendance === true ? 'Tandai tidak hadir' : 'Tandai hadir' }}<span class="el-sr-only"> {{ asP(row).name ?? asP(row).email }}</span>
          </UiButton>
        </template>
      </UiDataTable>
      <div v-if="d.assessmentMode === 'vendor_manual' && d.participantList.length" class="ld-actions">
        <UiButton size="sm" :disabled="busy" @click="saveScores">Simpan skor</UiButton>
      </div>
      <details v-if="!closed" class="ld-more ld-gap-s" :open="peopleOpen" @toggle="peopleOpen = ($event.target as HTMLDetailsElement).open">
        <summary>Ubah daftar peserta</summary>
        <div class="ld-add ld-gap-s">
          <UiField id="ld-tambah-jabatan" v-slot="{ attrs }" label="Tambah per jabatan">
            <select v-bind="attrs" v-model="pick.jobRoleId" class="el-input"><option value="">Pilih jabatan</option><option v-for="j in options?.jobRoles ?? []" :key="j.id" :value="j.id">{{ j.name }} ({{ j.people }} orang)</option></select>
          </UiField>
          <UiButton variant="tonal" size="sm" :disabled="busy || !pick.jobRoleId" @click="addByRole">Tambah semua</UiButton>
          <UiField id="ld-tambah-karyawan" v-slot="{ attrs }" label="Tambah karyawan">
            <select v-bind="attrs" v-model="pick.userId" class="el-input"><option value="">Pilih karyawan</option><option v-for="e in candidates" :key="e.id" :value="e.id">{{ e.name ?? e.email }}</option></select>
          </UiField>
          <UiButton variant="tonal" size="sm" :disabled="busy || !pick.userId" @click="addOne">Tambah</UiButton>
        </div>
        <ul v-if="d.participantList.length" class="ld-list" aria-label="Hapus peserta">
          <li v-for="p in d.participantList" :key="p.userId" class="ld-check">
            <span>{{ p.name ?? p.email }}</span>
            <UiButton variant="text" size="sm" :disabled="busy" :aria-label="`Hapus ${p.name ?? p.email} dari peserta`" @click="removeOne(p.userId)">Hapus</UiButton>
          </li>
        </ul>
      </details>

      <h3 ref="assessmentEl" class="el-h3 ld-gap" tabindex="-1">Asesmen</h3>
      <div class="ld-mod">
        <div class="ld-head ld-wrap">
          <div class="ld-min">
            <UiChip :tone="assessmentTone">{{ ASSESSMENT[d.assessmentStatus].label }}</UiChip>
            <p class="el-muted ld-small ld-mt6">{{ ASSESSMENT[d.assessmentStatus].text }}</p>
          </div>
          <div class="ld-chips">
            <UiButton variant="tonal" size="sm" :disabled="busy || !options?.webhookSync" @click="emPicked = true">Jalankan lewat EliteMentor</UiButton>
            <UiButton variant="tonal" size="sm" :disabled="busy" @click="setMode('vendor_manual')">Input skor dari vendor</UiButton>
            <UiButton v-if="d.assessmentMode !== 'none'" variant="text" size="sm" :disabled="busy" @click="setMode('none')">Tanpa asesmen</UiButton>
          </div>
        </div>
        <p v-if="!options?.webhookSync" class="el-muted ld-xs ld-mt6">Sinkron skor dari EliteMentor belum diaktifkan. Pakai input skor dari vendor.</p>
        <form v-if="showRef" class="ld-add ld-gap-s" @submit.prevent="setMode('elitementor')">
          <UiField id="ld-kode-asesmen" v-slot="{ attrs }" label="Kode asesmen di EliteMentor" hint="Skor masuk otomatis setelah peserta mengerjakan asesmen di EliteMentor.">
            <input v-bind="attrs" v-model="assessmentRef" class="el-input" type="text">
          </UiField>
          <UiButton type="submit" variant="tonal" size="sm" :disabled="busy || !assessmentRef.trim() || !options?.webhookSync">Simpan kode asesmen</UiButton>
        </form>
      </div>

      <h3 class="el-h3 ld-gap">Dokumentasi</h3>
      <UiNote v-if="!d.storageReady" tone="warning">Penyimpanan berkas belum dikonfigurasi di server ini, jadi unggah belum bisa dipakai.</UiNote>
      <div class="ld-head ld-wrap">
        <span class="el-muted">{{ d.documents.length }} berkas foto atau video terunggah</span>
        <UiButton variant="tonal" size="sm" :disabled="busy || !d.storageReady" @click="fileInput?.click()">Unggah foto atau video</UiButton>
      </div>
      <label class="el-sr-only" for="ld-berkas">Pilih berkas foto atau video</label>
      <input id="ld-berkas" ref="fileInput" class="el-sr-only" tabindex="-1" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf" :disabled="busy || !d.storageReady" @change="upload">
      <ul v-if="d.documents.length" class="ld-list" aria-label="Berkas dokumentasi">
        <li v-for="doc in d.documents" :key="doc.id" class="ld-check">
          <span>{{ doc.filename }} <span class="el-muted ld-small">· {{ DOC_KIND_LABEL[doc.kind] }} · {{ Math.max(1, Math.round(doc.sizeBytes / 1024)) }} KB</span></span>
          <span class="ld-chips">
            <UiButton variant="text" size="sm" icon="download" @click="download(doc)">Unduh</UiButton>
            <UiButton variant="text" size="sm" :disabled="busy" @click="removeDoc(doc)">Hapus</UiButton>
          </span>
        </li>
      </ul>
      <p class="el-mono ld-meta">Catatan UU PDP: foto peserta hanya dipakai untuk dokumentasi pelatihan dan hanya bisa dibuka oleh HR.</p>

      <details v-if="!closed" class="ld-more ld-gap">
        <summary>Kelola pelatihan</summary>
        <div class="ld-actions">
          <UiButton variant="tonal" size="sm" :disabled="busy" @click="patch({ status: 'done', sessionsDone: d.sessionCount ?? 1 }, 'Pelatihan ditandai selesai.')">Tandai selesai</UiButton>
          <UiButton variant="text" size="sm" :disabled="busy" @click="patch({ status: 'cancelled' }, 'Pelatihan dibatalkan.')">Batalkan pelatihan</UiButton>
        </div>
      </details>
    </UiCard>
  </div>
</template>

<style>
.ld-split { display: grid; grid-template-columns: minmax(260px, 1fr) minmax(0, 2fr); gap: 16px; align-items: start; }
@media (max-width: 1100px) { .ld-split { grid-template-columns: minmax(0, 1fr); } }
.ld-list { list-style: none; margin: 0; padding: 0; }
/* LD-9: tiap pelatihan kotak outlined (`.mod`), terpilih bergaris primer */
.ld-pick {
  display: flex; flex-direction: column; gap: 4px; width: 100%; text-align: left; padding: 12px 14px; margin-bottom: 8px;
  border: 1px solid var(--el-outline-variant); border-radius: 12px; background: var(--el-surface-card); color: inherit; font: inherit; cursor: pointer;
}
.ld-pick[aria-current='true'] { border-color: var(--el-primary); }
.ld-pick:focus-visible { outline: 2px solid var(--el-primary); outline-offset: 2px; }
.ld-form { display: grid; gap: 12px; }
.ld-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.ld-add { display: flex; gap: 12px; flex-wrap: wrap; align-items: end; margin-bottom: 12px; }
.ld-check { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--el-outline-variant); }
.ld-check__title { margin-left: 6px; }
.ld-wrap { flex-wrap: wrap; align-items: center; }
.ld-m0 { margin: 0; }
.ld-mt6 { margin: 6px 0 0; }
.ld-meta { font-size: 11px; color: var(--el-on-surface-variant); margin: 12px 0 0; }
.ld-score { width: 96px; }
</style>
