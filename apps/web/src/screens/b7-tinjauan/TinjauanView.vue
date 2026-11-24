<script setup lang="ts">
// Tinjauan temuan AI per gap (mockup Pak Eji, layar `review`). HR mengklasifikasi temuan AI satu gap lalu menjalankan
// solusinya. Spek: docs/designs/paritas-mockup/b7-tinjauan-web.md; kontrak API: docs/designs/b7-tinjauan-hr.md.
// Tanpa transkrip dan tanpa rincian temuan (PO-6 A); hanya HR (spek B7, RV-3 menunggu keputusan).
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { lna, TIER_LABEL, type ReviewClassification, type ReviewGapQuery, type ReviewItem, type ReviewSolutions } from '@/api/lna'
import { UiBreadcrumb, UiButton, UiCard, UiChip, UiErrorSummary, UiNote, UiSegmented } from '@/ui'
import { gapRefFromQuery } from '@/screens/b5-tna/api'
import { CLASSIFICATION_LABEL } from '@/screens/b5-tna/labels'
import './b7.css'

const route = useRoute()
const gapRef = computed(() => gapRefFromQuery(route.query))
const gapQuery = computed<ReviewGapQuery | null>(() => gapRef.value)
const backTab = computed(() => (typeof route.query.tab === 'string' ? route.query.tab : gapRef.value?.kind === 'okr' ? 'okr' : 'kompetensi'))

const items = ref<ReviewItem[]>([])
const gapLabel = ref('')
const solutions = ref<ReviewSolutions | null>(null)
const errors = ref<{ message: string }[]>([])
/** Temuan yang klasifikasinya sedang disimpan; temuan lain tetap bisa diklasifikasi bersamaan. */
const pendingIds = ref(new Set<string>())
const busy = ref(false)
const loading = ref(false)
const handedCount = ref<number | null>(null)

const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback)

// P9 CD-12: pindah gap (watch fullPath) saat respons gap sebelumnya belum tiba; respons lama dibuang (pola listSeq LibraryView)
let loadSeq = 0
/** Muat ulang temuan dan solusi gap ini. Temuan yang ditolak tidak diklasifikasi lagi (menolak dan riwayatnya di antrean lama). */
async function refresh(query: ReviewGapQuery, seq = loadSeq) {
  const [q, s] = await Promise.all([lna.reviewQueue('all', query), lna.reviewSolutions(query)])
  if (seq !== loadSeq) return
  items.value = q.data.filter((f) => f.reviewStatus !== 'rejected')
  gapLabel.value = q.gap?.label ?? ''
  solutions.value = s.data
}
async function load() {
  const seq = ++loadSeq
  if (!gapQuery.value) { errors.value = [{ message: 'Alamat gap tidak lengkap. Buka tinjauan dari detail gap Training Needs.' }]; return }
  loading.value = true
  try { await refresh(gapQuery.value, seq) } catch (e) {
    if (seq === loadSeq) errors.value = [{ message: message(e, 'Tinjauan temuan tidak bisa dimuat') }]
  } finally { if (seq === loadSeq) loading.value = false }
}
/** Tulis sudah berhasil, hanya muat ulang yang gagal: jangan laporkan sebagai gagal menyimpan. */
const savedButStale = (what: string) => ({ message: `${what}, tetapi data tidak bisa dimuat ulang.` })
onMounted(load)
watch(() => route.fullPath, () => { errors.value = []; handedCount.value = null; load() })

// --- Klasifikasi tiga tombol (mockup `rev`) ---
const KEY_OF_CATEGORY = { training: 'training', non_training: 'improvement' } as const
const LABEL: Record<ReviewClassification, string> = {
  training: CLASSIFICATION_LABEL.training, improvement: CLASSIFICATION_LABEL.non_training, needs_review: CLASSIFICATION_LABEL.review,
}
const decided = (f: ReviewItem) => f.reviewStatus === 'approved' || f.reviewStatus === 'edited'
/** Pilihan tersimpan di server; '' = draf yang belum diputus HR. */
const current = (f: ReviewItem): string => (decided(f) ? KEY_OF_CATEGORY[f.category] : f.held ? 'needs_review' : '')
/**
 * Keputusan user 24 Nov "Ikuti mockup penuh" (mockup `rev`: `decided[i] || f.type`): draf yang belum diputus tampil
 * dengan saran AI terpilih. Saran itu belum tersimpan; klik HR pada pilihan itu atau pada tombol solusi menyimpannya.
 */
