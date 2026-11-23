<script setup lang="ts">
// Pengembangan modul (mockup, layar `lidev`): tujuan → rancangan materi → asesmen → tinjau dan ajukan ke SME.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import './li.css'
import { ApiError } from '@/api/client'
import { UiAuditLine, UiBreadcrumb, UiButton, UiCard, UiChip, UiErrorSummary, UiField, UiIcon, UiNote, UiStepper } from '@/ui'
import { li, type Draft } from './api'
import { DRAFT_LABEL, KIND_LABEL, LEVEL_LABEL } from './labels'

const route = useRoute()
const router = useRouter()
const draft = ref<Draft | null>(null)
const error = ref('')
const notice = ref('')
const busy = ref(false)
const step = ref('tujuan')
const reviewerName = ref('')
const reviewNote = ref('')
const STEPS = [{ key: 'tujuan', label: 'Tujuan pembelajaran' }, { key: 'materi', label: 'Rancangan materi' }, { key: 'asesmen', label: 'Asesmen' }, { key: 'ajukan', label: 'Tinjau dan ajukan' }]
// LI-33: label tombol lanjut menyebut langkah berikutnya (mockup)
const NEXT_LABEL: Record<string, string> = { tujuan: 'Lanjut: rancang materi', materi: 'Lanjut: asesmen', asesmen: 'Lanjut: tinjau dan ajukan' }
// K-P6-5: "Simpan perubahan" ada di menu sekunder, jadi perubahan disimpan otomatis saat pindah langkah dan saat
// meninggalkan layar (tanpa dialog). Bila simpan gagal, langkah/rute tidak berpindah dan galat tampil.
async function go(d: number) {
  if (dirty.value) { await save(AUTO_SAVED); if (error.value) return }
  step.value = STEPS[STEPS.findIndex((s) => s.key === step.value) + d]!.key
}
const AUTO_SAVED = 'Perubahan disimpan otomatis.'
const content = (d: Draft) => JSON.stringify({ objectives: d.objectives, sessions: d.sessions, assessments: d.assessments })
const saved = ref('')
const dirty = computed(() => !!draft.value && editable.value && content(draft.value) !== saved.value)
onBeforeRouteLeave(async () => {
  if (!dirty.value) return true
  await save(AUTO_SAVED)
  return !error.value
})
// menutup tab atau memuat ulang: hanya peringatan bawaan peramban
const onUnload = (e: BeforeUnloadEvent) => { if (dirty.value) e.preventDefault() }
onMounted(() => window.addEventListener('beforeunload', onUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onUnload))

onMounted(async () => {
  try {
    draft.value = (await li.draft(String(route.params.id))).data
    saved.value = content(draft.value)
  } catch (e) { error.value = e instanceof ApiError ? e.message : 'Draf tidak bisa dimuat' }
})

// sama dengan aturan server: tujuan terukur bila memuat angka kriteria
const measurable = (t: string) => /\d/.test(t)
const editable = computed(() => !!draft.value && ['draft', 'returned'].includes(draft.value.status))
const vague = computed(() => (draft.value?.objectives ?? []).filter((o) => !measurable(o.text)).length)
const statusTone = computed(() => (draft.value?.status === 'approved' ? 'success' : draft.value?.status === 'returned' ? 'review' : 'training'))
// LI-32: kalimat mockup saat terpenuhi, kalimat kekurangan saat belum
const checks = computed(() => {
  const d = draft.value
  if (!d) return []
  const n = d.objectives.length - vague.value
  return [
    vague.value === 0
      ? { ok: true, text: `Seluruh tujuan pembelajaran terukur (${n} dari ${d.objectives.length}).` }
      : { ok: false, text: `Belum semua tujuan pembelajaran terukur (${n} dari ${d.objectives.length}).` },
    d.sessions.length ? { ok: true, text: 'Setiap sesi materi terhubung ke tujuan yang jelas.' } : { ok: false, text: 'Belum ada sesi materi.' },
    d.assessments.length ? { ok: true, text: 'Setiap tujuan memiliki instrumen asesmen dan kriteria lulus.' } : { ok: false, text: 'Belum ada instrumen asesmen.' },
  ]
})

