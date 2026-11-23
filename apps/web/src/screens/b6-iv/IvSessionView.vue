<script setup lang="ts">
// Sesi wawancara akar masalah (mockup layar `iv`): Undangan → Persetujuan → Wawancara → Ringkasan → Selesai.
// Spek: docs/designs/b6-wawancara-akar-masalah.md bagian 4 (aturan A2–A12) dan 15 (kontrak layar).
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { UiAuditLine, UiButton, UiCard, UiChip, UiErrorSummary, UiField, UiNote, UiStatus, UiStepper } from '@/ui'
import { useSessionStore } from '@/stores/session'
import PercakapanWawancara from './PercakapanWawancara.vue'
import PersetujuanTna from './PersetujuanTna.vue'
import { TNA_CONSENT_VERSION } from '@/content/consent'
import { CLASSIFICATION_LABEL } from '../b5-tna/labels'
import { iv, stepOf, type SessionView, type Step, type Summary } from './api'
import './iv.css'
import '../b5-tna/tna.css'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const id = computed(() => route.params.id as string)
const summaryOn = computed(() => session.hasFlag('tna.interview_summary'))

const s = ref<SessionView | null>(null)
const turns = computed(() => s.value?.turns ?? [])
const step = computed<Step | null>(() => (s.value ? stepOf(s.value) : null))
const summary = ref<Summary | null>(null)
const aiDone = ref(false)
const busy = ref(false)
const working = ref('')
const error = ref('')
const noteOpen = ref(false)
const note = ref('')
const noteError = ref('')
const errors = computed(() => [
  ...(noteError.value ? [{ message: noteError.value, fieldId: 'iv-note' }] : []),
  ...(error.value ? [{ message: error.value }] : []),
])

async function load({ keepSummary = false } = {}) {
  const r = (await iv.session(id.value)).data
  s.value = r
  const t = r.turns ?? []
  // Setelah muat ulang: AI selesai bila giliran terakhir milik karyawan atau batas pertanyaan tercapai
  aiDone.value = t.length > 0 && (t[t.length - 1]!.speaker === 'human' || (!!r.questionLimit && t.filter((x) => x.speaker === 'ai').length >= r.questionLimit))
  if (!keepSummary) summary.value = null
  // Ringkasan gagal dimuat tidak boleh mengosongkan layar: langkah sesi tetap tampil bersama galatnya
  if (!summary.value && stepOf(r) === 'summary' && summaryOn.value && r.transcriptVisible !== false) summary.value = (await iv.getSummary(id.value)).data
}
async function run(fn: () => Promise<void>, fallback: string) {
  busy.value = true; error.value = ''
  try { await fn() } catch (e) {
    error.value = e instanceof ApiError ? e.message : fallback
    // Sesi berubah di tempat lain (ringkasan sudah dibuat, diulang, atau ditutup): tampilkan keadaan terbaru
    if (e instanceof ApiError && e.status === 409) await load().catch(() => {})
  } finally { busy.value = false; working.value = '' }
}
onMounted(() => run(load, 'Sesi wawancara tidak bisa dimuat'))
// Pindah dari /iv/a ke /iv/b memakai komponen yang sama: muat sesi baru
watch(id, () => { s.value = null; noteOpen.value = false; note.value = ''; noteError.value = ''; run(load, 'Sesi wawancara tidak bisa dimuat') })

const steps = computed(() => [
  { key: 'undangan', label: 'Undangan' }, { key: 'persetujuan', label: 'Persetujuan' }, { key: 'wawancara', label: 'Wawancara' },
  ...(summaryOn.value || step.value === 'summary' ? [{ key: 'ringkasan', label: 'Ringkasan' }] : []), { key: 'selesai', label: 'Selesai' },
])
const STEP_KEY: Record<Step, string> = { expired: 'undangan', consent: 'persetujuan', chat: 'wawancara', summary: 'ringkasan', done: 'selesai', closed: 'selesai' }

const consent = () => run(async () => {
  const r = (await iv.consent(id.value, s.value?.consentVersionRequired || TNA_CONSENT_VERSION)).data
  if (!s.value) return
  // Pertanyaan pertama datang di respons persetujuan; sesi lanjut ke langkah wawancara tanpa muat ulang
  s.value = { ...s.value, status: 'in_progress', step: s.value.step ? 'chat' : undefined, turns: r.question ? [r.question] : [] }
  aiDone.value = false
}, 'Persetujuan gagal disimpan')