const preselected = (f: ReviewItem): string => (f.reviewStatus === 'draft' && !f.held ? f.suggestedClassification : '')
const shown = (f: ReviewItem): string => current(f) || preselected(f)
/** Temuan draf yang saran AI-nya `key` dan belum dikonfirmasi HR (dihitung kartu solusi seperti mockup). */
const unconfirmed = (key: ReviewClassification) => items.value.filter((f) => !current(f) && preselected(f) === key)
/**
 * Simpan saran AI `key` yang belum dikonfirmasi (klik tombol solusi = konfirmasi HR). Return galat per temuan dan
 * `ok` = data setelahnya berhasil dimuat ulang. 409 (diputus di tempat lain) memuat ulang temuan juga, supaya nilai
 * server yang tampil, bukan saran lama.
 */
async function confirmSuggestions(key: ReviewClassification) {
  const failed: { message: string }[] = []
  let saved = 0
  let conflict = false
  for (const f of unconfirmed(key)) {
    try {
      const out = (await lna.classifyFinding(f.id, key)).data
      items.value = items.value.map((x) => (x.id === f.id ? out : x))
      saved += 1
    } catch (e) {
      failed.push({ message: `${f.title}: ${message(e, 'klasifikasi gagal disimpan')}` })
      if (e instanceof ApiError && e.status === 409) conflict = true
    }
  }
  if (!saved && !conflict) return { failed, ok: true }
  try {
    if (conflict) await refresh(gapQuery.value!)
    else solutions.value = (await lna.reviewSolutions(gapQuery.value!)).data
    return { failed, ok: true }
  } catch {
    return { failed: [...failed, saved ? savedButStale('Klasifikasi tersimpan') : { message: 'Tinjauan temuan tidak bisa dimuat ulang' }], ok: false }
  }
}
const SUGGESTION_HINT = 'saran AI, belum dikonfirmasi'
const planned = computed(() => new Set((solutions.value?.training ?? []).filter((t) => t.planItem).map((t) => t.findingId)))
/** Sudah ditindaklanjuti (rencana atau serah ke Improvement Needs): API menolak klasifikasi ulang (409 ALREADY_ACTIONED). */
const actioned = (f: ReviewItem) => !!f.handedOffAt || planned.value.has(f.id)
const optionsFor = (f: ReviewItem) => (['training', 'improvement', 'needs_review'] as const).map((key) => ({
  key, label: LABEL[key],
  // tampilan sama dengan mockup; pembaca layar diberi tahu bahwa pilihan ini saran AI yang belum tersimpan
  hint: !current(f) && preselected(f) === key ? SUGGESTION_HINT : undefined,
  disabled: actioned(f) || (key === 'needs_review' && decided(f)),
  // sedang menyimpan atau solusi sedang dijalankan: aria-disabled supaya fokus tidak hilang dari tombol yang diklik
  pending: busy.value || pendingIds.value.has(f.id),
}))
function setPending(id: string, on: boolean) {
  const next = new Set(pendingIds.value)
  if (on) next.add(id); else next.delete(id)
  pendingIds.value = next
}
/** Tombol solusi menunggu: solusi berjalan, atau pilihan HR sedang disimpan (konfirmasi saran tidak boleh menimpanya). */
const solutionBlocked = computed(() => busy.value || pendingIds.value.size > 0)
const pct = (c: number | null) => (c === null ? '' : ` · AI ${Math.round(c * 100)}%`)

