<script setup lang="ts">
// B11: alur impor satu berkas untuk layar Admin Tenant (unggah, petakan kolom, periksa, simpan).
// Memakai mesin impor yang sama dengan layar HR lewat /api/tenant-admin/imports/<area>.
import { computed, ref, watch } from 'vue'
import { ApiError } from '@/api/client'
import type { ImportBatch, ImportKind, ImportPreview, Mapping } from '@/api/imports'
import { tenantAdmin, ADMIN_IMPORT_KIND, type ImportArea } from '@/api/tenantAdmin'
import { UiButton, UiErrorSummary, UiNote } from '@/ui'

const props = defineProps<{ area: ImportArea; options: Record<string, string>; disabledReason?: string }>()
const emit = defineEmits<{ imported: [] }>()

const kind = ref<ImportKind | null>(null)
const batch = ref<ImportBatch | null>(null)
const mapping = ref<Mapping>({})
const preview = ref<ImportPreview | null>(null)
const errors = ref<{ message: string }[]>([])
const notice = ref('')
const busy = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const inputId = computed(() => `impor-berkas-${props.area}`)
const fail = (e: unknown) => (e instanceof ApiError ? e.message : 'Terjadi kesalahan. Coba lagi.')

async function run(fn: () => Promise<void>) {
  errors.value = []
  busy.value = true
  try { await fn() } catch (e) { errors.value = [{ message: fail(e) }] } finally { busy.value = false }
}
function reset() {
  batch.value = null
  preview.value = null
  mapping.value = {}
  if (fileInput.value) fileInput.value.value = ''
}
// mengganti jabatan, periode, atau pemetaan membatalkan pratinjau lama
watch([() => props.options, mapping], () => { preview.value = null }, { deep: true })

const onFile = (ev: Event) => run(async () => {
  const file = (ev.target as HTMLInputElement).files?.[0]
  if (!file) return
  notice.value = ''
  preview.value = null
  if (!kind.value) kind.value = (await tenantAdmin.importKinds(props.area)).data.find((k) => k.key === ADMIN_IMPORT_KIND[props.area]) ?? null
  batch.value = (await tenantAdmin.upload(props.area, file)).data
  mapping.value = { ...batch.value.mapping }
})
const check = () => run(async () => { preview.value = (await tenantAdmin.preview(props.area, batch.value!.id, mapping.value, props.options)).data })
const save = () => run(async () => {
  const saved = (await tenantAdmin.commit(props.area, batch.value!.id, mapping.value, props.options)).data
  const r = saved.result
  notice.value = `${r?.imported ?? 0} baris disimpan dari ${saved.filename}${r?.rejectedCount ? `, ${r.rejectedCount} baris dilewati` : ''}.`
  reset()
  emit('imported')
})
</script>

<template>
  <div class="imp">
    <UiErrorSummary :errors="errors" />
    <p v-if="notice" class="imp__notice" role="status">{{ notice }}</p>
    <UiNote v-if="disabledReason" tone="warning">{{ disabledReason }}</UiNote>
    <template v-else>
      <label class="el-label" :for="inputId">Berkas (.xlsx atau .csv)</label>
      <input :id="inputId" ref="fileInput" type="file" accept=".xlsx,.csv" :disabled="busy" @change="onFile" />
      <div v-if="batch && kind" class="imp__gap" :data-testid="`impor-pemetaan-${area}`">
        <p class="el-muted">{{ batch.filename }} · {{ batch.rowCount }} baris. Cocokkan kolom berkas dengan isian ELGOS; yang bertanda * wajib.</p>
        <div class="imp__map">
          <template v-for="f in kind.fields" :key="f.key">
            <label :for="`map-${area}-${f.key}`">{{ f.header }}{{ f.required ? ' *' : '' }}</label>
            <select :id="`map-${area}-${f.key}`" v-model="mapping[f.key]" class="el-input">
              <option :value="null">Tidak dipakai</option>
              <option v-for="h in batch.headers" :key="h" :value="h">{{ h }}</option>
            </select>
          </template>
        </div>
        <div class="imp__row imp__gap">
          <UiButton variant="tonal" size="sm" :disabled="busy" @click="check">Periksa</UiButton>
          <UiButton v-if="preview && preview.valid" size="sm" :disabled="busy" @click="save">Simpan {{ preview.valid }} baris</UiButton>
          <UiButton variant="text" size="sm" :disabled="busy" @click="reset">Batal</UiButton>
        </div>
        <div v-if="preview" class="imp__gap" :data-testid="`impor-pratinjau-${area}`">
          <p>{{ preview.valid }} baris valid<span v-if="preview.rejectedCount">, {{ preview.rejectedCount }} baris akan dilewati</span>.</p>
          <ul v-if="preview.rejected.length" class="imp__rejected">
            <li v-for="r in preview.rejected" :key="r.row">Baris {{ r.row }}: {{ r.reason }}</li>
          </ul>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.imp { margin-top: 12px; }
.imp__gap { margin-top: 12px; }
.imp__row { display: flex; gap: 8px; flex-wrap: wrap; }
.imp__notice { color: var(--el-success); font-weight: 500; margin: 0 0 8px; }
.imp__map { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px 12px; align-items: center; margin-top: 8px; }
.imp__map .el-input { height: 40px; }
.imp__rejected { margin: 4px 0 0; padding-left: 20px; max-height: 160px; overflow-y: auto; color: var(--el-warning); }
</style>