function send(text: string, restore: (t: string) => void) {
  if (!s.value) return
  const list = s.value.turns ?? (s.value.turns = [])
  list.push({ speaker: 'human', text, at: new Date().toISOString() })
  run(async () => {
    let r
    try { r = (await iv.answer(id.value, text)).data } catch (e) {
      // AI gagal: jawaban tidak tersimpan di server, kembalikan ke kotak teks untuk dikirim ulang
      list.pop(); restore(text); throw e
    }
    if (r.question) list.push(r.question)
    aiDone.value = r.done
    if (s.value && typeof s.value.answerCount === 'number') s.value.answerCount += 1
  }, 'Jawaban gagal dikirim')
}
const hasAnswer = computed(() => turns.value.some((t) => t.speaker === 'human'))

const makeSummary = () => run(async () => {
  working.value = 'AI sedang menyusun ringkasan…'
  summary.value = (await iv.makeSummary(id.value)).data
  await load({ keepSummary: true })
}, 'Ringkasan gagal dibuat. Coba lagi.')
const confirm = () => run(async () => { await iv.confirm(id.value, {}); await load() }, 'Ringkasan gagal dikirim')
const confirmWithNote = () => {
  const t = note.value.trim()
  noteError.value = t.length < 10 || t.length > 1000 ? 'Tulis catatan 10-1000 karakter untuk HR' : ''
  if (!noteError.value) return sendNote(t)
}
const sendNote = (t: string) => run(async () => {
  await iv.confirm(id.value, { accurate: false, note: t })
  await load()
}, 'Ringkasan gagal dikirim')
const restart = () => run(async () => { await iv.restart(id.value); noteOpen.value = false; await load() }, 'Wawancara gagal diulang')
const complete = () => run(async () => {
  await iv.complete(id.value)
  await router.push({ name: 'iv' })
}, 'Wawancara gagal dikirim')

const confidence = (c: number | null) => (c === null ? null : Math.round(c * 100))
const restartsLeft = computed(() => s.value?.restartsLeft ?? 0)
const STEP_STATUS: Record<Step, string> = { expired: 'Berakhir', consent: 'Belum mulai', chat: 'Berjalan', summary: 'Menunggu konfirmasi ringkasan', done: 'Selesai', closed: 'Dibatalkan' }
const audit = computed(() => {
  const v = s.value
  if (!v?.sessionCode) return []
  return [v.sessionCode, v.aiLabel ?? 'ELGOS-AI', `log audit: persetujuan tercatat · ${v.answerCount ?? 0} jawaban`]
})
</script>

