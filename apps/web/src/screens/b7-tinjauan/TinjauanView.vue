<script setup lang="ts">
// Tinjauan temuan AI per gap (mockup Pak Eji, layar `review`). HR mengklasifikasi temuan AI satu gap lalu menjalankan
// solusinya. Spek: docs/designs/paritas-mockup/b7-tinjauan-web.md; kontrak API: docs/designs/b7-tinjauan-hr.md.
// Tanpa transkrip dan tanpa rincian temuan (PO-6 A); hanya HR (spek B7, RV-3 menunggu keputusan).
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { lna, TIER_LABEL, type ReviewClassification, type ReviewItem, type ReviewSolutions } from '@/api/lna'
import { UiButton, UiCard, UiChip, UiErrorSummary, UiNote, UiSegmented } from '@/ui'
import { gapRefFromQuery } from '@/screens/b5-tna/api'
import { CLASSIFICATION_LABEL } from '@/screens/b5-tna/labels'
import './b7.css'

const route = useRoute()
const gapRef = computed(() => gapRefFromQuery(route.query))
const gapQuery = computed(() => (gapRef.value ? (gapRef.value as unknown as Record<string, string>) : null))
const backTab = computed(() => (typeof route.query.tab === 'string' ? route.query.tab : gapRef.value?.kind === 'okr' ? 'okr' : 'kompetensi'))

const items = ref<ReviewItem[]>([])
const gapLabel = ref('')
const solutions = ref<ReviewSolutions | null>(null)
const errors = ref<{ message: string }[]>([])
const savingId = ref('')
const busy = ref(false)
const handedCount = ref<number | null>(null)

const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback)

/** Muat ulang temuan dan solusi gap ini. Temuan yang ditolak tidak diklasifikasi lagi (menolak dan riwayatnya di antrean lama). */
async function refresh(query: Record<string, string>) {
  const [q, s] = await Promise.all([lna.reviewQueue('all', query), lna.reviewSolutions(query)])
  items.value = q.data.filter((f) => f.reviewStatus !== 'rejected')
  gapLabel.value = q.gap?.label ?? ''
  solutions.value = s.data
}
async function load() {
  if (!gapQuery.value) { errors.value = [{ message: 'Alamat gap tidak lengkap. Buka tinjauan dari detail gap Training Needs.' }]; return }
  try { await refresh(gapQuery.value) } catch (e) { errors.value = [{ message: message(e, 'Tinjauan temuan tidak bisa dimuat') }] }
}
onMounted(load)
watch(() => route.fullPath, () => { errors.value = []; handedCount.value = null; load() })

// --- Klasifikasi tiga tombol (mockup `rev`) ---
const KEY_OF_CATEGORY = { training: 'training', non_training: 'improvement' } as const
const LABEL: Record<ReviewClassification, string> = {
  training: CLASSIFICATION_LABEL.training, improvement: CLASSIFICATION_LABEL.non_training, needs_review: CLASSIFICATION_LABEL.review,
}
const decided = (f: ReviewItem) => f.reviewStatus === 'approved' || f.reviewStatus === 'edited'
/** Pilihan tersimpan; '' = draf yang belum diputus (saran AI tidak dipilihkan, keputusan 4 spek tahap). */
const current = (f: ReviewItem): string => (decided(f) ? KEY_OF_CATEGORY[f.category] : f.held ? 'needs_review' : '')
const planned = computed(() => new Set((solutions.value?.training ?? []).filter((t) => t.planItem).map((t) => t.findingId)))
/** Sudah ditindaklanjuti (rencana atau serah ke Improvement Needs): API menolak klasifikasi ulang (409 ALREADY_ACTIONED). */
const actioned = (f: ReviewItem) => !!f.handedOffAt || planned.value.has(f.id)
const optionsFor = (f: ReviewItem) => (['training', 'improvement', 'needs_review'] as const).map((key) => ({
  key, label: LABEL[key],
  disabled: savingId.value === f.id || actioned(f) || (key === 'needs_review' && decided(f)),
}))
const pct = (c: number | null) => (c === null ? '' : `· AI ${Math.round(c * 100)}%`)

