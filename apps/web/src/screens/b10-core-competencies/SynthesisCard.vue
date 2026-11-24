<script setup lang="ts">
// B10 tahap 2: kartu "Sintesis AI: pimpinan dan karyawan" untuk HR (spek 11.4, D-6, D-7, D-9) dan pratinjau sesi.
// Angka karyawan hanya tampil dari 5 responden, dibulatkan ke kelipatan 5, diperbarui per 5 penyelesaian baru;
// responden ditampilkan sebagai rentang.
// Paritas P5 (AH-6/AH-7): daftar tema mockup; isi nilai aktual dan pratinjau karyawan di bagian lipat (K-P5-3).
import { onMounted, ref } from 'vue'
import { cca, THEME_LABEL, type InterviewQuestion, type Synthesis, type SynthesisRow } from '@/api/cca'
import { EMPTY, formatPercent, UiButton, UiCard, UiChip, UiDataTable, UiErrorSummary, UiProgressBar, type UiColumn } from '@/ui'

const emit = defineEmits<{ loaded: [themes: number] }>()
// AH-4: "Lihat hasil" di tabel penugasan memindah fokus ke judul kartu ini (judul selalu dirender, juga saat memuat)
const heading = ref<HTMLElement | null>(null)
function focusHeading() {
  heading.value?.scrollIntoView({ block: 'start' })
  heading.value?.focus()
}
defineExpose({ focusHeading })
const data = ref<Synthesis | null>(null)
const errors = ref<{ message: string }[]>([])
const notice = ref('')
const busy = ref(false)
const preview = ref<{ tier: 'leader' | 'employee'; questions: InterviewQuestion[] } | null>(null)

async function load() {
  try {
    const res = await cca.synthesis()
    // AH-9: respons tak lengkap (mis. mock tanpa tema) tidak boleh merusak kartu
    if (!res || !Array.isArray(res.themes)) throw new Error('Sintesis belum bisa dimuat. Coba muat ulang halaman.')
    data.value = res
    emit('loaded', res.kpis?.themes ?? res.themes.length)
  } catch (e) { errors.value = [{ message: (e as Error).message }] }
}
onMounted(load)

const SOURCE_LABEL = { vision: 'Visi', mission: 'Misi', value: 'Nilai' } as const
const pct = (n: number | null) => formatPercent(n)
const gapText = (r: SynthesisRow) => (r.gap === null ? EMPTY : `−${Math.abs(r.gap)}`)
const COLUMNS: UiColumn[] = [
  { key: 'name', label: 'Tema' },
  { key: 'respondents', label: 'Responden' },
  { key: 'aksi', label: 'Nilai aktual' },
]
const asRow = (r: Record<string, unknown>) => r as unknown as SynthesisRow

/** Isi nilai aktual satu persyaratan dari sintesis; nilai lama ditampilkan supaya bisa dikembalikan manual (D-9). */
async function apply(row: SynthesisRow) {
  errors.value = []; notice.value = ''; busy.value = true
  try {
    const res = await cca.applySynthesis([row.requirementId])
    await load()
    const prev = res.applied[0]?.previous
    notice.value = prev
      ? `Nilai aktual ${row.name} diisi dari sintesis. Nilai sebelumnya: ${prev.actualScore ?? 'kosong'}${prev.actualSource === 'manual' ? ' (isian manual)' : ''}.`
      : `${row.name} dilewati: ${res.skipped[0]?.reason ?? 'tidak bisa diisi'}.`
  } catch (e) { errors.value = [{ message: (e as Error).message }] } finally { busy.value = false }
}
async function showPreview(tier: 'leader' | 'employee') {
  errors.value = []
  try { preview.value = { tier, questions: (await cca.preview(tier)).questions } } catch (e) { errors.value = [{ message: (e as Error).message }] }
}
</script>

