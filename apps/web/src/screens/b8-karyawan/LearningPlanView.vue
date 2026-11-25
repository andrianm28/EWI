<script setup lang="ts">
// "Rencana belajar" tampilan karyawan (mockup MODUL 2, liCards). Spek: docs/designs/b8-karyawan.md "Layar web".
// Data dari GET /api/my/learning-plan: hanya rencana milik sendiri yang sudah disetujui HR (new, in_progress, completed).
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { COURSE_STATUS_LABEL, lna, type LearningCard, type LearningDelivery } from '@/api/lna'
import { leaveIfDisabled } from './gate'
import { UiButton, UiCard, UiChip, UiErrorSummary, UiIcon, UiNote } from '@/ui'
import { launchLabel, modeTone, planStatusLabel } from './view'
import './b8.css'

const NEEDS_MODULE_LABEL = 'Modul sedang disiapkan'
const router = useRouter()
const cards = ref<LearningCard[] | null>(null)
const delivery = ref<LearningDelivery | null>(null)
const error = ref('')
const loading = ref(true)

async function load() {
  loading.value = true; error.value = ''
  try {
    const r = await lna.myLearningPlan()
    cards.value = r.data
    delivery.value = r.delivery
  } catch (e) {
    if (await leaveIfDisabled(e, router)) return
    error.value = e instanceof ApiError ? e.message : 'Rencana belajar tidak bisa dimuat'
  } finally { loading.value = false }
}
onMounted(load)

// EM-LTI: luncurkan modul EliteMentor (LTI 1.3). Tab yang sama: API memberi URL login tool, lalu tool kembali ke ELGOS.
const launching = ref<string | null>(null)
const launchError = ref('')
async function launch(c: LearningCard) {
  if (!c.lti || launching.value) return
  launching.value = c.id; launchError.value = ''
  try {
    const r = await lna.launchElitementor(c.lti.linkId)
    window.location.assign(r.data.url)
  } catch (e) {
    launchError.value = e instanceof ApiError ? e.message : 'EliteMentor tidak bisa dibuka. Coba lagi.'
    launching.value = null
  }
}
</script>

<template>
  <AppShell>
    <h1 class="el-h1">Rencana belajar</h1>
    <p v-if="delivery" class="el-muted b8-sub">
      Modul dan course untuk Anda berdasarkan gap kompetensi dan hasil wawancara.
      <template v-if="delivery.target === 'elitementor'">Pilih salah satu, EliteMentor langsung membantu Anda belajar.</template>
      <template v-else>Pelatihan dipelajari di {{ delivery.label }}.</template>
    </p>
    <p v-if="loading && !cards" class="el-muted" role="status">Memuat rencana belajar…</p>
    <template v-if="error">
      <UiErrorSummary :errors="[{ message: error }]" />
      <UiButton variant="outlined" size="sm" :disabled="loading" @click="load">Coba lagi</UiButton>
    </template>
    <!-- role="alert" diumumkan pembaca layar saat disisipkan; tanpa galat tidak ada alert di halaman (uji demo-alur) -->
    <div v-if="launchError" role="alert"><UiNote tone="critical" class="b8-gap">{{ launchError }}</UiNote></div>
    <p v-if="cards && !cards.length" class="el-muted">Belum ada rencana belajar. Modul akan muncul di sini setelah HR menyetujui hasil wawancara Anda.</p>
    <div v-if="cards?.length" class="b8-grid">
      <UiCard v-for="c in cards" :key="c.id" :data-testid="`li-card-${c.id}`" class="b8-card">
        <div class="b8-row">
          <UiChip v-if="c.level" tone="training">{{ c.level }}</UiChip>
          <UiChip v-if="c.mode" :tone="modeTone(c.mode)">{{ c.mode }}</UiChip>
          <UiChip :tone="c.status === 'completed' ? 'success' : 'neutral'">{{ planStatusLabel(c) }}</UiChip>
          <UiChip v-if="c.courseStatus === 'failed'" tone="critical">{{ COURSE_STATUS_LABEL.failed }}</UiChip>
          <UiChip v-if="c.needsModule && c.title !== NEEDS_MODULE_LABEL" tone="review">{{ NEEDS_MODULE_LABEL }}</UiChip>
        </div>
        <h2>{{ c.title }}</h2>
        <p v-if="c.description" class="el-muted">{{ c.description }}</p>
        <p v-if="c.reason && c.reason !== c.title" class="b8-small">Alasan: {{ c.reason }}</p>
        <p class="el-muted b8-small">{{ c.where.label }}</p>
        <div class="b8-row b8-between">
          <span v-if="c.code" class="b8-mono">{{ c.code }}</span><span v-else />
          <UiButton v-if="c.lti" size="sm" icon="smart_toy" :disabled="launching !== null" :aria-busy="launching === c.id ? 'true' : undefined"
            :data-testid="`li-lti-${c.id}`" @click="launch(c)">{{ launching === c.id ? 'Membuka EliteMentor…' : c.lti.label }}</UiButton>
          <template v-else-if="!c.needsModule">
            <a v-if="c.launchUrl" :href="c.launchUrl" target="_blank" rel="noopener noreferrer" class="el-btn el-btn--filled el-btn--sm">
              <UiIcon v-if="c.where.target === 'elitementor'" name="smart_toy" :size="18" />{{ launchLabel(c) }}<span class="el-sr-only"> (tab baru)</span>
            </a>
            <span v-else class="el-muted b8-small">Tautan belum tersedia</span>
          </template>
        </div>
      </UiCard>
    </div>
    <!-- LI-4: catatan EliteMentor di bawah grid -->
    <UiNote v-if="cards?.length && delivery?.target === 'elitementor'" class="b8-gap">Pelatihan online dipelajari bersama EliteMentor. Untuk pelatihan offline, ujian dikerjakan di EliteMentor saat Anda berada di lokasi; skor langsung masuk ke ELGOS.</UiNote>
  </AppShell>
</template>
