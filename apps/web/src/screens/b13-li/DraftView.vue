<script setup lang="ts">
// Pengembangan modul (mockup, layar `lidev`): tujuan → rancangan materi → asesmen → tinjau dan ajukan ke SME.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import './li.css'
import { ApiError } from '@/api/client'
import { UiAuditLine, UiBreadcrumb, UiButton, UiCard, UiErrorSummary, UiField, UiNote, UiStatus, UiStepper } from '@/ui'
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
const go = (d: number) => { step.value = STEPS[STEPS.findIndex((s) => s.key === step.value) + d]!.key }

onMounted(async () => {
  try { draft.value = (await li.draft(String(route.params.id))).data } catch (e) { error.value = e instanceof ApiError ? e.message : 'Draf tidak bisa dimuat' }
})

// sama dengan aturan server: tujuan terukur bila memuat angka kriteria
const measurable = (t: string) => /\d/.test(t)
const editable = computed(() => !!draft.value && ['draft', 'returned'].includes(draft.value.status))
const vague = computed(() => (draft.value?.objectives ?? []).filter((o) => !measurable(o.text)).length)
const checks = computed(() => {
  const d = draft.value
  if (!d) return []
  return [
    { ok: vague.value === 0, text: `${d.objectives.length - vague.value} dari ${d.objectives.length} tujuan terukur` },
    { ok: d.sessions.length > 0, text: `${d.sessions.length} sesi disusun mundur dari tujuan` },
    { ok: d.assessments.length > 0, text: `${d.assessments.length} instrumen asesmen dengan kriteria lulus` },
  ]
})

