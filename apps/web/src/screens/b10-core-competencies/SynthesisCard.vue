<script setup lang="ts">
// B10 tahap 2: kartu "Sintesis AI: pimpinan dan karyawan" untuk HR (spek 11.4, D-6, D-7, D-9) dan pratinjau sesi.
// Angka karyawan hanya tampil dari 5 responden, dibulatkan ke kelipatan 5, diperbarui per 5 penyelesaian baru;
// responden ditampilkan sebagai rentang.
import { onMounted, ref } from 'vue'
import { cca, THEME_LABEL, type InterviewQuestion, type Synthesis, type SynthesisRow } from '@/api/cca'
import { UiButton, UiCard, UiChip, UiDataTable, UiErrorSummary, UiKpiCard, UiNote, UiProgressBar, UiSegmented, type UiColumn } from '@/ui'

const data = ref<Synthesis | null>(null)
const errors = ref<{ message: string }[]>([])
const notice = ref('')
const busy = ref(false)
const previewTier = ref<string>('leader')
const preview = ref<InterviewQuestion[] | null>(null)

async function load() {
  try { data.value = await cca.synthesis() } catch (e) { errors.value = [{ message: (e as Error).message }] }
}
onMounted(load)

const SOURCE_LABEL = { vision: 'Visi', mission: 'Misi', value: 'Nilai' } as const
const pct = (n: number | null) => (n === null ? '-' : `${n}%`)
const COLUMNS: UiColumn[] = [
  { key: 'name', label: 'Tema', sortable: true },
  { key: 'leaderAgree', label: 'Pimpinan sepakat', mono: true },
  { key: 'employeeAligned', label: 'Karyawan sejalan', mono: true },
  { key: 'gap', label: 'Gap' },
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
async function showPreview() {
  errors.value = []
  try { preview.value = (await cca.preview(previewTier.value === 'employee' ? 'employee' : 'leader')).questions } catch (e) { errors.value = [{ message: (e as Error).message }] }
}
</script>

<template>
  <UiCard data-testid="cc-sintesis">
    <h3 class="el-h3">Sintesis AI: pimpinan dan karyawan</h3>
    <p class="el-muted">Seberapa sepakat pimpinan dan seberapa sejalan karyawan untuk tiap persyaratan tervalidasi. Gap 20 poin atau lebih ditandai merah.</p>
    <UiErrorSummary v-if="errors.length" :errors="errors" />
    <p v-if="notice" role="status" class="el-muted">{{ notice }}</p>
    <template v-if="data">
      <div class="el-grid el-grid-4" style="margin: 12px 0">
        <UiKpiCard label="Tema tersintesis" :value="String(data.kpis.themes)" note="punya jawaban pimpinan" />
        <UiKpiCard label="Pimpinan selesai" :value="String(data.kpis.leadersCompleted)" note="wawancara terkirim" />
        <UiKpiCard label="Karyawan selesai" :value="String(data.kpis.employeesCompleted)" note="rentang, wawancara terkirim" />
      </div>
      <UiDataTable :columns="COLUMNS" :rows="data.themes" row-key="requirementId" caption="Sintesis per persyaratan" caption-hidden empty-text="Belum ada persyaratan tervalidasi.">
        <template #cell-name="{ row }"><b>{{ row.name }}</b><div class="el-muted cc-small">{{ SOURCE_LABEL[asRow(row).sourceKind] }} · {{ row.sourceTitle }}</div></template>
        <template #cell-leaderAgree="{ row }">{{ pct(asRow(row).leaderAgree) }}<div class="el-muted cc-small">{{ row.leaderRespondents }} pimpinan</div></template>
        <template #cell-employeeAligned="{ row }">{{ pct(asRow(row).employeeAligned) }}<div class="el-muted cc-small">{{ row.employeeRespondents }} karyawan</div></template>
        <template #cell-gap="{ row }">
          <div v-if="asRow(row).gap !== null" class="cc-gapcell">
            <UiProgressBar :value="Math.abs(asRow(row).gap ?? 0)" :tone="asRow(row).hot ? 'critical' : 'primary'" :label="`Gap ${row.name}`" />
            <span>{{ row.gap }}</span>
            <UiChip v-if="row.hot" tone="critical">Gap besar</UiChip>
          </div>
          <span v-else class="el-muted">-</span>
        </template>
        <template #cell-aksi="{ row }">
          <div class="cc-small">{{ asRow(row).actualScore ?? '-' }}<span v-if="row.actualSource === 'synthesis'" class="el-muted"> (sintesis)</span></div>
          <UiButton v-if="asRow(row).employeeAligned !== null" variant="text" size="sm" :disabled="busy" @click="apply(asRow(row))">Isi dari sintesis<span class="el-sr-only"> {{ row.name }}</span></UiButton>
        </template>
      </UiDataTable>
      <UiNote style="margin-top: 12px">Angka karyawan hanya tampil bila paling sedikit {{ data.minRespondents }} karyawan menyinggung persyaratan itu, dibulatkan ke kelipatan 5. Angka karyawan diperbarui setiap {{ data.employeeBatch }} penyelesaian baru, jadi wawancara yang baru selesai bisa belum terhitung. Ringkasan karyawan tidak dibuka per orang.</UiNote>
    </template>

    <h3 class="el-h3" style="margin-top: 24px">Pratinjau sesi</h3>
    <p class="el-muted">Pertanyaan bawaan dengan sumber organisasi Anda. AI menyesuaikan kalimatnya saat wawancara. Pratinjau tidak disimpan.</p>
    <div class="cc-actions">
      <UiSegmented v-model="previewTier" :options="[{ key: 'leader', label: 'Pimpinan' }, { key: 'employee', label: 'Karyawan' }]" label="Tier pratinjau" />
      <UiButton size="sm" variant="outlined" @click="showPreview">Pratinjau sesi {{ previewTier === 'leader' ? 'pimpinan' : 'karyawan' }}</UiButton>
    </div>
    <ol v-if="preview" class="cc-list" data-testid="cc-pratinjau" style="margin-top: 12px">
      <li v-for="q in preview" :key="q.position"><b>{{ THEME_LABEL[q.theme] }}:</b> {{ q.text }}<span v-if="q.options.length" class="el-muted cc-small"> Pilihan: {{ q.options.join(' · ') }}</span></li>
    </ol>
  </UiCard>
</template>