<template>
  <AppShell>
    <nav class="el-muted tna-bc" aria-label="Lokasi"><RouterLink :to="{ name: 'iv' }" class="tna-link">Wawancara akar masalah</RouterLink> › Sesi</nav>
    <h1 class="tna-h1">Wawancara akar masalah</h1>
    <p v-if="s?.focusLabel" class="el-muted">Topik: {{ s.focusLabel }}</p>
    <UiErrorSummary :errors="errors" />

    <UiCard v-if="s && s.transcriptVisible === false">
      <p data-testid="transcript-private">Percakapan wawancara hanya bisa dibaca karyawan yang bersangkutan.</p>
      <p v-if="step" class="el-muted">Status: {{ STEP_STATUS[step] }}</p>
    </UiCard>

    <div v-else-if="s && step" class="iv-layout">
      <UiCard tonal><UiStepper :steps="steps" :current="STEP_KEY[step]" label="Langkah wawancara" /></UiCard>
      <UiCard>
        <template v-if="step === 'expired'">
          <p>Undangan sudah berakhir. Minta HR memperpanjang undangan Anda.</p>
        </template>

        <PersetujuanTna v-else-if="step === 'consent'" :version="s.consentVersionRequired || TNA_CONSENT_VERSION" :busy="busy" @agree="consent" @later="router.push({ name: 'iv' })" />

        <template v-else-if="step === 'chat'">
          <PercakapanWawancara :turns="turns" :question-limit="s.questionLimit" :can-answer="!aiDone" :busy="busy" @send="send">
            <template #masukan-suara />
          </PercakapanWawancara>
          <div class="iv-actions iv-mt">
            <template v-if="summaryOn">
              <UiButton v-if="hasAnswer" :variant="aiDone ? 'filled' : 'text'" :disabled="busy" @click="makeSummary">Lihat ringkasan temuan</UiButton>
            </template>
            <UiButton v-else-if="hasAnswer" variant="outlined" :disabled="busy" @click="complete">{{ aiDone ? 'Selesai dan kirim' : 'Akhiri wawancara' }}</UiButton>
          </div>
          <UiStatus v-if="working" tone="info" role="status" class="iv-mt">{{ working }}</UiStatus>
        </template>

        <template v-else-if="step === 'summary' && !summaryOn">
          <UiNote tone="warning">Langkah ringkasan sedang dinonaktifkan. Kirim wawancara ke HR tanpa ringkasan.</UiNote>
          <div class="iv-actions iv-mt"><UiButton :disabled="busy" @click="complete">Selesai dan kirim</UiButton></div>
        </template>

        <template v-else-if="step === 'summary'">
          <h2 class="iv-h2">Ringkasan temuan AI</h2>
          <p class="el-muted">Periksa apakah ringkasan ini sesuai dengan yang Anda maksud sebelum dikirim ke HR.</p>
          <p v-if="summary && !summary.findings.length">Tidak ditemukan hambatan yang jelas.</p>
          <ul class="iv-findings">
            <li v-for="(f, i) in summary?.findings ?? []" :key="i" class="iv-finding">
              <div class="iv-finding__title">{{ f.title }}</div>
              <div v-if="f.detail" class="el-muted">{{ f.detail }}</div>
              <div class="iv-actions">
                <UiChip :tone="f.category === 'training' ? 'training' : 'improvement'">{{ CLASSIFICATION_LABEL[f.category] }}</UiChip>
                <UiChip v-if="f.confidence === null || f.confidence < 0.5" tone="review">Perlu ditinjau HR</UiChip>
                <span v-if="confidence(f.confidence) !== null" class="el-muted iv-small">Keyakinan AI sementara: {{ confidence(f.confidence) }}%</span>
              </div>
            </li>
          </ul>
          <div class="iv-actions iv-mt">
            <UiButton :disabled="busy" @click="confirm">Sesuai, kirim ke HR</UiButton>
            <UiButton variant="outlined" :disabled="busy || !restartsLeft" @click="restart">Ulangi wawancara<template v-if="restartsLeft"> ({{ restartsLeft }} kali lagi)</template></UiButton>
            <UiButton v-if="!restartsLeft && !noteOpen" variant="text" @click="noteOpen = true">Kirim dengan catatan</UiButton>
          </div>
          <form v-if="noteOpen" class="iv-note iv-mt" novalidate @submit.prevent="confirmWithNote">
            <UiField id="iv-note" :error="noteError || undefined" label="Catatan untuk HR" hint="Tulis bagian ringkasan yang tidak sesuai, 10-1000 karakter.">
              <template #default="{ attrs }"><textarea v-bind="attrs" v-model="note" rows="3" class="el-input" /></template>
            </UiField>
            <UiButton type="submit" :disabled="busy">Kirim ringkasan dengan catatan</UiButton>
          </form>
        </template>

        <p v-else-if="s.consentWithdrawnAt && (step === 'done' || step === 'closed')">Persetujuan Anda untuk wawancara ini sudah ditarik.</p>
        <template v-else-if="step === 'done'">
          <p v-if="s.summaryState === 'confirmed' || s.summaryState === 'disputed'">Ringkasan sudah dikirim ke HR untuk ditinjau.</p>
          <p v-else>Wawancara ini sudah selesai.</p>
        </template>
        <p v-else>Sesi ini dibatalkan.</p>
        <!-- B8: transkrip read-only setelah sesi selesai/dibatalkan; API hanya mengirim turns ke yang diwawancarai (PO-6 A) -->
        <section v-if="(step === 'done' || step === 'closed') && turns.length" aria-label="Transkrip" class="iv-mt">
          <PercakapanWawancara :turns="turns" :can-answer="false" />
        </section>
      </UiCard>
    </div>
    <UiAuditLine v-if="audit.length" :items="audit" class="iv-mt" />
  </AppShell>
</template>
