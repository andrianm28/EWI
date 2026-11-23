<script setup lang="ts">
// Persyaratan kompetensi per sumber (visi dan misi, atau nilai korporasi): KPI kesiapan, tabel gap, dan kelola oleh HR.
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { cca, CLASS_LABEL, fmt, type GroupKey, type Overview, type OverviewGroup, type OverviewRow, type SourceKind } from '@/api/cca'
import { UiButton, UiCard, UiChip, UiDataTable, UiErrorSummary, UiField, UiKpiCard, UiNote, UiProgressBar, type UiColumn } from '@/ui'

const props = defineProps<{ group: GroupKey }>()
const isVm = computed(() => props.group === 'vm')
const KIND_TAG: Record<SourceKind, string> = { vision: 'Visi', mission: 'Misi', value: 'Nilai korporasi' }
const rowWord = computed(() => (isVm.value ? 'persyaratan kompetensi' : 'indikator perilaku'))

const data = ref<Overview | null>(null)
const loading = ref(true)
const errors = ref<{ message: string }[]>([])
const notice = ref('')

async function load() {
  try { data.value = await cca.overview(props.group) } catch (e) { errors.value = [{ message: (e as Error).message }] } finally { loading.value = false }
}
onMounted(load)

// Klik baris (paritas P3, K-P3-4): ?ubah=<id> membuka panel ubah baris itu sampai CC-3 punya layar detail.
const route = useRoute()
const router = useRouter()
const editTo = (r: Record<string, unknown>) => ({ query: { ...route.query, ubah: String(r.id) } })
function openFromQuery() {
  const id = typeof route.query.ubah === 'string' ? route.query.ubah : ''
  const g = id ? data.value?.groups.find((x) => x.rows.some((r) => r.id === id)) : undefined
  if (g && editor.id !== id) {
    edit(g, g.rows.find((r) => r.id === id)!)
    // Triase P5: fokus ke judul panel (tabindex -1) dan gulir ke panel, supaya pembaca layar dan papan ketik tahu panel terbuka
    void nextTick(() => {
      const h = document.getElementById(`cc-editor-judul-${g.id}`)
      h?.scrollIntoView?.({ block: 'nearest' })
      h?.focus({ preventScroll: true })
    })
  }
  else if (id && data.value && !g) dropUbah() // id tidak dikenal (mis. baris sudah dihapus)
}
watch(data, openFromQuery)
watch(() => route.query.ubah, (id, old) => { if (id) openFromQuery(); else if (old && editor.id === old) closeEditor() })

// Triase P5: penjaga klik ganda (PATCH ganda) selama permintaan berjalan
const busy = ref(false)
async function run(fn: () => Promise<void>, done: string) {
  if (busy.value) return
  errors.value = []; notice.value = ''; busy.value = true
  try { await fn(); await load(); notice.value = done } catch (e) { errors.value = [{ message: (e as Error).message }] } finally { busy.value = false }
}
// Tolak butuh konfirmasi di tempat (bukan window.confirm): id baris yang menunggu konfirmasi
const confirmReject = ref('')

const columns = computed<UiColumn[]>(() => [
  { key: 'name', label: isVm.value ? 'Persyaratan kompetensi (turunan)' : 'Indikator perilaku', sortable: true },
  { key: 'targetScore', label: 'Target', sortable: true, mono: true },
  { key: 'actualScore', label: 'Aktual', sortable: true, mono: true },
  { key: 'gap', label: 'Gap', sortable: true },
  { key: 'classification', label: 'Klasifikasi' },
])
// Paritas P5 CC-5: skala mockup (gap 35 = bar penuh), merah bila gap 20 atau lebih
const gapWidth = (r: OverviewRow) => (r.gap === null ? 0 : Math.min(100, (r.gap / 35) * 100))
const gapHot = (r: OverviewRow) => r.gap !== null && r.gap >= 20
// Baris yang sedang diubah, untuk status validasi dan tombol Validasi/Tolak di panel (P5 CC-3)
const editingRow = computed(() => (editor.id ? data.value?.groups.flatMap((g) => g.rows).find((r) => r.id === editor.id) ?? null : null))
const asRow = (r: Record<string, unknown>) => r as unknown as OverviewRow

