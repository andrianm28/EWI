<script setup lang="ts">
// Referensi komponen ELGOS untuk tim desain dan pengembang. Bukan fitur aplikasi (hanya build VITE_UI_KIT=1).
// Semua nilai di halaman ini adalah contoh, bukan data klien.
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { theme, toggleTheme } from '@/shell/theme'
import {
  UiAgentCard, UiAuditLine, UiBreadcrumb, UiButton, UiCard, UiChip, UiDataTable, UiErrorSummary, UiField, UiKpiCard, UiNote, UiProgressBar,
  UiSegmented, UiSkipLink, UiStatus, UiStepper, UiTabs, type UiColumn, type UiSortState,
} from '@/ui'

const route = useRoute()
const picked = computed(() => (typeof route.query.kode === 'string' ? route.query.kode : ''))
const rowTo = (row: Record<string, unknown>) => ({ name: 'ui-kit', query: { kode: String(row.code) } })

const SWATCHES = [
  ['Primary', '--el-primary'], ['Primary container', '--el-primary-container'], ['Secondary container', '--el-secondary-container'],
  ['Tertiary container', '--el-tertiary-container'], ['Surface', '--el-surface'], ['Sukses', '--el-success'],
  ['Peringatan', '--el-warning'], ['Kritis', '--el-critical'],
] as const

const tab = ref('gap')
const TABS = [{ key: 'gap', label: 'Gap kompetensi' }, { key: 'okr', label: 'Gap OKR' }, { key: 'alur', label: 'Alur gap ke solusi' }]

const seg = ref('hr')
const step = ref('chat')
const STEPS = [{ key: 'consent', label: 'Persetujuan' }, { key: 'chat', label: 'Percakapan' }, { key: 'summary', label: 'Ringkasan temuan' }, { key: 'sent', label: 'Terkirim' }]

const COLUMNS: UiColumn[] = [
  { key: 'code', label: 'Kode', sortable: true, mono: true },
  { key: 'name', label: 'Kompetensi', sortable: true },
  { key: 'target', label: 'Target', sortable: true, align: 'right' },
  { key: 'score', label: 'Skor', sortable: true, align: 'right' },
  { key: 'status', label: 'Status' },
]
const ROWS = [
  { code: 'ST-A2', name: 'Root Cause Analysis', target: 80, score: 47, status: 'Belum' },
  { code: 'TC-I1', name: 'Automation & IaC', target: 75, score: 44, status: 'Belum' },
  { code: 'ST-B4', name: 'Ticket Life Cycle', target: 80, score: 9, status: 'Sebagian' },
  { code: 'ST-B1', name: 'Fondasi Layanan', target: 80, score: 82, status: 'Menguasai' },
]
const sort = ref<UiSortState | null>(null)
const filter = ref('')
const empty = ref(false)
const STATUS_TONE: Record<string, 'success' | 'warning' | 'critical'> = { Menguasai: 'success', Sebagian: 'warning', Belum: 'critical' }

const agreed = ref(false)
const errors = ref<{ message: string; fieldId?: string }[]>([])
function submit() {
  errors.value = agreed.value ? [] : [{ message: 'Centang persetujuan sebelum melanjutkan.', fieldId: 'setuju' }]
}
</script>

