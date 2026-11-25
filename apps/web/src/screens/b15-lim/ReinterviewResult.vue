<script setup lang="ts">
// B15 tahap 3: hasil wawancara ulang satu karyawan untuk HR, alur empat langkah mockup Pak Eji (Konfirmasi hasil belajar →
// Benchmark kinerja → Hasil bisnis → Ringkasan). Tanpa transkrip (T-6). Benchmark, keyakinan, dan rekomendasi dihitung
// aturan di API (generatedBy 'rules'), jadi layar menulis "Rekomendasi" dan "Tingkat keyakinan" tanpa kata AI.
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '@/api/client'
import { UiAuditLine, UiButton, UiCard, UiNote, UiProgressBar, UiStatus, UiStepper } from '@/ui'
import { AI_PRODUCT_LABEL } from '@/api/ai'
import { lim, type ReinterviewResults } from './api'
import { APPLICATION, CONFIDENCE, COVERAGE, RETENTION, STRENGTH, score, withUnit } from './labels'

const props = defineProps<{ planId: string; userId: string; name: string }>()
const emit = defineEmits<{ back: []; saved: [] }>()

const STEPS = [{ key: 'chat', label: 'Konfirmasi hasil belajar' }, { key: 'bench', label: 'Benchmark kinerja' }, { key: 'biz', label: 'Hasil bisnis' }, { key: 'sum', label: 'Ringkasan' }]
const step = ref('chat')
const data = ref<ReinterviewResults | null>(null)
const error = ref('')
const latest = computed(() => data.value?.reinterviews[0] ?? null)
const tanggalWaktu = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })

onMounted(async () => {
  try { data.value = (await lim.result(props.planId, props.userId)).data } catch (e) { error.value = e instanceof ApiError ? e.message : 'Hasil wawancara ulang tidak bisa dimuat' }
})
const next = (key: string) => { step.value = key }
// "Simpan hasil" (mockup limFinish): skor sudah tersimpan saat wawancara selesai; HR mencatat tinjauan hasil yang ditampilkan
const saving = ref(false)
async function save() {
  if (!latest.value) return
  saving.value = true; error.value = ''
  try { await lim.review(props.planId, props.userId, latest.value.id); emit('saved') } catch (e) { error.value = e instanceof ApiError ? e.message : 'Hasil tidak bisa disimpan' } finally { saving.value = false }
}
const bars = (b: { post: number | null; reinterview: number | null; performance: number | null }) => [
  { label: 'Post-test', source: 'Learning Delivery', value: b.post },
  { label: 'Wawancara ulang', source: 'Wawancara ulang AI', value: b.reinterview },
  { label: 'Kinerja kerja', source: 'Review atasan', value: b.performance },
]
</script>