const kpis = computed(() => {
  const k = data.value?.kpis
  if (!k) return []
  const first = { label: 'Kesiapan karyawan', value: fmt(k.readiness, '%'), note: isVm.value ? 'terhadap visi dan misi' : 'terhadap nilai korporasi' }
  const gap = { label: 'Gap terbesar', value: k.biggestGap ? `−${fmt(k.biggestGap.gap)}` : '-', note: k.biggestGap?.name ?? 'belum ada nilai aktual' }
  const below = { label: 'Di bawah target', value: `${k.belowTarget.count} dari ${k.belowTarget.measured}`, note: rowWord.value }
  if (isVm.value) return [first, gap, below]
  const weakest = { label: 'Nilai dengan gap terbesar', value: k.weakestSource?.title ?? '-', note: k.weakestSource ? `kesiapan ${fmt(k.weakestSource.readiness, '%')}` : 'belum ada nilai aktual' }
  return [first, weakest, below]
})

// --- Kelola: sumber baru, persyaratan baru, ubah persyaratan ---
const kinds = computed<{ key: SourceKind; label: string }[]>(() => (isVm.value ? [{ key: 'vision', label: 'Visi' }, { key: 'mission', label: 'Misi' }] : [{ key: 'value', label: 'Nilai korporasi' }]))
const sourceForm = reactive({ open: false, kind: 'vision' as SourceKind, title: '', text: '', sourceRef: '' })
function openSource() { Object.assign(sourceForm, { open: true, kind: kinds.value[0]!.key, title: '', text: '', sourceRef: '' }) }
const saveSource = () => run(async () => {
  await cca.createSource({ kind: sourceForm.kind, title: sourceForm.title, text: sourceForm.text || null, sourceRef: sourceForm.sourceRef || null })
  sourceForm.open = false
}, 'Sumber ditambahkan.')

const editor = reactive({ sourceId: '', id: '', name: '', definition: '', target: '', actual: '' })
const num = (s: string) => (String(s).trim() === '' ? null : Number(String(s).replace(',', '.')))
function addTo(g: OverviewGroup) { Object.assign(editor, { sourceId: g.id, id: '', name: '', definition: '', target: '80', actual: '' }); dropUbah() }
function edit(g: OverviewGroup, r: OverviewRow) {
  confirmReject.value = ''
  Object.assign(editor, { sourceId: g.id, id: r.id, name: r.name, definition: r.definition ?? '', target: String(r.targetScore), actual: r.actualScore === null ? '' : String(r.actualScore) })
}
function dropUbah() {
  if (route.query.ubah === undefined) return
  const query = { ...route.query }; delete query.ubah; void router.replace({ query })
}
const closeEditor = () => {
  editor.sourceId = ''; editor.id = ''
  dropUbah()
}
const saveRow = () => run(async () => {
  const target = num(editor.target)
  if (target === null || Number.isNaN(target)) throw new Error('Target wajib diisi dengan angka 0-100')
  const body = { name: editor.name, definition: editor.definition || null, targetScore: target, actualScore: num(editor.actual) }
  if (editor.id) await cca.updateRequirement(editor.id, body)
  else await cca.createRequirement(editor.sourceId, body)
  closeEditor()
}, 'Perubahan disimpan.')
const setStatus = (r: OverviewRow, status: 'validated' | 'rejected') =>
  run(async () => { await cca.updateRequirement(r.id, { status }); if (editor.id === r.id) closeEditor() }, status === 'validated' ? `"${r.name}" divalidasi.` : `"${r.name}" ditolak dan tidak lagi dihitung.`)
</script>