async function act(fn: () => Promise<{ data: Draft }>, done: string) {
  busy.value = true; error.value = ''; notice.value = ''
  try {
    draft.value = { ...draft.value!, ...(await fn()).data }
    saved.value = content(draft.value)
    notice.value = done
  } catch (e) { error.value = e instanceof ApiError ? e.message : 'Tindakan gagal' } finally { busy.value = false }
}
const save = (done = 'Perubahan disimpan.') => act(() => li.saveDraft(draft.value!.id, { objectives: draft.value!.objectives, sessions: draft.value!.sessions, assessments: draft.value!.assessments }), done)
const confirmDelete = ref(false)
// N1: cakupan asesmen "n dari m tujuan" (m = tujuan bertipe sama)
function coverage(a: Draft['assessments'][number]) {
  const total = draft.value?.objectives.filter((o) => o.kind === a.kind).length ?? 0
  return total ? `${a.objectives} dari ${total} tujuan tercakup` : `${a.objectives} tujuan tercakup`
}
async function submit() {
  await save()
  if (!error.value) await act(() => li.submitDraft(draft.value!.id), 'Draf diajukan untuk tinjauan SME.')
}
async function remove() {
  busy.value = true; error.value = ''
  try {
    await li.deleteDraft(draft.value!.id)
    saved.value = content(draft.value!) // draf sudah dihapus: jangan simpan otomatis saat keluar
    await router.push({ name: 'req' })
  }
  catch (e) { error.value = e instanceof ApiError ? e.message : 'Draf tidak bisa dihapus' } finally { busy.value = false }
}
const review = (decision: 'approved' | 'returned') => act(
  () => li.reviewDraft(draft.value!.id, { decision, note: reviewNote.value, reviewerName: reviewerName.value }),
  decision === 'approved' ? 'Persetujuan SME dicatat.' : 'Draf dikembalikan untuk diperbaiki.',
)
</script>