async function act(fn: () => Promise<{ data: Draft }>, done: string) {
  busy.value = true; error.value = ''; notice.value = ''
  try { draft.value = { ...draft.value!, ...(await fn()).data }; notice.value = done } catch (e) { error.value = e instanceof ApiError ? e.message : 'Tindakan gagal' } finally { busy.value = false }
}
const save = () => act(() => li.saveDraft(draft.value!.id, { objectives: draft.value!.objectives, sessions: draft.value!.sessions, assessments: draft.value!.assessments }), 'Perubahan disimpan.')
async function submit() {
  await save()
  if (!error.value) await act(() => li.submitDraft(draft.value!.id), 'Draf diajukan untuk tinjauan SME.')
}
async function remove() {
  busy.value = true; error.value = ''
  try { await li.deleteDraft(draft.value!.id); await router.push({ name: 'req' }) }
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
      <p class="el-muted"><span class="el-mono">{{ draft.moduleCode }}</span> · {{ LEVEL_LABEL[draft.moduleLevel] }} · {{ draft.moduleStream ?? 'Tanpa rumpun' }}</p>
      <h1 class="el-h1">{{ draft.moduleName }}</h1>
      <p><UiStatus :tone="draft.status === 'approved' ? 'success' : draft.status === 'returned' ? 'warning' : 'info'" data-testid="status-draf">{{ DRAFT_LABEL[draft.status] }}</UiStatus></p>
      <p class="el-muted">Draf awal disusun dari tujuan pembelajaran di DACUM Tool 1 dan Tool 2 dengan prinsip instructional design. Anda meninjau tiap tahap sebelum lanjut.</p>
      <UiNote v-if="draft.status === 'returned' && draft.reviewNote" tone="warning">Catatan {{ draft.reviewerName ?? 'SME' }}: {{ draft.reviewNote }}</UiNote>

      <UiStepper :steps="STEPS" :current="step" label="Tahap pengembangan modul" class="li-gap" />
      <p class="el-muted li-small">Pendekatan: backward design (tujuan → asesmen → aktivitas), kata kerja operasional Bloom, dan urutan peristiwa belajar Gagné.</p>

      <UiCard class="li-gap">
        <template v-if="step === 'tujuan'">
          <h2 class="el-h2">Tujuan pembelajaran</h2>
          <p><b>Tujuan umum modul (DACUM):</b> {{ draft.moduleObjective || 'Belum diisi.' }}</p>
          <UiNote :tone="vague ? 'warning' : 'success'"><b>{{ draft.objectives.length - vague }} dari {{ draft.objectives.length }} tujuan terukur.</b> Setiap tujuan perlu kata kerja operasional, kondisi, dan kriteria ukur berupa angka.</UiNote>
          <div v-for="(o, i) in draft.objectives" :key="i" class="li-obj">
            <p class="li-small"><b>{{ KIND_LABEL[o.kind] }}</b> · Butir KSA: {{ o.item }} · Asesmen: {{ o.assessment }}</p>
            <UiField :id="`tujuan-${i}`" v-slot="{ attrs }" :label="`Tujuan terukur ${i + 1}`" :error="measurable(o.text) ? undefined : 'Tambahkan kriteria ukur berupa angka'">
              <textarea v-bind="attrs" v-model="o.text" class="el-input" rows="2" :readonly="!editable" />
            </UiField>
          </div>
        </template>

        <template v-else-if="step === 'materi'">
          <h2 class="el-h2">Rancangan materi</h2>
          <p class="el-muted">Urutan sesi disusun mundur dari tujuan dan asesmen, sehingga setiap aktivitas melayani tujuan yang terukur.</p>
          <div v-for="(s, i) in draft.sessions" :key="i" class="li-obj">
            <p><b>{{ i + 1 }}. {{ s.title }}</b> <span class="el-muted li-small">{{ s.covers }}</span></p>
            <UiField :id="`sesi-${i}`" v-slot="{ attrs }" :label="`Isi sesi ${i + 1}`">
              <textarea v-bind="attrs" v-model="s.detail" class="el-input" rows="2" :readonly="!editable" />
            </UiField>
          </div>
        </template>

        <template v-else-if="step === 'asesmen'">
          <h2 class="el-h2">Asesmen</h2>
          <p class="el-muted">Setiap tujuan memiliki instrumen dan kriteria lulus yang jelas.</p>
          <div v-for="(a, i) in draft.assessments" :key="i" class="li-obj">
            <p><b>{{ a.title }}</b> <span class="el-muted li-small">{{ a.objectives }} tujuan</span></p>
            <UiField :id="`asesmen-${i}`" v-slot="{ attrs }" :label="`Instrumen dan kriteria lulus ${a.title}`">
              <textarea v-bind="attrs" v-model="a.detail" class="el-input" rows="2" :readonly="!editable" />
            </UiField>
          </div>
        </template>

        <template v-else>
          <h2 class="el-h2">Tinjau dan ajukan</h2>
          <p v-for="c in checks" :key="c.text"><UiStatus :tone="c.ok ? 'success' : 'warning'">{{ c.text }}</UiStatus></p>
          <UiNote v-if="draft.status === 'approved'" tone="success">Rancangan disetujui {{ draft.reviewerName ?? 'SME' }}. Modul menjadi tersedia setelah course-nya dipasang dan ditautkan di katalog.</UiNote>
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
          <UiButton v-if="step !== 'tujuan'" variant="text" @click="go(-1)">Kembali</UiButton>
          <UiButton v-if="editable" variant="outlined" :disabled="busy" @click="save">Simpan perubahan</UiButton>
          <UiButton v-if="step !== 'ajukan'" @click="go(1)">Lanjut</UiButton>
          <UiButton v-else-if="editable" :disabled="busy || vague > 0" @click="submit">Kirim ke SME untuk tinjauan</UiButton>
          <UiButton variant="text" :to="{ name: 'req' }">Ke daftar permintaan</UiButton>
          <UiButton v-if="editable" variant="text" :disabled="busy" @click="remove">Hapus draf</UiButton>
        </div>
        <UiAuditLine class="li-gap" :items="['Draf awal dari templat ELGOS', 'Sumber: DACUM Tool 1 dan Tool 2', 'Perlu persetujuan SME sebelum dipakai']" />
      </UiCard>
    </template>
  </AppShell>
</template>

<style>
.li-obj { padding: 12px 0; border-bottom: 1px solid var(--el-outline-variant); }
</style>
