<script setup lang="ts">
// PK-14: antrean review hasil AI untuk HR (PD-14 ★A, PM-3 ★A, PM-5 ★A).
// Temuan AI berstatus draf: tidak terlihat atasan dan karyawan, dan tidak dihitung di dashboard,
// sampai HR menyetujui, mengubah, atau menolaknya. Transkrip mentah tidak ditampilkan di sini (PO-6 ★A).
import { computed, onMounted, reactive, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { confidenceLabel, lna, REVIEW_STATUS_LABEL, type ReviewCounts, type ReviewItem } from '@/api/lna'

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
const TONE = { ok: 'bg-emerald-50 text-emerald-700', warn: 'bg-amber-50 text-amber-700', low: 'bg-red-50 text-red-700' }
const pending = computed(() => counts.value?.draft ?? 0)
const reviewed = computed(() => (counts.value ? counts.value.approved + counts.value.edited + counts.value.rejected : 0))

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
    <RouterLink to="/m/tna" class="text-sm text-blue-700">← Kembali ke TNA</RouterLink>
    <h1 class="mt-2 text-lg font-semibold">Review hasil AI</h1>
    <p class="mt-1 text-sm text-slate-600">
      Temuan AI baru tampil ke atasan dan karyawan, dan baru dihitung di dashboard, setelah Anda setujui.
      AI menilai setiap wawancara dua kali; keyakinan rendah berarti kedua penilaian tidak sepakat, jadi periksa lebih teliti.
    </p>
    <p v-if="error" role="alert" class="mt-3 text-sm text-red-600">{{ error }}</p>
    <p v-if="notice" role="status" class="mt-3 text-sm text-emerald-700">{{ notice }}</p>

    <div class="mt-4 flex gap-2 text-sm" role="tablist">
      <button role="tab" :aria-selected="tab === 'draft'" :class="tab === 'draft' ? 'bg-slate-900 text-white' : 'bg-white'" class="rounded border px-3 py-1" @click="show('draft')">
        Menunggu review ({{ pending }})
      </button>
      <button role="tab" :aria-selected="tab === 'reviewed'" :class="tab === 'reviewed' ? 'bg-slate-900 text-white' : 'bg-white'" class="rounded border px-3 py-1" @click="show('reviewed')">
        Sudah direview ({{ reviewed }})
      </button>
    </div>

    <p v-if="!items.length" class="mt-4 text-sm text-slate-500" data-testid="review-empty">
      {{ tab === 'draft' ? 'Tidak ada temuan yang menunggu review.' : 'Belum ada temuan yang direview.' }}
    </p>

    <ul class="mt-4 space-y-3" data-testid="review-queue">
      <li v-for="f in items" :key="f.id" class="rounded-lg border bg-white p-4 text-sm" :data-testid="`review-item-${f.id}`">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium">{{ f.userName ?? 'Karyawan' }}</span>
          <span class="rounded bg-slate-100 px-2 py-0.5 text-xs">{{ CATEGORY_LABEL[f.category] }}</span>
          <span class="rounded px-2 py-0.5 text-xs" :class="TONE[confidenceLabel(f.confidence).tone]">{{ confidenceLabel(f.confidence).text }}</span>
          <span v-if="f.scoringAgreement === false" class="text-xs text-amber-700">Dua penilaian AI berbeda</span>
          <span v-if="f.reviewStatus !== 'draft'" class="ml-auto text-xs text-slate-500">
            {{ REVIEW_STATUS_LABEL[f.reviewStatus] }}<template v-if="f.reviewedByName"> oleh {{ f.reviewedByName }}</template>
            <template v-if="f.reviewedAt"> · {{ new Date(f.reviewedAt).toLocaleString('id-ID') }}</template>
          </span>
        </div>
        <div class="mt-2">{{ f.title }}</div>
        <div v-if="f.detail" class="mt-1 text-slate-600">{{ f.detail }}</div>
        <div class="mt-1 text-xs text-slate-500">{{ f.competencyName ?? 'Kompetensi belum terpetakan' }}<template v-if="target(f)"> · {{ target(f) }}</template></div>
        <div v-if="f.originalTitle" class="mt-1 text-xs text-slate-500">Versi AI: {{ f.originalTitle }}</div>
        <div v-if="f.reviewNote" class="mt-1 text-xs text-slate-500">Catatan: {{ f.reviewNote }}</div>

        <template v-if="f.reviewStatus === 'draft'">
          <div v-if="form.id !== f.id" class="mt-3 flex flex-wrap gap-2">
            <button class="rounded border px-3 py-1" :disabled="busy" @click="openForm(f, 'edit')">Ubah</button>
            <button class="rounded border px-3 py-1 text-red-700" :disabled="busy" @click="openForm(f, 'reject')">Tolak</button>
            <button class="rounded bg-slate-900 px-3 py-1 text-white" :disabled="busy" @click="decide(f, 'approve')">Setujui</button>
          </div>
          <form v-else-if="form.mode === 'edit'" class="mt-3 space-y-2" @submit.prevent="decide(f, 'edit')">
            <label class="block">Judul <input v-model="form.title" required maxlength="255" class="mt-1 w-full rounded border px-2 py-1" /></label>
            <label class="block">Rincian <textarea v-model="form.detail" rows="3" class="mt-1 w-full rounded border px-2 py-1" /></label>
            <label class="block">Kategori
              <select v-model="form.category" class="mt-1 w-full rounded border px-2 py-1">
                <option value="training">Training</option>
                <option value="non_training">Non-training</option>
              </select>
            </label>
            <label class="block">Catatan (opsional) <input v-model="form.note" class="mt-1 w-full rounded border px-2 py-1" /></label>
            <div class="flex gap-2">
              <button type="submit" class="rounded bg-slate-900 px-3 py-1 text-white" :disabled="busy">Simpan dan setujui</button>
              <button type="button" class="rounded border px-3 py-1" @click="closeForm">Batal</button>
            </div>
          </form>
          <form v-else class="mt-3 space-y-2" @submit.prevent="decide(f, 'reject')">
            <label class="block">Alasan penolakan <input v-model="form.note" required class="mt-1 w-full rounded border px-2 py-1" /></label>
            <div class="flex gap-2">
              <button type="submit" class="rounded bg-red-700 px-3 py-1 text-white" :disabled="busy">Tolak temuan</button>
              <button type="button" class="rounded border px-3 py-1" @click="closeForm">Batal</button>
            </div>
          </form>
        </template>
      </li>
    </ul>
  </AppShell>
</template>