<template>
  <AppShell>
    <UiBreadcrumb :items="[{ label: 'Permintaan & pengembangan', to: { name: 'req' } }, { label: 'Pengembangan modul' }]" />
    <UiErrorSummary v-if="error" :errors="[{ message: error }]" />
    <UiNote v-if="notice" tone="success" data-testid="info">{{ notice }}</UiNote>

    <template v-if="draft">
      <p class="li-chips li-chips--tight">
        <UiChip class="el-mono">{{ draft.moduleCode }}</UiChip><UiChip tone="training">{{ LEVEL_LABEL[draft.moduleLevel] }}</UiChip><UiChip>{{ draft.moduleStream ?? 'Tanpa rumpun' }}</UiChip>
        <UiChip :tone="statusTone" data-testid="status-draf">{{ DRAFT_LABEL[draft.status] }}</UiChip>
      </p>
      <h1 class="el-h1">{{ draft.moduleName }}</h1>
      <p class="el-muted">Draf awal disusun dari tujuan pembelajaran di DACUM Tool 1 (job function) dan Tool 2 (KSA) dengan prinsip instructional design. Anda meninjau tiap tahap sebelum lanjut.</p>
      <UiNote v-if="draft.status === 'returned' && draft.reviewNote" tone="warning">Catatan {{ draft.reviewerName ?? 'SME' }}: {{ draft.reviewNote }}</UiNote>

      <!-- LI-27: stepper vertikal + catatan pendekatan di kartu kiri 240px, konten di kanan -->
      <div class="li-dev li-gap">
        <UiCard tonal data-testid="draf-langkah">
          <UiStepper :steps="STEPS" :current="step" label="Tahap pengembangan modul" />
          <p class="el-muted li-dev__note">Pendekatan: backward design (tujuan → asesmen → aktivitas), kata kerja operasional Bloom, dan urutan peristiwa belajar Gagné.</p>
        </UiCard>

        <UiCard data-testid="draf-konten">
          <template v-if="step === 'tujuan'">
            <h2 class="el-h2">Tujuan pembelajaran</h2>
            <UiNote class="li-dev__block"><b>Tujuan umum modul (DACUM):</b> {{ draft.moduleObjective || 'Belum diisi.' }}</UiNote>
            <UiNote :tone="vague ? 'warning' : 'success'" class="li-dev__block">
              <b>{{ draft.objectives.length - vague }} dari {{ draft.objectives.length }} tujuan terukur.</b>
              {{ vague ? 'Setiap tujuan perlu kata kerja operasional, kondisi, dan kriteria ukur berupa angka.' : 'Setiap tujuan KSA memiliki kata kerja operasional, kondisi, dan kriteria ukur.' }}
            </UiNote>
            <div v-for="(o, i) in draft.objectives" :key="i" class="li-obj">
              <p class="li-chips li-small"><UiChip :tone="o.kind === 'K' ? 'training' : o.kind === 'S' ? 'improvement' : 'review'">{{ KIND_LABEL[o.kind] }}</UiChip> Butir KSA: {{ o.item }} · Asesmen: {{ o.assessment }}</p>
              <UiField :id="`tujuan-${i}`" v-slot="{ attrs }" :label="`Tujuan terukur ${i + 1}`" :error="measurable(o.text) ? undefined : 'Tambahkan kriteria ukur berupa angka'">
                <textarea v-bind="attrs" v-model="o.text" class="el-input" rows="2" :readonly="!editable" />
              </UiField>
            </div>
          </template>

          <template v-else-if="step === 'materi'">
            <h2 class="el-h2">Rancangan materi</h2>
            <p class="el-muted">Urutan sesi disusun mundur dari tujuan dan asesmen, sehingga setiap aktivitas melayani tujuan yang terukur.</p>
            <div v-for="(s, i) in draft.sessions" :key="i" class="li-obj">
              <p class="li-row"><b>{{ i + 1 }}. {{ s.title }}</b><UiChip>{{ s.covers }}</UiChip></p>
              <UiField :id="`sesi-${i}`" v-slot="{ attrs }" :label="`Isi sesi ${i + 1}`">
                <textarea v-bind="attrs" v-model="s.detail" class="el-input" rows="2" :readonly="!editable" />
              </UiField>
            </div>
          </template>

          <template v-else-if="step === 'asesmen'">
            <h2 class="el-h2">Asesmen</h2>
            <p class="el-muted">Setiap tujuan memiliki instrumen dan kriteria lulus yang jelas.</p>
            <div v-for="(a, i) in draft.assessments" :key="i" class="li-obj">
              <p class="li-row"><b>{{ a.title }}</b><UiChip tone="success">{{ coverage(a) }}</UiChip></p>
              <UiField :id="`asesmen-${i}`" v-slot="{ attrs }" :label="`Instrumen dan kriteria lulus ${a.title}`">
                <textarea v-bind="attrs" v-model="a.detail" class="el-input" rows="2" :readonly="!editable" />
              </UiField>
            </div>
          </template>

          <template v-else>
            <h2 class="el-h2">Tinjau dan ajukan</h2>
            <ul class="li-checks">
              <li v-for="c in checks" :key="c.text" :class="c.ok ? 'is-ok' : 'is-warn'">
                <UiIcon :name="c.ok ? 'check_circle' : 'warning'" :size="20" /><span>{{ c.text }}</span>
              </li>
            </ul>
            <UiNote v-if="draft.status === 'approved'" tone="success" class="li-gap">Rancangan disetujui {{ draft.reviewerName ?? 'SME' }}. Modul menjadi tersedia setelah course-nya dipasang dan ditautkan di katalog.</UiNote>
            <section v-if="draft.status === 'sme_review'" class="li-gap" aria-label="Catat keputusan SME">
              <h3 class="el-h3">Catat keputusan SME</h3>
              <p class="el-muted li-small">Tinjauan dilakukan SME di luar ELGOS. HR mencatat hasilnya di sini dengan nama peninjau.</p>
              <UiField id="nama-sme" v-slot="{ attrs }" label="Nama SME yang meninjau"><input v-bind="attrs" v-model="reviewerName" class="el-input" type="text"></UiField>
              <UiField id="catatan-sme" v-slot="{ attrs }" label="Catatan" hint="Wajib diisi bila draf dikembalikan"><textarea v-bind="attrs" v-model="reviewNote" class="el-input" rows="2" /></UiField>
              <div class="li-actions">
                <UiButton :disabled="busy || !reviewerName.trim()" @click="review('approved')">Catat: disetujui SME</UiButton>
                <UiButton variant="outlined" :disabled="busy || !reviewerName.trim() || !reviewNote.trim()" @click="review('returned')">Catat: dikembalikan</UiButton>
              </div>
            </section>
          </template>

          <div class="li-actions">
            <UiButton v-if="step !== 'tujuan'" variant="outlined" @click="go(-1)">Kembali</UiButton>
            <UiButton v-if="step !== 'ajukan'" @click="go(1)">{{ NEXT_LABEL[step] }}</UiButton>
            <template v-else>
              <UiButton v-if="editable" :disabled="busy || vague > 0" @click="submit">Kirim ke SME untuk tinjauan</UiButton>
              <UiButton variant="tonal" :to="{ name: 'req' }">Ke daftar permintaan</UiButton>
            </template>
          </div>
          <!-- LI-33: Simpan dan Hapus tidak ada di mockup; dipindah ke menu sekunder supaya tata letak tetap 1:1 -->
          <details v-if="editable" class="li-more">
            <summary>Kelola draf</summary>
            <div class="li-actions">
              <UiButton variant="outlined" size="sm" :disabled="busy || !dirty" @click="save()">Simpan perubahan</UiButton>
              <UiButton v-if="!confirmDelete" variant="text" size="sm" :disabled="busy" @click="confirmDelete = true">Hapus draf</UiButton>
            </div>
            <div v-if="confirmDelete" class="li-row li-confirm" role="group" aria-label="Konfirmasi hapus draf">
              <span>Yakin hapus draf ini? Draf yang dihapus tidak bisa dikembalikan.</span>
              <span class="li-chips">
                <UiButton size="sm" :disabled="busy" @click="remove">Ya, hapus</UiButton>
                <UiButton variant="text" size="sm" :disabled="busy" @click="confirmDelete = false">Batal</UiButton>
              </span>
            </div>
          </details>
          <UiAuditLine class="li-gap" :items="['Draf awal dari templat ELGOS', 'Sumber: DACUM Tool 1 dan Tool 2', 'Perlu persetujuan SME sebelum dipakai']" />
        </UiCard>
      </div>
    </template>
  </AppShell>
</template>

<style>
.li-dev { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 900px) { .li-dev { grid-template-columns: minmax(0, 1fr); } }
.li-dev__note { font-size: 12px; margin: 12px 0 0; }
.li-dev__block { margin-bottom: 12px; }
.li-obj { padding: 12px 0; border-bottom: 1px solid var(--el-outline-variant); }
.li-checks { list-style: none; margin: 0; padding: 0; }
.li-checks li { display: flex; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--el-outline-variant); }
.li-checks .is-ok .el-icon { color: var(--el-success); }
.li-checks .is-warn .el-icon { color: var(--el-warning); }
.li-more { margin-top: 12px; }
.li-confirm { margin-top: 12px; padding: 12px 16px; border-radius: 12px; background: var(--el-critical-container); color: var(--el-on-critical-container); }
.li-more summary { cursor: pointer; color: var(--el-primary); font-weight: 500; font-size: 14px; }
</style>