<template>
  <section class="lim-flow" aria-label="Hasil wawancara ulang" data-testid="wu-hasil">
    <UiCard tonal><UiStepper :steps="STEPS" :current="step" label="Langkah hasil wawancara ulang" /></UiCard>
    <UiCard class="lim-stack">
      <p class="el-muted lim-small">{{ name }}<template v-if="latest"> · selesai {{ tanggalWaktu(latest.completedAt) }}</template></p>
      <UiNote v-if="error" tone="critical">{{ error }}</UiNote>
      <template v-if="latest">
        <template v-if="step === 'chat'">
          <h2 class="el-h3">Konfirmasi hasil belajar</h2>
          <p class="el-muted lim-small">Skor dan alasan dari wawancara ulang AI. Percakapan hanya bisa dibaca karyawan itu sendiri.</p>
          <div v-for="c in latest.competencies" :key="c.competencyId" class="lim-item" data-testid="wu-skor">
            <div><b>{{ c.name }}</b><div class="el-muted lim-small">{{ c.reason }}</div></div>
            <span class="el-mono lim-big">{{ c.reinterview }}</span>
          </div>
          <div><UiButton @click="next('bench')">Lihat benchmark kinerja</UiButton></div>
        </template>

        <template v-else-if="step === 'bench'">
          <h2 class="el-h3">Benchmark dengan kinerja</h2>
          <div v-for="b in latest.benchmark" :key="b.competencyId" class="lim-stack">
            <h3 class="el-h3 lim-small">{{ b.name }}</h3>
            <div v-for="x in bars(b)" :key="x.label">
              <div class="lim-row"><span class="lim-strong">{{ x.label }} <UiStatus tone="neutral">{{ x.source }}</UiStatus></span><span class="el-mono">{{ score(x.value) }}</span></div>
              <UiProgressBar :value="x.value ?? 0" :label="`${b.name}: ${x.label}`" />
            </div>
            <div class="lim-item"><div>{{ RETENTION[b.retention].title }}<div class="el-muted lim-small">Post-test {{ score(b.post) }} → wawancara ulang {{ score(b.reinterview) }}</div></div>
              <UiStatus :tone="RETENTION[b.retention].tone">{{ RETENTION[b.retention].text }}</UiStatus></div>
            <div class="lim-item"><div>{{ APPLICATION[b.application].title }}<div class="el-muted lim-small">Wawancara ulang {{ score(b.reinterview) }} → kinerja {{ score(b.performance) }}</div></div>
              <UiStatus :tone="APPLICATION[b.application].tone">{{ APPLICATION[b.application].text }}</UiStatus></div>
          </div>
          <div><UiButton @click="next('biz')">Lanjut ke hasil bisnis</UiButton></div>
        </template>

        <template v-else-if="step === 'biz'">
          <h2 class="el-h3">Hubungkan ke hasil bisnis</h2>
          <p class="el-muted lim-small">Indikator tingkat tim, bukan per orang. Yang ditampilkan adalah bukti dan faktor lain, bukan klaim sebab-akibat.</p>
          <p v-if="!data!.indicators.length" class="el-muted">Belum ada indikator tim untuk rencana ini.</p>
          <div v-for="i in data!.indicators" :key="i.id" class="lim-item">
            <div><b>{{ i.name }}</b><div class="el-muted lim-small">{{ withUnit(i.baseline, i.unit) }} → {{ withUnit(i.current, i.unit) }} · {{ i.source ?? 'Sumber belum diisi' }}</div></div>
            <UiStatus :tone="STRENGTH[i.strength].tone">{{ STRENGTH[i.strength].text }}</UiStatus>
          </div>
          <UiNote v-if="data!.factors.length" tone="warning">Faktor lain yang perlu dicek: {{ data!.factors.join('; ') }}</UiNote>
          <div><UiButton @click="next('sum')">Lihat ringkasan</UiButton></div>
        </template>

        <template v-else>
          <h2 class="el-h3">Ringkasan rantai bukti</h2>
          <p class="el-muted lim-small" data-testid="wu-keyakinan">{{ name }} · tingkat keyakinan dari data pengukuran: <b>{{ CONFIDENCE[latest.confidence] }}</b></p>
          <div v-for="e in latest.chain" :key="e.key" class="lim-item">
            <div><b>{{ e.level }} · {{ e.label }}</b><div class="el-muted lim-small">{{ e.finding }}</div></div>
            <UiStatus :tone="COVERAGE[e.coverage].tone">{{ COVERAGE[e.coverage].text }}</UiStatus>
          </div>
          <h3 class="el-h3">Rekomendasi dari data pengukuran</h3>
          <p v-for="(r, i) in latest.recommendations" :key="i" class="lim-factor" data-testid="wu-rekomendasi">{{ r }}</p>
        </template>
      </template>
      <div class="lim-actions">
        <UiButton v-if="latest && step === 'sum'" :disabled="saving" @click="save">Simpan hasil</UiButton>
        <UiButton variant="outlined" @click="emit('back')">Kembali ke antrean</UiButton>
      </div>
      <!-- LIM-8: baris audit mockup (M:1111); API mencatat pembukaan hasil ini lewat audit.readIndividual -->
      <UiAuditLine v-if="latest" :items="[AI_PRODUCT_LABEL, `log audit: ${latest.competencies.length} kompetensi dinilai`, 'dibuka HR tercatat']" />
    </UiCard>
  </section>
</template>
