<script setup lang="ts">
// Paritas P8 R2 (AH-2, AA-4): tenggat penugasan wawancara dipilih di dialog saat menekan "Tugaskan", bukan di toolbar tabel.
// Tenggat tetap wajib dan dihitung dalam WIB (due.ts); body permintaan tidak berubah.
import { ref, watch } from 'vue'
import { UiButton, UiDialog, UiField } from '@/ui'
import { defaultDue, todayIso } from './due'

const props = defineProps<{ open: boolean; title: string; who: string; busy?: boolean }>()
const emit = defineEmits<{ close: []; confirm: [dueDate: string] }>()
const due = ref(defaultDue())
const error = ref('')
watch(() => props.open, (o) => { if (o) error.value = '' })

function submit() {
  if (!due.value) { error.value = 'Pilih batas waktu'; return }
  emit('confirm', due.value)
}
</script>

<template>
  <UiDialog :open="open" :title="title" @close="emit('close')">
    <form class="cc-dialog" novalidate @submit.prevent="submit">
      <p class="el-muted" style="margin: 0">Tugaskan wawancara ke {{ who }}.</p>
      <UiField id="cc-batas-dialog" v-slot="{ attrs }" label="Batas waktu" hint="Tanggal WIB." :error="error || undefined">
        <input v-bind="attrs" v-model="due" class="el-input" type="date" :min="todayIso()" required />
      </UiField>
      <div class="cc-actions">
        <UiButton type="submit" :disabled="busy">Tugaskan</UiButton>
        <UiButton variant="text" @click="emit('close')">Batal</UiButton>
      </div>
    </form>
  </UiDialog>
</template>
