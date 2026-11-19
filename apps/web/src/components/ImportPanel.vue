<script setup lang="ts">
// R3-3: impor data dari file XLSX/CSV. HR unduh template, unggah file, petakan kolom, periksa, lalu simpan.
import { computed, onMounted, ref, watch } from 'vue'
import { imports, type ImportBatch, type ImportKind, type ImportPreview, type Mapping, type Submodule } from '@/api/imports'

// plans: pilihan untuk opsi bertipe lim_plan (B15); bila hanya satu, langsung terpilih
const props = defineProps<{ submodule: Submodule; projects?: { id: string; name: string }[]; plans?: { id: string; name: string }[] }>()
const emit = defineEmits<{ imported: [kind: string] }>()

const kinds = ref<ImportKind[]>([])
const kindKey = ref('')
const batch = ref<ImportBatch | null>(null)
const mapping = ref<Mapping>({})
const options = ref<Record<string, string>>({})
const preview = ref<ImportPreview | null>(null)
const history = ref<ImportBatch[]>([])
const error = ref('')
const notice = ref('')
const busy = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const kind = computed(() => kinds.value.find((k) => k.key === kindKey.value) ?? null)
const labelOf = (key: string) => kinds.value.find((k) => k.key === key)?.label ?? key

async function loadHistory() {
  history.value = (await imports.history(props.submodule)).data.slice(0, 5)
}
onMounted(async () => {
  try {
    kinds.value = (await imports.templates(props.submodule)).data
    kindKey.value = kinds.value[0]?.key ?? ''
    await loadHistory()
  } catch (e) { error.value = (e as Error).message }
})

function presetOptions(): Record<string, string> {
  const only = props.plans?.length === 1 ? props.plans[0]!.id : ''
  return Object.fromEntries((kind.value?.options ?? []).filter((o) => o.type === 'lim_plan' && only).map((o) => [o.key, only]))
}
function reset() {
  batch.value = null; preview.value = null; mapping.value = {}; options.value = presetOptions()
  if (fileInput.value) fileInput.value.value = ''
}
watch(kindKey, () => { reset(); notice.value = ''; error.value = '' })

async function run(fn: () => Promise<void>) {
  error.value = ''; busy.value = true
  try { await fn() } catch (e) { error.value = (e as Error).message } finally { busy.value = false }
}

const download = (format: 'xlsx' | 'csv') => run(() => imports.downloadTemplate(props.submodule, kindKey.value, format))

const onFile = (ev: Event) => run(async () => {
  const file = (ev.target as HTMLInputElement).files?.[0]
  if (!file) return
  notice.value = ''; preview.value = null
  batch.value = (await imports.upload(props.submodule, kindKey.value, file)).data
  mapping.value = { ...batch.value.mapping }
})

// Mengubah pemetaan/isian membatalkan pratinjau lama
watch([mapping, options], () => { preview.value = null }, { deep: true })

const check = () => run(async () => {
  if (!batch.value) return
  preview.value = (await imports.preview(props.submodule, batch.value.id, mapping.value, options.value)).data
})

const save = () => run(async () => {
  if (!batch.value) return
  const saved = (await imports.commit(props.submodule, batch.value.id, mapping.value, options.value)).data
  const r = saved.result
  notice.value = `${r?.imported ?? 0} baris disimpan${r?.rejectedCount ? `, ${r.rejectedCount} baris dilewati` : ''}.`
  emit('imported', kindKey.value)
  reset()
  await loadHistory()
})

const invite = () => run(async () => {
  const r = (await imports.invitePending()).data
  notice.value = r.sent ? `Undangan masuk dikirim ke ${r.sent} karyawan.` : 'Semua karyawan sudah pernah masuk; tidak ada undangan baru.'
})

const fmt = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const when = (s: string | null) => (s ? new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '')
</script>