async function classify(f: ReviewItem, key: string) {
  if (key === current(f)) return
  errors.value = []; savingId.value = f.id
  try {
    const out = (await lna.classifyFinding(f.id, key as ReviewClassification)).data
    items.value = items.value.map((x) => (x.id === f.id ? out : x))
    solutions.value = (await lna.reviewSolutions(gapQuery.value!)).data
  } catch (e) {
    errors.value = [{ message: message(e, 'Klasifikasi gagal disimpan') }]
  } finally { savingId.value = '' }
}

// --- Solusi pelatihan (mockup `modRec`, `sendEM`) ---
const training = computed(() => solutions.value?.training ?? [])
const delivery = computed(() => solutions.value?.delivery ?? null)
const module_ = computed(() => {
  const withCourse = training.value.find((t) => t.planItem?.catalogItemRef)
  if (withCourse?.planItem) return { code: withCourse.planItem.catalogItemRef!, name: withCourse.planItem.catalogItemTitle ?? '', tier: null, competency: withCourse.competencyName }
  const rec = training.value.find((t) => t.recommendation)
  if (rec?.recommendation) return { code: rec.recommendation.ref, name: rec.recommendation.title, tier: rec.recommendation.programTier, competency: rec.competencyName }
  return null
})
const moduleMeta = computed(() => {
  const m = module_.value
  if (!m) return ''
  return [m.tier ? `Level ${TIER_LABEL[m.tier] ?? m.tier}` : '', m.competency ?? ''].filter(Boolean).join(' · ')
})
const allSent = computed(() => training.value.length > 0 && training.value.every((t) => t.planItem?.assignmentStatus === 'sent'))
const allPlanned = computed(() => training.value.length > 0 && training.value.every((t) => t.planItem))

async function runTraining() {
  if (!delivery.value) return
  errors.value = []; busy.value = true
  const failed: { message: string }[] = []
  for (const t of training.value) {
    try {
      const planId = t.planItem?.id ?? (await lna.planFinding(t.findingId)).data.id
      if (delivery.value.assignAvailable && t.planItem?.assignmentStatus !== 'sent') await lna.assignPlanItem(planId)
    } catch (e) { failed.push({ message: `${t.title}: ${message(e, 'gagal diproses')}` }) }
  }
  errors.value = failed
  try { solutions.value = (await lna.reviewSolutions(gapQuery.value!)).data } catch (e) { errors.value.push({ message: message(e, 'Solusi tidak bisa dimuat ulang') }) }
  busy.value = false
}
async function downloadCsv() {
  errors.value = []
  try { await lna.downloadGapCsv() } catch (e) { errors.value = [{ message: message(e, 'Daftar gap tidak bisa diunduh') }] }
}

// --- Tindakan perbaikan (mockup `makeIna`): temuan diteruskan, tindakannya dibuat modul Improvement Needs (B9) ---
const improvement = computed(() => solutions.value?.improvement ?? [])
const pendingHandoff = computed(() => improvement.value.filter((i) => !i.handedOffAt))
const handedNote = computed(() => {
  if (handedCount.value !== null) return handedCount.value
  return improvement.value.length && !pendingHandoff.value.length ? improvement.value.length : null
})
async function handoff() {
  errors.value = []; busy.value = true
  try {
    const r = (await lna.handoffImprovement(pendingHandoff.value.map((i) => i.findingId))).data
    handedCount.value = r.handedOff.length + r.already.length
    await refresh(gapQuery.value!)
  } catch (e) { errors.value = [{ message: message(e, 'Temuan tidak bisa diteruskan') }] } finally { busy.value = false }
}
</script>

