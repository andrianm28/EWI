<script setup lang="ts">
// Isian agregat laporan program (jalur kedua keputusan 19 Nov): hanya angka ringkasan, tanpa data per orang.
import { reactive, ref } from 'vue'
import { cca, type ManualReport, type Program } from '@/api/cca'
import { UiButton, UiErrorSummary, UiField, UiNote } from '@/ui'

const props = defineProps<{ program: Program }>()
const emit = defineEmits<{ saved: []; cancel: [] }>()

const cfg = props.program.config
const old = props.program.manualReport
const s = (x: number | null | undefined) => (x === null || x === undefined ? '' : String(x))
const statusKeys = [...cfg.bands.map((b) => ({ key: b.key, label: b.label })), { key: 'not_passed', label: 'Belum lulus' }, { key: 'in_progress', label: 'Masih berjalan' }]

const form = reactive({
  registered: s(old?.registered), completed: s(old?.completed), passed: s(old?.passed), avgValueScore: s(old?.avgValueScore), avgFinal: s(old?.avgFinal),
  statuses: Object.fromEntries(statusKeys.map((k) => [k.key, s(old?.statuses[k.key] ?? 0)])) as Record<string, string>,
  values: cfg.values.map((_, i) => ({ avgCompleted: s(old?.values[i]?.avgCompleted), avgAll: s(old?.values[i]?.avgAll) })),
  components: cfg.components.map((_, i) => ({ done: s(old?.components[i]?.done ?? 0), avg: s(old?.components[i]?.avg) })),
  divisions: (old?.divisions ?? []).map((d) => [d.name, d.participants, d.completed, d.passed, s(d.avgFinal), s(d.avgValueScore)].join(' | ')).join('\n'),
})
const errors = ref<{ message: string }[]>([])
const busy = ref(false)

const int = (x: string) => (String(x).trim() === '' ? 0 : Number(x))
const score = (x: string | undefined) => (String(x ?? '').trim() === '' ? null : Number(String(x).replace(',', '.')))

function build(): ManualReport {
  return {
    registered: int(form.registered), completed: int(form.completed), passed: int(form.passed),
    avgValueScore: score(form.avgValueScore), avgFinal: score(form.avgFinal),
    statuses: Object.fromEntries(statusKeys.map((k) => [k.key, int(form.statuses[k.key] ?? '')])),
    values: form.values.map((v) => ({ avgCompleted: score(v.avgCompleted), avgAll: score(v.avgAll) })),
    components: form.components.map((c) => ({ done: int(c.done), avg: score(c.avg) })),
    divisions: form.divisions.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name, participants, completed, passed, avgFinal, avgValueScore] = l.split('|').map((c) => c.trim())
      return { name: name ?? '', participants: int(participants ?? ''), completed: int(completed ?? ''), passed: int(passed ?? ''), avgFinal: score(avgFinal), avgValueScore: score(avgValueScore) }
    }),
  }
}

async function submit(report: ManualReport | null) {
  errors.value = []; busy.value = true
  try { await cca.saveManualReport(props.program.key, report); emit('saved') } catch (e) { errors.value = [{ message: (e as Error).message }] } finally { busy.value = false }
}
</script>

<template>
  <form class="el-card cc-form" data-testid="cc-manual-form" @submit.prevent="submit(build())">
    <h3 class="el-h3 cc-form__wide">Isi angka agregat: {{ program.name }}</h3>
    <UiErrorSummary v-if="errors.length" :errors="errors" class="cc-form__wide" />
    <UiNote v-if="program.participants > 0" tone="warning" class="cc-form__wide">Program ini sudah punya hasil impor per karyawan. Laporan tetap memakai hasil impor; isian agregat hanya dipakai bila hasil impor tidak ada.</UiNote>
    <UiField id="mr-terdaftar" v-slot="{ attrs }" label="Terdaftar"><input v-bind="attrs" v-model="form.registered" class="el-input" inputmode="numeric" required /></UiField>
    <UiField id="mr-selesai" v-slot="{ attrs }" label="Selesai"><input v-bind="attrs" v-model="form.completed" class="el-input" inputmode="numeric" required /></UiField>
    <UiField id="mr-lulus" v-slot="{ attrs }" label="Lulus"><input v-bind="attrs" v-model="form.passed" class="el-input" inputmode="numeric" required /></UiField>
    <UiField id="mr-skor-nilai" v-slot="{ attrs }" label="Rata-rata skor nilai" hint="Peserta yang selesai"><input v-bind="attrs" v-model="form.avgValueScore" class="el-input" inputmode="decimal" /></UiField>
    <UiField id="mr-skor-akhir" v-slot="{ attrs }" label="Rata-rata skor akhir" hint="Peserta yang selesai"><input v-bind="attrs" v-model="form.avgFinal" class="el-input" inputmode="decimal" /></UiField>

    <h4 class="el-h3 cc-form__wide" style="margin-top: 20px">Jumlah karyawan per status</h4>
    <UiField v-for="k in statusKeys" :id="`mr-status-${k.key}`" :key="k.key" v-slot="{ attrs }" :label="k.label"><input v-bind="attrs" v-model="form.statuses[k.key]" class="el-input" inputmode="numeric" /></UiField>

    <h4 class="el-h3 cc-form__wide" style="margin-top: 20px">Skor per nilai</h4>
    <template v-for="(v, i) in cfg.values" :key="v.name">
      <UiField :id="`mr-nilai-${i}-selesai`" v-slot="{ attrs }" :label="`${v.name}: peserta selesai`"><input v-bind="attrs" v-model="form.values[i]!.avgCompleted" class="el-input" inputmode="decimal" /></UiField>
      <UiField :id="`mr-nilai-${i}-semua`" v-slot="{ attrs }" :label="`${v.name}: semua peserta`"><input v-bind="attrs" v-model="form.values[i]!.avgAll" class="el-input" inputmode="decimal" /></UiField>
    </template>

    <template v-if="cfg.components.length">
      <h4 class="el-h3 cc-form__wide" style="margin-top: 20px">Komponen program</h4>
      <template v-for="(c, i) in cfg.components" :key="c.name">
        <UiField :id="`mr-komp-${i}-jumlah`" v-slot="{ attrs }" :label="`${c.name}: sudah mengerjakan`"><input v-bind="attrs" v-model="form.components[i]!.done" class="el-input" inputmode="numeric" /></UiField>
        <UiField :id="`mr-komp-${i}-rata`" v-slot="{ attrs }" :label="`${c.name}: rata-rata`"><input v-bind="attrs" v-model="form.components[i]!.avg" class="el-input" inputmode="decimal" /></UiField>
      </template>
    </template>

    <UiField id="mr-divisi" v-slot="{ attrs }" label="Hasil per divisi (opsional)" hint="Satu divisi per baris: Nama | Peserta | Selesai | Lulus | Skor akhir | Skor nilai. Jumlah peserta harus sama dengan terdaftar." class="cc-form__wide">
      <textarea v-bind="attrs" v-model="form.divisions" class="el-input" />
    </UiField>
    <div class="cc-actions cc-form__wide" style="margin-top: 16px">
      <UiButton type="submit" :disabled="busy">Simpan angka agregat</UiButton>
      <UiButton v-if="program.manualReport" variant="outlined" :disabled="busy" @click="submit(null)">Hapus isian agregat</UiButton>
      <UiButton variant="text" @click="emit('cancel')">Batal</UiButton>
    </div>
  </form>
</template>