<template>
  <UiCard data-testid="cc-sintesis">
    <h3 ref="heading" class="el-h3" tabindex="-1">Sintesis AI: pimpinan dan karyawan</h3>
    <p class="el-muted cc-synth__sub">Tema dari wawancara pimpinan, dan seberapa jauh jawaban karyawan sejalan. Hasil ini menjadi dasar persyaratan kompetensi pada Corporate Vision &amp; Mission dan Corporate Values.</p>
    <UiErrorSummary v-if="errors.length" :errors="errors" />
    <p v-if="notice" role="status" class="el-muted">{{ notice }}</p>
    <template v-if="data">
      <p v-if="!data.themes.length" class="el-muted">Belum ada persyaratan tervalidasi.</p>
      <ul class="cc-themes">
        <li v-for="t in data.themes" :key="t.requirementId" data-testid="cc-tema">
          <div class="cc-row cc-theme__head">
            <span class="cc-name">{{ t.name }} <UiChip class="cc-theme__src">{{ SOURCE_LABEL[t.sourceKind] }}</UiChip></span>
            <span class="el-mono cc-small">pimpinan sepakat {{ pct(t.leaderAgree) }} · karyawan sejalan {{ pct(t.employeeAligned) }} · gap {{ gapText(t) }}</span>
          </div>
          <UiProgressBar :value="t.employeeAligned ?? 0" :tone="t.gap !== null && t.gap >= 20 ? 'critical' : 'primary'" :label="`Karyawan sejalan: ${t.name}`" />
        </li>
      </ul>
      <div class="cc-actions">
        <UiButton variant="tonal" size="sm" :to="{ name: 'cc' }">Lihat Vision &amp; Mission</UiButton>
        <UiButton variant="tonal" size="sm" :to="{ name: 'cc', query: { tab: 'val' } }">Lihat Corporate Values</UiButton>
        <UiButton variant="outlined" size="sm" @click="showPreview('leader')">Pratinjau sesi pimpinan</UiButton>
      </div>
      <p class="el-muted cc-small" style="margin: 8px 0 0">Angka karyawan hanya tampil bila paling sedikit {{ data.minRespondents }} karyawan menyinggung persyaratan itu, dibulatkan ke kelipatan 5. Angka karyawan diperbarui setiap {{ data.employeeBatch }} penyelesaian baru, jadi wawancara yang baru selesai bisa belum terhitung. Ringkasan karyawan tidak dibuka per orang.</p>

      <div v-if="preview" style="margin-top: 16px">
        <h4 class="el-h3">Pratinjau sesi {{ preview.tier === 'leader' ? 'pimpinan' : 'karyawan' }}</h4>
        <p class="el-muted cc-small">Pertanyaan bawaan dengan sumber organisasi Anda. AI menyesuaikan kalimatnya saat wawancara. Pratinjau tidak disimpan.</p>
        <ol class="cc-list" data-testid="cc-pratinjau">
          <li v-for="q in preview.questions" :key="q.position"><b>{{ THEME_LABEL[q.theme] }}:</b> {{ q.text }}<span v-if="q.options.length" class="el-muted cc-small"> Pilihan: {{ q.options.join(' · ') }}</span></li>
        </ol>
      </div>

      <details class="cc-more" data-testid="cc-sintesis-kelola">
        <summary>Kelola nilai aktual dan pratinjau</summary>
        <UiDataTable :columns="COLUMNS" :rows="data.themes" row-key="requirementId" caption="Isi nilai aktual dari sintesis" caption-hidden empty-text="Belum ada persyaratan tervalidasi." style="margin-top: 12px">
          <template #cell-name="{ row }"><span class="cc-name">{{ row.name }}</span><div class="el-muted cc-small">{{ SOURCE_LABEL[asRow(row).sourceKind] }} · {{ row.sourceTitle }}</div></template>
          <template #cell-respondents="{ row }"><span class="cc-small">{{ row.leaderRespondents }} pimpinan · {{ row.employeeRespondents }} karyawan</span></template>
          <template #cell-aksi="{ row }">
            <div class="cc-small">{{ asRow(row).actualScore ?? EMPTY }}<span v-if="row.actualSource === 'synthesis'" class="el-muted"> (sintesis)</span></div>
            <UiButton v-if="asRow(row).employeeAligned !== null" variant="text" size="sm" :disabled="busy" @click="apply(asRow(row))">Isi dari sintesis<span class="el-sr-only"> {{ row.name }}</span></UiButton>
          </template>
        </UiDataTable>
        <div class="cc-actions" style="margin-top: 12px">
          <UiButton variant="outlined" size="sm" @click="showPreview('employee')">Pratinjau sesi karyawan</UiButton>
        </div>
      </details>
    </template>
  </UiCard>
</template>
