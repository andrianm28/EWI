<script setup lang="ts">
// PK-14: antrean review hasil AI lintas karyawan untuk HR (PD-14 ★A, PM-3 ★A, PM-5 ★A).
// Temuan AI berstatus draf: tidak terlihat atasan dan karyawan, dan tidak dihitung di dashboard,
// sampai HR menyetujui, mengubah, atau menolaknya. Transkrip mentah tidak ditampilkan di sini (PO-6 ★A).
// Paritas B7 web: layar mockup "Tinjauan temuan AI" per gap ada di TinjauanView.vue; antrean ini tetap untuk
// mengubah teks, menolak, dan riwayat (dirujuk banner Pengelolaan TNA dan dashboard).
import { computed, onMounted, reactive, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { UiBreadcrumb, UiButton, UiCard, UiChip, UiErrorSummary, UiField, UiStatus, UiTabs } from '@/ui'
import { confidenceLabel, lna, REVIEW_STATUS_LABEL, type ReviewCounts, type ReviewItem } from '@/api/lna'
import './b7.css'

const tab = ref<'draft' | 'reviewed'>('draft')
const items = ref<ReviewItem[]>([])
const counts = ref<ReviewCounts | null>(null)
const error = ref('')
const notice = ref('')
const busy = ref(false)
// Satu formulir terbuka sekaligus: ubah atau tolak
const form = reactive<{ id: string; mode: 'edit' | 'reject' | ''; title: string; detail: string; category: 'training' | 'non_training'; note: string }>({
  id: '', mode: '', title: '', detail: '', category: 'training', note: '',
})

const CATEGORY_LABEL = { training: 'Training', non_training: 'Non-training' } as const
const TONE = { ok: 'success', warn: 'review', low: 'critical' } as const
const pending = computed(() => counts.value?.draft ?? 0)
const reviewed = computed(() => (counts.value ? counts.value.approved + counts.value.edited + counts.value.rejected : 0))
const tabs = computed(() => [
  { key: 'draft', label: `Menunggu review (${pending.value})` },
  { key: 'reviewed', label: `Sudah direview (${reviewed.value})` },
])
const tabModel = computed({ get: () => tab.value, set: (t: string) => show(t as 'draft' | 'reviewed') })

async function load() {
  error.value = ''
  try {
    const r = await lna.reviewQueue(tab.value)
    items.value = r.data
    counts.value = r.counts
  } catch (e) { error.value = (e as Error).message }
}
onMounted(load)

function show(t: 'draft' | 'reviewed') { tab.value = t; closeForm(); load() }
function openForm(f: ReviewItem, mode: 'edit' | 'reject') {
  Object.assign(form, { id: f.id, mode, title: f.title, detail: f.detail ?? '', category: f.category, note: '' })
}
function closeForm() { Object.assign(form, { id: '', mode: '', note: '' }) }

async function decide(f: ReviewItem, decision: 'approve' | 'edit' | 'reject') {
  error.value = ''; notice.value = ''; busy.value = true
  try {
    if (decision === 'reject' && !form.note.trim()) throw new Error('Tulis alasan penolakan.')
    const body = decision === 'edit'
      ? { decision, title: form.title.trim(), detail: form.detail.trim(), category: form.category, note: form.note.trim() || undefined }
      : decision === 'reject' ? { decision, note: form.note.trim() } : { decision }
    await lna.reviewFinding(f.id, body)
    notice.value = decision === 'reject' ? 'Temuan ditolak dan tidak akan ditampilkan.' : 'Temuan disetujui dan sekarang tampil untuk karyawan, atasan, dan dashboard.'
    closeForm()
    await load()
  } catch (e) { error.value = (e as Error).message } finally { busy.value = false }
}
const target = (f: ReviewItem) => (f.metricName ? `${f.metricName}: target ${f.target}, realisasi ${f.actual}` : '')
</script>

<template>
  <AppShell>
    <UiBreadcrumb :items="[{ label: 'Training Needs', to: { name: 'tna' } }, { label: 'Tinjauan hasil AI' }]" />
    <h1 class="el-h1">Review hasil AI</h1>
    <p class="el-muted b7-sub">
      Temuan AI baru tampil ke atasan dan karyawan, dan baru dihitung di dashboard, setelah Anda setujui.
      AI menilai setiap wawancara dua kali; keyakinan rendah berarti kedua penilaian tidak sepakat, jadi periksa lebih teliti.
    </p>
    <UiErrorSummary :errors="error ? [{ message: error }] : []" />
    <UiStatus v-if="notice" tone="success" role="status">{{ notice }}</UiStatus>

    <UiTabs id="b7-antrean" v-model="tabModel" :tabs="tabs" label="Antrean review" />
    <div :id="`b7-antrean-panel-${tab}`" role="tabpanel" :aria-labelledby="`b7-antrean-tab-${tab}`">
      <p v-if="!items.length" class="el-muted" data-testid="review-empty">
        {{ tab === 'draft' ? 'Tidak ada temuan yang menunggu review.' : 'Belum ada temuan yang direview.' }}
      </p>

      <ul class="b7-queue" data-testid="review-queue">
        <UiCard v-for="f in items" :key="f.id" as="li" :data-testid="`review-item-${f.id}`">
          <div class="b7-row">
            <b>{{ f.userName ?? 'Karyawan' }}</b>
            <UiChip>{{ CATEGORY_LABEL[f.category] }}</UiChip>
            <UiChip :tone="TONE[confidenceLabel(f.confidence).tone]">{{ confidenceLabel(f.confidence).text }}</UiChip>
            <span v-if="f.scoringAgreement === false" class="b7-small">Dua penilaian AI berbeda</span>
            <span v-if="f.reviewStatus !== 'draft'" class="el-muted b7-small b7-end">
              {{ REVIEW_STATUS_LABEL[f.reviewStatus] }}<template v-if="f.reviewedByName"> oleh {{ f.reviewedByName }}</template>
              <template v-if="f.reviewedAt"> · {{ new Date(f.reviewedAt).toLocaleString('id-ID') }}</template>
            </span>
          </div>
          <div class="b7-gap-s">{{ f.title }}</div>
          <div v-if="f.detail" class="el-muted b7-gap-xs">{{ f.detail }}</div>
          <div class="el-muted b7-small b7-gap-xs">{{ f.competencyName ?? 'Kompetensi belum terpetakan' }}<template v-if="target(f)"> · {{ target(f) }}</template></div>
          <div v-if="f.originalTitle" class="el-muted b7-small b7-gap-xs">Versi AI: {{ f.originalTitle }}</div>
          <div v-if="f.reviewNote" class="el-muted b7-small b7-gap-xs">Catatan: {{ f.reviewNote }}</div>

          <template v-if="f.reviewStatus === 'draft'">
            <div v-if="form.id !== f.id" class="b7-row b7-gap-m">
              <UiButton variant="outlined" size="sm" :disabled="busy" @click="openForm(f, 'edit')">Ubah</UiButton>
              <UiButton variant="outlined" size="sm" :disabled="busy" @click="openForm(f, 'reject')">Tolak</UiButton>
              <UiButton size="sm" :disabled="busy" @click="decide(f, 'approve')">Setujui</UiButton>
            </div>
            <form v-else-if="form.mode === 'edit'" class="b7-form" @submit.prevent="decide(f, 'edit')">
              <UiField :id="`b7-judul-${f.id}`" v-slot="{ attrs }" label="Judul"><input v-bind="attrs" v-model="form.title" required maxlength="255" class="el-input" /></UiField>
              <UiField :id="`b7-rincian-${f.id}`" v-slot="{ attrs }" label="Rincian"><textarea v-bind="attrs" v-model="form.detail" rows="3" class="el-input" /></UiField>
              <UiField :id="`b7-kategori-${f.id}`" v-slot="{ attrs }" label="Kategori">
                <select v-bind="attrs" v-model="form.category" class="el-input">
                  <option value="training">Training</option>
                  <option value="non_training">Non-training</option>
                </select>
              </UiField>
              <UiField :id="`b7-catatan-${f.id}`" v-slot="{ attrs }" label="Catatan (opsional)"><input v-bind="attrs" v-model="form.note" class="el-input" /></UiField>
              <div class="b7-row">
                <UiButton type="submit" size="sm" :disabled="busy">Simpan dan setujui</UiButton>
                <UiButton variant="text" size="sm" @click="closeForm">Batal</UiButton>
              </div>
            </form>
            <form v-else class="b7-form" @submit.prevent="decide(f, 'reject')">
              <UiField :id="`b7-alasan-${f.id}`" v-slot="{ attrs }" label="Alasan penolakan"><input v-bind="attrs" v-model="form.note" required class="el-input" /></UiField>
              <div class="b7-row">
                <UiButton type="submit" size="sm" :disabled="busy">Tolak temuan</UiButton>
                <UiButton variant="text" size="sm" @click="closeForm">Batal</UiButton>
              </div>
            </form>
          </template>
        </UiCard>
      </ul>
    </div>
  </AppShell>
</template>