<template>
  <section class="space-y-3 rounded-lg border bg-white p-4 text-sm" data-testid="import-panel">
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 class="font-medium">Impor data dari Excel/CSV</h2>
        <p class="text-xs text-slate-500">Unduh template, isi atau pakai file sendiri, lalu petakan kolomnya sebelum disimpan.</p>
      </div>
      <label class="block">Jenis data
        <select v-model="kindKey" class="mt-1 rounded border px-2 py-1">
          <option v-for="k in kinds" :key="k.key" :value="k.key">{{ k.label }}</option>
        </select>
      </label>
    </div>
    <p v-if="error" role="alert" class="text-red-600">{{ error }}</p>
    <p v-if="notice" role="status" class="text-emerald-700">{{ notice }}</p>

    <div v-if="kind" class="rounded bg-slate-50 p-3">
      <p>{{ kind.description }}</p>
      <div class="mt-2 flex flex-wrap items-center gap-3">
        <span class="text-xs text-slate-500">Template:</span>
        <button type="button" class="text-blue-700" :disabled="busy" @click="download('xlsx')">Unduh XLSX</button>
        <button type="button" class="text-blue-700" :disabled="busy" @click="download('csv')">Unduh CSV</button>
      </div>
      <label class="mt-2 block">File (.xlsx atau .csv)
        <input ref="fileInput" type="file" accept=".xlsx,.csv" class="mt-1 block" :disabled="busy" @change="onFile" />
      </label>
    </div>

    <div v-if="batch && kind" data-testid="import-mapping">
      <p class="text-xs text-slate-500">{{ batch.filename }} · {{ batch.rowCount }} baris. Pilih kolom file untuk tiap isian; yang bertanda * wajib.</p>
      <table class="mt-2 w-full">
        <thead class="text-left text-xs text-slate-500"><tr><th class="py-1">Isian ELGOS</th><th class="py-1">Kolom di file</th></tr></thead>
        <tbody>
          <tr v-for="f in kind.fields" :key="f.key" class="border-t">
            <td class="py-1 pr-2">
              <label :for="`map-${f.key}`">{{ f.header }}{{ f.required ? ' *' : '' }}</label>
              <span v-if="f.oneOf" class="ml-1 text-xs text-slate-400">(salah satu)</span>
              <div v-if="f.help" class="text-xs text-slate-400">{{ f.help }}</div>
            </td>
            <td class="py-1">
              <select :id="`map-${f.key}`" v-model="mapping[f.key]" class="w-full rounded border px-2 py-1">
                <option :value="null">— tidak dipakai —</option>
                <option v-for="h in batch.headers" :key="h" :value="h">{{ h }}</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="kind.options.length" class="mt-3 grid gap-2 sm:grid-cols-2">
        <label v-for="o in kind.options" :key="o.key" class="block">{{ o.label }}{{ o.required ? ' *' : '' }}
          <select v-if="o.type === 'project'" v-model="options[o.key]" class="mt-1 w-full rounded border px-2 py-1">
            <option value="">Tanpa proyek</option>
            <option v-for="p in props.projects ?? []" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <select v-else-if="o.type === 'lim_plan'" v-model="options[o.key]" class="mt-1 w-full rounded border px-2 py-1">
            <option value="">Pilih rencana</option>
            <option v-for="p in props.plans ?? []" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <input v-else v-model="options[o.key]" :type="o.type === 'date' ? 'date' : 'text'" class="mt-1 w-full rounded border px-2 py-1" />
        </label>
      </div>

      <div class="mt-3 flex gap-2">
        <button type="button" class="rounded border px-3 py-1.5" :disabled="busy" @click="check">Periksa</button>
        <button v-if="preview && preview.valid" type="button" class="rounded bg-slate-900 px-3 py-1.5 text-white" :disabled="busy" @click="save">
          Simpan {{ preview.valid }} baris
        </button>
      </div>

      <div v-if="preview" class="mt-3" data-testid="import-preview">
        <p>{{ preview.valid }} baris valid<span v-if="preview.rejectedCount">, {{ preview.rejectedCount }} baris akan dilewati</span>.</p>
        <ul v-if="preview.rejected.length" class="mt-1 max-h-40 overflow-y-auto text-xs text-amber-800">
          <li v-for="r in preview.rejected" :key="r.row">Baris {{ r.row }}: {{ r.reason }}</li>
        </ul>
        <div v-if="preview.sample.length" class="mt-2 overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-slate-50 text-left text-slate-500">
              <tr><th class="p-1">Baris</th><th v-for="f in kind.fields.filter((x) => mapping[x.key])" :key="f.key" class="p-1">{{ f.header }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="s in preview.sample.slice(0, 5)" :key="s.row" class="border-t">
                <td class="p-1">{{ s.row }}</td>
                <td v-for="f in kind.fields.filter((x) => mapping[x.key])" :key="f.key" class="p-1">{{ fmt(s.values[f.key]) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="border-t pt-2">
      <button type="button" class="text-blue-700" :disabled="busy" @click="invite">Kirim undangan masuk ke karyawan yang belum pernah masuk</button>
      <p class="text-xs text-slate-500">Karyawan masuk lewat link di email (tanpa password). Link undangan berlaku 7 hari.</p>
    </div>

    <div v-if="history.length" data-testid="import-history">
      <h3 class="text-xs font-medium text-slate-500">Riwayat impor</h3>
      <ul class="mt-1 space-y-0.5 text-xs">
        <li v-for="h in history" :key="h.id">
          {{ when(h.committedAt ?? h.createdAt) }} · {{ labelOf(h.kind) }} · {{ h.filename }} ·
          <template v-if="h.status === 'committed'">{{ h.result?.imported ?? 0 }} disimpan<template v-if="h.result?.rejectedCount">, {{ h.result.rejectedCount }} dilewati</template></template>
          <template v-else>belum disimpan</template>
          <template v-if="h.createdByName"> · {{ h.createdByName }}</template>
        </li>
      </ul>
    </div>
  </section>
</template>