<template>
  <AppShell>
    <nav class="el-muted b7-bc" aria-label="Lokasi"><RouterLink :to="{ name: 'tna', query: { tab: backTab } }" class="b7-link">Training Needs</RouterLink> <span aria-hidden="true">›</span> Tinjauan HR</nav>
    <h1 class="el-h1">Tinjauan temuan AI</h1>
    <p class="b7-sub">{{ gapLabel ? `${gapLabel}. ` : '' }}HR memastikan klasifikasi sebelum solusi dijalankan; AI tidak memutuskan sendiri.</p>
    <UiErrorSummary :errors="errors" />

    <div v-if="solutions" class="el-grid el-grid-2 b7-grid">
      <UiCard>
        <h3 class="el-h3">Temuan dan klasifikasi</h3>
        <ul class="b7-findings">
          <li v-for="f in items" :key="f.id" class="b7-finding">
            <div class="b7-finding__text">
              {{ f.title }} <span class="el-muted b7-small">{{ pct(f.confidence) }}<template v-if="f.userName"> · {{ f.userName }}</template><template v-if="!current(f)"> · saran AI: {{ LABEL[f.suggestedClassification] }}</template></span>
            </div>
            <UiSegmented
              :model-value="current(f)" :options="optionsFor(f)" variant="chips" :label="`Klasifikasi: ${f.title}`"
              @update:model-value="classify(f, $event)"
            />
          </li>
        </ul>
        <p v-if="!items.length" class="el-muted">Belum ada temuan AI untuk gap ini.</p>
        <p class="b7-small b7-gap-m"><RouterLink :to="{ name: 'tna-review' }" class="b7-link">Ubah teks atau tolak temuan di antrean tinjauan</RouterLink></p>
      </UiCard>

      <div class="b7-col">
        <UiCard>
          <div class="b7-head"><h3 class="el-h3 b7-h3">Solusi pelatihan</h3><UiChip tone="training">Training Needs</UiChip></div>
          <template v-if="training.length">
            <div class="b7-mod">
              <template v-if="module_">
                <span class="el-mono b7-mod__code">{{ module_.code }}</span>
                <div class="b7-mod__name">{{ module_.name }}</div>
                <div v-if="moduleMeta" class="el-muted b7-small">{{ moduleMeta }}</div>
              </template>
              <div v-else class="el-muted">Belum ada modul yang cocok di katalog. Rencana dibuat sebagai kebutuhan modul baru.</div>
            </div>
            <template v-if="delivery?.assignAvailable">
              <UiNote v-if="allSent" tone="success">Penugasan terkirim ke EliteMentor. Progres akan tersinkron kembali ke ELGOS.</UiNote>
              <template v-else>
                <UiButton icon="open_in_new" :disabled="busy" @click="runTraining">Tugaskan di EliteMentor</UiButton>
                <div class="el-muted b7-small b7-gap-s">Satu klik. Bila klien tidak memakai EliteMentor, gap diekspor ke LMS klien.</div>
              </template>
            </template>
            <template v-else-if="delivery">
              <template v-if="allPlanned">
                <UiNote tone="success">Rencana dibuat. Unduh daftar gap untuk {{ delivery.label }}.</UiNote>
                <UiButton variant="outlined" icon="download" class="b7-gap-m" @click="downloadCsv">Unduh daftar gap (CSV)</UiButton>
              </template>
              <template v-else>
                <UiButton :disabled="busy" @click="runTraining">Buat rencana</UiButton>
                <div class="el-muted b7-small b7-gap-s">Organisasi Anda belajar di {{ delivery.label }}. Buat rencana, lalu unduh daftar gap untuk diunggah ke sana.</div>
              </template>
            </template>
          </template>
          <div v-else class="el-muted b7-gap-s">Belum ada temuan yang diklasifikasi sebagai pelatihan.</div>
        </UiCard>

        <UiCard>
          <div class="b7-head"><h3 class="el-h3 b7-h3">Tindakan perbaikan</h3><UiChip tone="improvement">Improvement Needs</UiChip></div>
          <template v-if="improvement.length">
            <div class="el-muted b7-explain">Temuan non-pelatihan menjadi tindakan perbaikan (SOP, alat, sistem, atau budaya) dengan pemilik dan tenggat.</div>
            <UiNote v-if="handedNote !== null" tone="success">{{ handedNote }} temuan diteruskan ke Improvement Needs.</UiNote>
            <template v-else-if="solutions.inaEnabled">
              <UiButton :disabled="busy" @click="handoff">Buat tindakan di Improvement Needs</UiButton>
            </template>
            <div v-else class="el-muted">Modul Improvement Needs belum aktif untuk organisasi Anda.</div>
          </template>
          <div v-else class="el-muted b7-gap-s">Belum ada temuan non-pelatihan.</div>
        </UiCard>
      </div>
    </div>
  </AppShell>
</template>