async function classify(f: ReviewItem, key: string) {
  if (key === current(f) || busy.value || pendingIds.value.has(f.id)) return
  errors.value = []; setPending(f.id, true)
  let saved = false
  try {
    const out = (await lna.classifyFinding(f.id, key as ReviewClassification)).data
    items.value = items.value.map((x) => (x.id === f.id ? out : x))
    saved = true
    solutions.value = (await lna.reviewSolutions(gapQuery.value!)).data
  } catch (e) {
    if (saved) { errors.value = [savedButStale('Klasifikasi tersimpan')]; return }
    errors.value = [{ message: message(e, 'Klasifikasi gagal disimpan') }]
    // 409: temuan sudah diputus atau ditindaklanjuti di tempat lain; tampilkan nilai dari server
    if (e instanceof ApiError && e.status === 409) {
      try { await refresh(gapQuery.value!) } catch { errors.value.push({ message: 'Tinjauan temuan tidak bisa dimuat ulang' }) }
    }
  } finally { setPending(f.id, false) }
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
const pendingTraining = computed(() => unconfirmed('training').length)
const hasTraining = computed(() => training.value.length > 0 || pendingTraining.value > 0)
const allSent = computed(() => !pendingTraining.value && training.value.length > 0 && training.value.every((t) => t.planItem?.assignmentStatus === 'sent'))
const allPlanned = computed(() => !pendingTraining.value && training.value.length > 0 && training.value.every((t) => t.planItem))

async function runTraining() {
  if (!delivery.value || solutionBlocked.value) return
  errors.value = []; busy.value = true
  const confirmed = await confirmSuggestions('training')
  const failed: { message: string }[] = [...confirmed.failed]
  // muat ulang gagal: solusi tidak dijalankan dengan data lama
  if (!confirmed.ok) { errors.value = failed; busy.value = false; return }
  let wrote = false
  for (const t of training.value) {
    try {
      const planId = t.planItem?.id ?? (await lna.planFinding(t.findingId)).data.id
      if (!t.planItem) wrote = true
      if (delivery.value.assignAvailable && t.planItem?.assignmentStatus !== 'sent') { await lna.assignPlanItem(planId); wrote = true }
    } catch (e) { failed.push({ message: `${t.title}: ${message(e, 'gagal diproses')}` }) }
  }
  errors.value = failed
  try {
    solutions.value = (await lna.reviewSolutions(gapQuery.value!)).data
  } catch (e) {
    errors.value.push(wrote ? savedButStale('Rencana tersimpan') : { message: message(e, 'Solusi tidak bisa dimuat ulang') })
  }
  busy.value = false
}
async function downloadCsv() {
  errors.value = []
  try { await lna.downloadGapCsv(gapQuery.value ?? undefined) } catch (e) { errors.value = [{ message: message(e, 'Daftar gap tidak bisa diunduh') }] }
}

// --- Tindakan perbaikan (mockup `makeIna`): temuan diteruskan ke modul Improvement Needs (B9); teks sukses persis mockup (review 24 Nov) ---
const improvement = computed(() => solutions.value?.improvement ?? [])
const pendingImprovement = computed(() => unconfirmed('improvement').length)
const hasImprovement = computed(() => improvement.value.length > 0 || pendingImprovement.value > 0)
const pendingHandoff = computed(() => improvement.value.filter((i) => !i.handedOffAt))
// Catatan hanya bila semua temuan perbaikan sudah diteruskan (temuan yang baru diklasifikasi memunculkan tombol lagi)
const handedNote = computed(() => {
  if (!improvement.value.length || pendingImprovement.value || pendingHandoff.value.length) return null
  return handedCount.value ?? improvement.value.length
})
async function handoff() {
  if (solutionBlocked.value) return
  errors.value = []; busy.value = true
  let saved = false
  let failed: { message: string }[] = []
  try {
    const confirmed = await confirmSuggestions('improvement')
    failed = confirmed.failed
    if (!confirmed.ok) { errors.value = failed; return }
    const ids = pendingHandoff.value.map((i) => i.findingId)
    if (ids.length) {
      const r = (await lna.handoffImprovement(ids)).data
      handedCount.value = r.handedOff.length + r.already.length
      saved = true
      await refresh(gapQuery.value!)
    }
    errors.value = failed
  } catch (e) {
    errors.value = [...failed, saved ? savedButStale('Temuan diteruskan ke Improvement Needs dan tersimpan') : { message: message(e, 'Temuan tidak bisa diteruskan') }]
  } finally { busy.value = false }
}
</script>

<template>
  <AppShell>
    <UiBreadcrumb :items="[{ label: 'Training Needs', to: { name: 'tna', query: { tab: backTab } } }, { label: 'Tinjauan HR' }]" />
    <h1 class="el-h1">Tinjauan temuan AI</h1>
    <p class="b7-sub">{{ gapLabel ? `${gapLabel}. ` : '' }}HR memastikan klasifikasi sebelum solusi dijalankan; AI tidak memutuskan sendiri.</p>
    <UiErrorSummary :errors="errors" />
    <p v-if="loading && !solutions" class="el-muted" aria-busy="true">Memuat…</p>

    <div v-if="solutions" class="el-grid el-grid-2 b7-grid" :aria-busy="loading ? 'true' : undefined">
      <UiCard>
        <h3 class="el-h3">Temuan dan klasifikasi</h3>
        <ul class="b7-findings">
          <li v-for="f in items" :key="f.id" class="b7-finding">
            <div class="b7-finding__text">
              {{ f.title }}<span class="el-muted b7-small">{{ pct(f.confidence) }}</span>
            </div>
            <UiSegmented
              :model-value="shown(f)" :options="optionsFor(f)" variant="chips" :label="`Klasifikasi: ${f.title}`"
              @select="classify(f, $event)"
            />
          </li>
        </ul>
        <p v-if="!items.length" class="el-muted">Belum ada temuan AI untuk gap ini.</p>
      </UiCard>

      <div class="b7-col">
        <UiCard>
          <div class="b7-head"><h3 class="el-h3 b7-h3">Solusi pelatihan</h3><UiChip tone="training">Training Needs</UiChip></div>
          <template v-if="hasTraining">
            <!-- hanya saran AI yang belum dikonfirmasi: rekomendasi modul belum dihitung server, blok modul tidak ditampilkan -->
            <div v-if="training.length" class="b7-mod">
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
                <UiButton icon="open_in_new" :disabled="solutionBlocked" @click="runTraining">Tugaskan di EliteMentor</UiButton>
                <div class="el-muted b7-small b7-gap-s">Satu klik. Bila klien tidak memakai EliteMentor, gap diekspor ke LMS klien.</div>
              </template>
            </template>
            <template v-else-if="delivery">
              <template v-if="allPlanned">
                <UiNote tone="success">Rencana dibuat. Unduh daftar gap untuk {{ delivery.label }}.</UiNote>
                <UiButton variant="outlined" icon="download" class="b7-gap-m" @click="downloadCsv">Unduh daftar gap (CSV)</UiButton>
              </template>
              <template v-else>
                <UiButton :disabled="solutionBlocked" @click="runTraining">Buat rencana</UiButton>
                <div class="el-muted b7-small b7-gap-s">Organisasi Anda belajar di {{ delivery.label }}. Buat rencana, lalu unduh daftar gap untuk diunggah ke sana.</div>
              </template>
            </template>
          </template>
          <div v-else class="el-muted b7-gap-s">Belum ada temuan yang diklasifikasi sebagai pelatihan.</div>
        </UiCard>

        <UiCard>
          <div class="b7-head"><h3 class="el-h3 b7-h3">Tindakan perbaikan</h3><UiChip tone="improvement">Improvement Needs</UiChip></div>
          <template v-if="hasImprovement">
            <div class="el-muted b7-explain">Temuan non-pelatihan menjadi tindakan perbaikan (SOP, alat, sistem, atau budaya) dengan pemilik dan tenggat.</div>
            <UiNote v-if="handedNote !== null" tone="success">{{ handedNote }} tindakan perbaikan dibuat dan muncul di Improvement Needs.</UiNote>
            <template v-else-if="solutions.inaEnabled">
              <UiButton :disabled="solutionBlocked" @click="handoff">Buat tindakan di Improvement Needs</UiButton>
            </template>
            <div v-else class="el-muted">Modul Improvement Needs belum aktif untuk organisasi Anda.</div>
          </template>
          <div v-else class="el-muted b7-gap-s">Belum ada temuan non-pelatihan.</div>
        </UiCard>
      </div>
    </div>
  </AppShell>
</template>
