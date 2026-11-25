<script setup lang="ts">
// Formulir rencana pengukuran (HR): judul, jabatan, periode, modul belajar, dan lima pertanyaan mockup.
import { onMounted, ref } from 'vue'
import { ApiError } from '@/api/client'
import { UiButton, UiErrorSummary, UiField } from '@/ui'
import { lim, type Options } from './api'
import { QUESTIONS } from './labels'

defineProps<{ cancelable: boolean }>()
const emit = defineEmits<{ created: [id: string]; cancel: [] }>()

const options = ref<Options | null>(null)
const form = ref({ title: '', jobRoleId: '', periodFrom: '', periodUntil: '', moduleIds: [] as string[],
  businessProblem: '', desiredBehavior: '', priorityCapabilities: '', evidencePlan: '', existingMetrics: '' })
const errors = ref<{ message: string; fieldId?: string }[]>([])
const busy = ref(false)

onMounted(async () => {
  try { options.value = (await lim.options()).data } catch (e) { errors.value = [{ message: e instanceof ApiError ? e.message : 'Pilihan jabatan dan modul tidak bisa dimuat' }] }
})

async function submit() {
  const f = form.value
  const errs: typeof errors.value = []
  if (!f.title.trim()) errs.push({ message: 'Isi judul rencana', fieldId: 'lim-title' })
  if (!f.moduleIds.length) errs.push({ message: 'Pilih minimal satu modul belajar', fieldId: 'lim-modules' })
  if (f.periodFrom && f.periodUntil && f.periodUntil < f.periodFrom) errs.push({ message: 'Akhir periode tidak boleh sebelum awal periode', fieldId: 'lim-until' })
  errors.value = errs
  if (errs.length) return
  busy.value = true
  try {
    const { data } = await lim.create({
      title: f.title.trim(), jobRoleId: f.jobRoleId || null, periodFrom: f.periodFrom || null, periodUntil: f.periodUntil || null, moduleIds: f.moduleIds,
      businessProblem: f.businessProblem, desiredBehavior: f.desiredBehavior, priorityCapabilities: f.priorityCapabilities,
      evidencePlan: f.evidencePlan, existingMetrics: f.existingMetrics,
    })
    emit('created', data.id)
  } catch (e) { errors.value = [{ message: e instanceof ApiError ? e.message : 'Rencana tidak bisa disimpan' }] } finally { busy.value = false }
}
const err = (id: string) => errors.value.find((e) => e.fieldId === id)?.message
</script>

<template>
  <form class="lim-form" novalidate @submit.prevent="submit">
    <UiErrorSummary :errors="errors" />
    <UiField id="lim-title" v-slot="{ attrs }" label="Judul rencana" :error="err('lim-title')">
      <input v-bind="attrs" v-model="form.title" class="el-input" maxlength="255">
    </UiField>
    <div class="lim-form-row">
      <UiField id="lim-role" v-slot="{ attrs }" label="Jabatan" hint="Kosong = semua jabatan">
        <select v-bind="attrs" v-model="form.jobRoleId" class="el-input">
          <option value="">Semua jabatan</option>
          <option v-for="j in options?.jobRoles ?? []" :key="j.id" :value="j.id">{{ j.name }}</option>
        </select>
      </UiField>
      <UiField id="lim-from" v-slot="{ attrs }" label="Awal periode"><input v-bind="attrs" v-model="form.periodFrom" class="el-input" type="date"></UiField>
      <UiField id="lim-until" v-slot="{ attrs }" label="Akhir periode" :error="err('lim-until')"><input v-bind="attrs" v-model="form.periodUntil" class="el-input" type="date"></UiField>
    </div>
    <fieldset id="lim-modules" class="lim-fieldset" tabindex="-1">
      <legend class="el-label">Modul belajar</legend>
      <div v-if="err('lim-modules')" class="el-field__error">{{ err('lim-modules') }}</div>
      <p v-if="options && !options.modules.length" class="el-muted lim-small">Belum ada modul di Learning Intervention.</p>
      <label v-for="m in options?.modules ?? []" :key="m.id" class="lim-check">
        <input v-model="form.moduleIds" type="checkbox" :value="m.id"> {{ m.code ? `${m.code} · ` : '' }}{{ m.name }}
      </label>
    </fieldset>
    <UiField v-for="q in QUESTIONS" :id="`lim-${q.key}`" :key="q.key" v-slot="{ attrs }" :label="q.label">
      <textarea v-bind="attrs" v-model="form[q.key]" class="el-input" rows="2" maxlength="2000" />
    </UiField>
    <div class="lim-actions">
      <UiButton type="submit" :disabled="busy">Buat rencana</UiButton>
      <UiButton v-if="cancelable" variant="text" @click="emit('cancel')">Batal</UiButton>
    </div>
  </form>
</template>

<style>
.lim-form { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.lim-form-row { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.lim-fieldset { border: 1px solid var(--el-outline-variant); border-radius: 12px; padding: 12px; margin: 0; }
.lim-check { display: flex; gap: 8px; align-items: center; padding: 4px 0; }
</style>