<template>
  <div class="cc-stack" :data-testid="`cc-req-${group}`">
    <p v-if="isVm" class="el-muted">Seberapa besar gap kompetensi karyawan terhadap persyaratan yang diturunkan dari visi dan misi perusahaan.</p>
    <slot />
    <UiErrorSummary v-if="errors.length" :errors="errors" />
    <p v-if="notice" role="status" class="el-muted">{{ notice }}</p>

    <p v-if="loading" class="el-muted">Memuat…</p>
    <template v-else-if="data">
      <div v-if="data.groups.length" class="el-grid el-grid-3">
        <UiKpiCard v-for="k in kpis" :key="k.label" :label="k.label" :value="k.value" :note="k.note" />
      </div>

      <UiCard v-if="!isVm && data.groups.length > 1">
        <h3 class="el-h3">Kesiapan per nilai</h3>
        <div v-for="g in data.groups" :key="g.id" class="cc-meter">
          <div class="cc-row"><b>{{ g.title }}</b><span class="el-mono">{{ fmt(g.readiness, '%') }}</span></div>
          <UiProgressBar :value="g.readiness ?? 0" :label="`Kesiapan ${g.title}`" :tone="g.readiness === null ? 'primary' : g.readiness < 80 ? 'critical' : 'success'" />
        </div>
      </UiCard>

      <UiCard v-if="!data.groups.length">
        <h3 class="el-h3">Belum ada {{ isVm ? 'visi atau misi' : 'nilai korporasi' }}</h3>
        <p class="el-muted">Tambahkan {{ isVm ? 'pernyataan visi dan misi' : 'nilai korporasi' }} perusahaan, lalu isi {{ rowWord }} beserta target dan nilai aktualnya.</p>
      </UiCard>

      <UiCard v-for="g in data.groups" :key="g.id" :data-testid="`cc-sumber-${g.kind}`">
        <div class="cc-row" style="align-items: flex-start">
          <div style="flex: 1 1 320px; min-width: 0">
            <UiChip tone="training">{{ KIND_TAG[g.kind] }}</UiChip>
            <h2 class="el-h2" style="margin: 8px 0 4px">{{ g.title }}</h2>
            <div class="el-muted">{{ g.text }}</div>
            <div v-if="g.sourceRef" class="el-muted cc-small">Sumber: {{ g.sourceRef }}</div>
          </div>
          <!-- CC-4: KPI tanpa bingkai, rata kanan (.kpi mockup tanpa .card) -->
          <div class="cc-kpi-plain" data-testid="cc-kesiapan">
            <div class="el-kpi__label">{{ isVm ? 'Kesiapan karyawan' : 'Kesiapan' }}</div>
            <div class="el-kpi__value">{{ fmt(g.readiness, '%') }}</div>
          </div>
        </div>
        <UiDataTable
          :columns="columns" :rows="g.rows" row-key="id" :caption="`${isVm ? 'Persyaratan kompetensi' : 'Indikator perilaku'}: ${g.title}`" caption-hidden
          :empty-text="`Belum ada ${rowWord}.`" style="margin-top: 16px" :row-to="editTo" row-link-key="name"
        >
          <template #cell-name="{ row }"><span class="cc-name">{{ row.name }}</span></template>
          <template #cell-actualScore="{ row }">{{ fmt(asRow(row).actualScore) }}</template>
          <template #cell-gap="{ row }">
            <div v-if="asRow(row).gap !== null" class="cc-gapcell">
              <UiProgressBar :value="gapWidth(asRow(row))" :label="`Gap ${row.name}`" :tone="gapHot(asRow(row)) ? 'critical' : 'primary'" />
              <span class="el-mono cc-gapnum">−{{ fmt(asRow(row).gap) }}</span>
            </div>
            <span v-else class="el-muted">-</span>
          </template>
          <template #cell-classification="{ row }">
            <UiChip :tone="row.classification === 'perlu_ditinjau' ? 'review' : row.classification === 'dalam_batas' ? 'success' : 'neutral'">{{ CLASS_LABEL[asRow(row).classification] }}</UiChip>
          </template>
        </UiDataTable>

        <form v-if="editor.sourceId === g.id" class="cc-form" style="margin-top: 16px" data-testid="cc-editor" @submit.prevent="saveRow">
          <h3 :id="`cc-editor-judul-${g.id}`" class="el-h3 cc-form__wide" tabindex="-1">{{ editor.id ? 'Ubah' : 'Tambah' }} {{ rowWord }}</h3>
          <p v-if="editingRow" class="cc-form__wide cc-row" style="justify-content: flex-start; margin: 0 0 8px">
            <span class="el-muted">Status validasi:</span>
            <UiChip :tone="editingRow.status === 'validated' ? 'success' : 'review'">{{ editingRow.status === 'validated' ? 'Tervalidasi' : 'Menunggu validasi HR' }}</UiChip>
          </p>
          <UiField :id="`req-nama-${g.id}`" v-slot="{ attrs }" label="Nama" class="cc-form__wide"><input v-bind="attrs" v-model="editor.name" class="el-input" required maxlength="255" /></UiField>
          <UiField :id="`req-def-${g.id}`" v-slot="{ attrs }" label="Definisi (opsional)" class="cc-form__wide"><textarea v-bind="attrs" v-model="editor.definition" class="el-input" maxlength="2000" /></UiField>
          <UiField :id="`req-target-${g.id}`" v-slot="{ attrs }" label="Target" hint="Angka 0-100"><input v-bind="attrs" v-model="editor.target" class="el-input" inputmode="decimal" required /></UiField>
          <UiField :id="`req-aktual-${g.id}`" v-slot="{ attrs }" label="Aktual (isian HR)" hint="Kosongkan bila belum diukur"><input v-bind="attrs" v-model="editor.actual" class="el-input" inputmode="decimal" /></UiField>
          <div class="cc-actions cc-form__wide" style="margin-top: 16px">
            <template v-if="editingRow && confirmReject === editingRow.id">
              <span role="alert" class="cc-confirm">Tolak "{{ editingRow.name }}"? Persyaratan yang ditolak tidak lagi dihitung.</span>
              <UiButton :disabled="busy" @click="setStatus(editingRow, 'rejected')">Ya, tolak<span class="el-sr-only"> {{ editingRow.name }}</span></UiButton>
              <UiButton variant="text" @click="confirmReject = ''">Batal tolak</UiButton>
            </template>
            <template v-else>
              <UiButton type="submit" :disabled="busy">Simpan</UiButton>
              <template v-if="editingRow">
                <UiButton v-if="editingRow.status !== 'validated'" variant="tonal" :disabled="busy" @click="setStatus(editingRow, 'validated')">Validasi<span class="el-sr-only"> {{ editingRow.name }}</span></UiButton>
                <UiButton variant="outlined" :disabled="busy" @click="confirmReject = editingRow.id">Tolak<span class="el-sr-only"> {{ editingRow.name }}</span></UiButton>
              </template>
              <UiButton variant="text" @click="closeEditor">Batal</UiButton>
            </template>
          </div>
        </form>
        <div v-else class="cc-actions" style="margin-top: 12px">
          <UiButton variant="tonal" size="sm" @click="addTo(g)">Tambah {{ rowWord }}</UiButton>
        </div>
      </UiCard>

      <UiCard v-if="sourceForm.open" as="form" class="cc-form" @submit.prevent="saveSource">
        <h3 class="el-h3 cc-form__wide">Tambah {{ isVm ? 'visi atau misi' : 'nilai korporasi' }}</h3>
        <UiField v-if="kinds.length > 1" :id="`sumber-jenis-${group}`" v-slot="{ attrs }" label="Jenis">
          <select v-bind="attrs" v-model="sourceForm.kind" class="el-input"><option v-for="k in kinds" :key="k.key" :value="k.key">{{ k.label }}</option></select>
        </UiField>
        <UiField :id="`sumber-judul-${group}`" v-slot="{ attrs }" label="Judul"><input v-bind="attrs" v-model="sourceForm.title" class="el-input" required maxlength="255" /></UiField>
        <UiField :id="`sumber-isi-${group}`" v-slot="{ attrs }" label="Isi pernyataan" class="cc-form__wide"><textarea v-bind="attrs" v-model="sourceForm.text" class="el-input" maxlength="5000" /></UiField>
        <UiField :id="`sumber-ref-${group}`" v-slot="{ attrs }" label="Sumber (opsional)" hint="Mis. alamat halaman profil perusahaan" class="cc-form__wide"><input v-bind="attrs" v-model="sourceForm.sourceRef" class="el-input" maxlength="512" /></UiField>
        <div class="cc-actions cc-form__wide" style="margin-top: 16px">
          <UiButton type="submit">Simpan</UiButton>
          <UiButton variant="text" @click="sourceForm.open = false">Batal</UiButton>
        </div>
      </UiCard>
      <div v-else class="cc-actions">
        <UiButton variant="outlined" size="sm" @click="openSource">Tambah {{ isVm ? 'visi atau misi' : 'nilai korporasi' }}</UiButton>
      </div>

      <UiNote v-if="data.groups.length" tone="warning">
        <template v-if="data.kpis.pendingValidation">{{ data.kpis.pendingValidation }} {{ rowWord }} menunggu validasi HR. </template>
        Nilai aktual adalah isian HR sampai hasil wawancara AI tersedia.
      </UiNote>
    </template>
  </div>
</template>
