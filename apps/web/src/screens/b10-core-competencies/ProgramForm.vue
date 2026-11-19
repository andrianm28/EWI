<script setup lang="ts">
// Konfigurasi program nilai. Daftar (nilai, komponen, status, rekomendasi) diisi satu butir per baris dengan pemisah "|".
import { reactive, ref } from 'vue'
import { cca, type Program, type ProgramConfig, type Recommendation } from '@/api/cca'
import { UiButton, UiCard, UiErrorSummary, UiField, UiNote } from '@/ui'

const props = defineProps<{ program: Program | null }>()
const emit = defineEmits<{ saved: [key: string]; cancel: [] }>()

const p = props.program
const form = reactive({
  key: p?.key ?? '',
  name: p?.name ?? '',
  provider: p?.provider ?? '',
  cutoffDate: p?.cutoffDate ?? '',
  totalActivities: String(p?.config.totalActivities ?? ''),
  passScore: String(p?.config.passScore ?? '70'),
  values: (p?.config.values ?? []).map((v) => v.name).join('\n'),
  components: (p?.config.components ?? []).map((c) => `${c.name} | ${c.weight}`).join('\n'),
  bands: (p?.config.bands ?? []).map((b) => [b.key, b.label, b.min, b.description ?? ''].join(' | ')).join('\n'),
  insight: p?.insight ?? '',
  recommendations: (p?.recommendations ?? []).map((r) => `${r.title} | ${r.detail ?? ''}`).join('\n'),
})
const errors = ref<{ message: string; fieldId?: string }[]>([])
const busy = ref(false)

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)
const cells = (l: string) => l.split('|').map((c) => c.trim())
const n = (s: string | undefined) => Number(String(s ?? '').replace(',', '.'))

function build(): { config: ProgramConfig; recommendations: Recommendation[] } {
  return {
    config: {
      values: lines(form.values).map((name) => ({ name })),
      components: lines(form.components).map((l) => { const [name, weight] = cells(l); return { name: name ?? '', weight: n(weight) } }),
      totalActivities: n(form.totalActivities),
      passScore: n(form.passScore),
      bands: lines(form.bands).map((l) => { const [key, label, min, description] = cells(l); return { key: key ?? '', label: label ?? '', min: n(min), description: description || null } }),
    },
    recommendations: lines(form.recommendations).map((l) => { const [title, ...rest] = cells(l); return { title: title ?? '', detail: rest.join(' | ') || null } }),
  }
}

async function save() {
  errors.value = []
  if (!/^[a-z0-9-]{1,32}$/.test(form.key)) {
    errors.value = [{ message: 'Key program hanya huruf kecil, angka, dan tanda hubung (maksimal 32 karakter).', fieldId: 'prog-key' }]
    return
  }
  busy.value = true
  try {
    const { config, recommendations } = build()
    await cca.saveProgram(form.key, { name: form.name, provider: form.provider || null, cutoffDate: form.cutoffDate || null, config, insight: form.insight || null, recommendations })
    emit('saved', form.key)
  } catch (e) { errors.value = [{ message: (e as Error).message }] } finally { busy.value = false }
}
</script>

<template>
  <UiCard as="form" class="cc-form" data-testid="cc-program-form" @submit.prevent="save">
    <h3 class="el-h3 cc-form__wide">{{ program ? 'Ubah program' : 'Program baru' }}</h3>
    <UiErrorSummary v-if="errors.length" :errors="errors" class="cc-form__wide" />
    <UiNote v-if="program" class="cc-form__wide">Setelah program punya hasil, jumlah nilai, jumlah komponen, dan key status tidak bisa diubah.</UiNote>
    <UiField id="prog-key" v-slot="{ attrs }" label="Key" hint="Huruf kecil, angka, tanda hubung. Mis. dna-5c"><input v-bind="attrs" v-model="form.key" class="el-input el-mono" :readonly="!!program" required /></UiField>
    <UiField id="prog-nama" v-slot="{ attrs }" label="Nama program"><input v-bind="attrs" v-model="form.name" class="el-input" required maxlength="255" /></UiField>
    <UiField id="prog-penyelenggara" v-slot="{ attrs }" label="Penyelenggara (opsional)"><input v-bind="attrs" v-model="form.provider" class="el-input" maxlength="255" /></UiField>
    <UiField id="prog-cutoff" v-slot="{ attrs }" label="Tanggal cut off (opsional)"><input v-bind="attrs" v-model="form.cutoffDate" class="el-input" type="date" /></UiField>
    <UiField id="prog-kegiatan" v-slot="{ attrs }" label="Jumlah kegiatan" hint="Peserta selesai bila semua kegiatan dikerjakan"><input v-bind="attrs" v-model="form.totalActivities" class="el-input" inputmode="numeric" required /></UiField>
    <UiField id="prog-lulus" v-slot="{ attrs }" label="Skor lulus" hint="Angka 0-100"><input v-bind="attrs" v-model="form.passScore" class="el-input" inputmode="decimal" required /></UiField>
    <UiField id="prog-nilai" v-slot="{ attrs }" label="Nilai korporasi" hint="Satu nama nilai per baris, maksimal 8" class="cc-form__wide"><textarea v-bind="attrs" v-model="form.values" class="el-input" required /></UiField>
    <UiField id="prog-komponen" v-slot="{ attrs }" label="Komponen program (opsional)" hint="Satu per baris: Nama | Bobot. Jumlah bobot harus 100." class="cc-form__wide"><textarea v-bind="attrs" v-model="form.components" class="el-input" /></UiField>
    <UiField id="prog-status" v-slot="{ attrs }" label="Status kelulusan" hint="Satu per baris: key | Label | Skor minimum | Keterangan. Mis. strong | Strong Culture Alignment | 85 | Skor akhir 85 atau lebih" class="cc-form__wide"><textarea v-bind="attrs" v-model="form.bands" class="el-input" required /></UiField>
    <UiField id="prog-temuan" v-slot="{ attrs }" label="Temuan (opsional)" class="cc-form__wide"><textarea v-bind="attrs" v-model="form.insight" class="el-input" maxlength="4000" /></UiField>
    <UiField id="prog-rekomendasi" v-slot="{ attrs }" label="Rekomendasi (opsional)" hint="Satu per baris: Judul | Isi" class="cc-form__wide"><textarea v-bind="attrs" v-model="form.recommendations" class="el-input" /></UiField>
    <div class="cc-actions cc-form__wide" style="margin-top: 16px">
      <UiButton type="submit" :disabled="busy">Simpan program</UiButton>
      <UiButton variant="text" @click="emit('cancel')">Batal</UiButton>
    </div>
  </UiCard>
</template>