<template>
  <UiSkipLink target="#isi-kit" />
  <main id="isi-kit" class="kit" tabindex="-1">
    <div class="kit__head">
      <div>
        <h1 class="el-h1">Referensi komponen ELGOS</h1>
        <p class="el-muted">Hanya untuk tim desain dan pengembang. Semua nilai adalah contoh. Acuan: mockup Pak Eji (Material 3, IBM Carbon, GOV.UK).</p>
      </div>
      <UiButton variant="outlined" size="sm" :icon="theme === 'dark' ? 'light_mode' : 'dark_mode'" data-testid="kit-tema" @click="toggleTheme">
        {{ theme === 'dark' ? 'Mode terang' : 'Mode gelap' }}
      </UiButton>
    </div>

    <section aria-labelledby="k-token">
      <h2 id="k-token" class="el-h2">Token warna</h2>
      <div class="kit__swatches">
        <div v-for="[label, token] in SWATCHES" :key="token">
          <i :style="{ background: `var(${token})` }" /><b>{{ label }}</b><span class="el-mono el-muted">{{ token }}</span>
        </div>
      </div>
    </section>

    <section aria-labelledby="k-tombol">
      <h2 id="k-tombol" class="el-h2">Tombol dan chip</h2>
      <UiCard>
        <div class="kit__row">
          <UiButton data-testid="btn-filled">Mulai wawancara</UiButton>
          <UiButton variant="tonal">Tugaskan</UiButton>
          <UiButton variant="outlined" icon="download">Ekspor</UiButton>
          <UiButton variant="text">Batal</UiButton>
          <UiButton size="sm">Buka</UiButton>
          <UiButton disabled>Tidak aktif</UiButton>
        </div>
        <div class="kit__row">
          <UiChip tone="training">Training Needs</UiChip>
          <UiChip tone="improvement">Improvement Needs</UiChip>
          <UiChip tone="review">Perlu ditinjau HR</UiChip>
          <UiChip tone="success">Aktif</UiChip>
          <UiChip tone="critical">Lewat tenggat</UiChip>
          <UiChip>Konsep</UiChip>
        </div>
        <div class="kit__row" data-testid="kit-status">
          <UiStatus tone="success">Menguasai</UiStatus>
          <UiStatus tone="warning">Sebagian</UiStatus>
          <UiStatus tone="critical">Belum</UiStatus>
          <UiStatus tone="info">Dijadwalkan</UiStatus>
          <UiStatus>Belum dinilai</UiStatus>
        </div>
      </UiCard>
    </section>

    <section aria-labelledby="k-kpi">
      <h2 id="k-kpi" class="el-h2">Kartu KPI dan progres</h2>
      <div class="el-grid el-grid-4">
        <UiKpiCard label="Pegawai dianalisis" value="6" note="Engineer Service Delivery" />
        <UiKpiCard label="Gap kompetensi aktif" value="5" note="dan 3 gap OKR" />
        <UiKpiCard label="Kesepakatan AI–HR" value="88%" note="target pilot ≥ 85%" />
        <UiKpiCard label="Waktu analisis" value="11 hari" note="target pilot ≤ 2 minggu" />
      </div>
      <UiCard style="margin-top: 16px">
        <UiProgressBar :value="70" label="Kesiapan modul" />
        <UiProgressBar :value="92" tone="critical" label="Gap terbesar" style="margin-top: 12px" />
        <UiProgressBar :value="40" tone="success" label="Tindakan selesai" style="margin-top: 12px" />
      </UiCard>
    </section>

    <section aria-labelledby="k-tab">
      <h2 id="k-tab" class="el-h2">Tab dan segmented button</h2>
      <UiCard>
        <UiTabs id="kit" v-model="tab" :tabs="TABS" label="Contoh tab" />
        <div :id="`kit-panel-${tab}`" role="tabpanel" :aria-labelledby="`kit-tab-${tab}`" data-testid="kit-panel">Panel: {{ tab }}</div>
        <div class="kit__row"><UiSegmented v-model="seg" :options="[{ key: 'hr', label: 'HR / L&D' }, { key: 'karyawan', label: 'Karyawan (saya)' }]" label="Tampilan" /></div>
      </UiCard>
    </section>

    <section aria-labelledby="k-tabel">
      <h2 id="k-tabel" class="el-h2">Tabel data</h2>
      <UiDataTable
        v-model:sort="sort" :columns="COLUMNS" :rows="empty ? [] : ROWS.filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()))"
        row-key="code" caption="Contoh daftar kompetensi" empty-text="Tidak ada kompetensi yang cocok."
        :row-to="rowTo" row-link-key="name"
      >
        <template #toolbar>
          <label class="el-sr-only" for="kit-cari">Cari kompetensi</label>
          <input id="kit-cari" v-model="filter" class="el-input" style="height: 40px" type="search" placeholder="Cari kompetensi" />
          <UiButton variant="text" size="sm" data-testid="kit-kosong" @click="empty = !empty">{{ empty ? 'Isi tabel' : 'Kosongkan' }}</UiButton>
        </template>
        <template #cell-status="{ row }"><UiStatus :tone="STATUS_TONE[String(row.status)]">{{ row.status }}</UiStatus></template>
      </UiDataTable>
      <p class="el-muted" style="margin: 8px 0 0" data-testid="kit-terpilih">{{ picked ? `Baris dipilih: ${picked}` : 'Klik baris untuk membukanya (prop rowTo).' }}</p>
    </section>

    <section aria-labelledby="k-agen">
      <h2 id="k-agen" class="el-h2">Kartu Agen AI dan breadcrumb</h2>
      <UiBreadcrumb :items="[{ label: 'Training Needs', to: { path: '/' } }, { label: 'Detail gap' }]" />
      <div data-testid="kit-agen">
        <UiAgentCard title="Wawancara akar masalah" action="Contoh wawancara" :to="{ name: 'ui-kit', hash: '#k-agen' }">
          Setiap gap kompetensi diwawancarai AI untuk mencari akar masalah, lalu diklasifikasikan ke Training Needs atau Improvement Needs.
        </UiAgentCard>
      </div>
      <div data-testid="kit-agen-tanpa">
        <UiAgentCard title="Validasi kamus kompetensi" action="Buka wawancara AI" :to="null">
          Tanpa tujuan yang bisa dibuka, kartu tampil tanpa tombol.
        </UiAgentCard>
      </div>
    </section>

    <section aria-labelledby="k-alur">
      <h2 id="k-alur" class="el-h2">Stepper, ringkasan galat, dan log audit</h2>
      <div class="el-grid el-grid-2">
        <UiCard>
          <UiStepper :steps="STEPS" :current="step" label="Alur wawancara" />
          <div class="kit__row">
            <UiButton variant="tonal" size="sm" @click="step = 'summary'">Lanjut</UiButton>
          </div>
        </UiCard>
        <UiCard>
          <form novalidate @submit.prevent="submit">
            <UiErrorSummary :errors="errors" />
            <UiField id="kit-nama" v-slot="{ attrs }" label="Nama panggilan" hint="Dipakai AI untuk menyapa Anda.">
              <input v-bind="attrs" class="el-input" type="text" />
            </UiField>
            <label class="el-check" style="margin-top: 16px">
              <input id="setuju" v-model="agreed" type="checkbox" />
              <span>Saya setuju jawaban saya dianalisis untuk kebutuhan pengembangan.</span>
            </label>
            <div class="kit__row"><UiButton type="submit">Mulai</UiButton></div>
          </form>
          <UiAuditLine :items="['Sesi S-CONTOH', 'persetujuan v1.0', 'dicatat di log audit']" />
        </UiCard>
      </div>
      <UiNote style="margin-top: 16px">Transkrip hanya bisa dibuka oleh karyawan yang bersangkutan.</UiNote>
      <UiNote tone="warning" style="margin-top: 8px">Tenggat tinjauan HR 2 hari kerja.</UiNote>
      <UiNote tone="critical" style="margin-top: 8px">Dua tindakan perbaikan lewat tenggat.</UiNote>
      <UiNote tone="success" style="margin-top: 8px">Ringkasan terkirim ke HR.</UiNote>
    </section>
  </main>
</template>

<style scoped>
.kit { padding: 32px; max-width: 1100px; }
.kit:focus { outline: none; }
.kit section { margin-top: 32px; }
.kit__head { display: flex; gap: 16px; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; }
.kit__row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-top: 16px; }
.kit__row:first-child { margin-top: 0; }
.kit__swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; }
.kit__swatches > div { display: flex; flex-direction: column; gap: 6px; min-width: 0; font-size: 12px; }
.kit__swatches i { display: block; height: 48px; border-radius: 12px; border: 1px solid var(--el-outline-variant); }
</style>
