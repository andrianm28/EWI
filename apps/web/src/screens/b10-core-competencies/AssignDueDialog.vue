<script setup lang="ts">
// Paritas P8 R2 (AH-2, AA-4): tenggat penugasan wawancara dipilih di dialog saat menekan "Tugaskan", bukan di toolbar tabel.
// Tenggat tetap wajib dan dihitung dalam WIB (due.ts); body permintaan tidak berubah.
// Triase P8 #2/#3: dialog tetap terbuka sampai permintaan berhasil; galat API tampil di dalamnya (`errors`),
// tanggal kosong atau lewat ditolak di peramban, dan tiap kali dibuka tenggat kembali ke bawaan +14 hari.
import { ref, watch } from 'vue'
import { UiButton, UiDialog, UiErrorSummary, UiField } from '@/ui'
import { defaultDue, todayIso } from './due'

const props = defineProps<{ open: boolean; title: string; who: string; busy?: boolean; errors?: { message: string }[] }>()
const emit = defineEmits<{ close: []; confirm: [dueDate: string] }>()
const due = ref(defaultDue())
const error = ref('')
watch(() => props.open, (o) => { if (o) { due.value = defaultDue(); error.value = '' } })
watch(due, () => { error.value = '' })

function submit() {
  if (!due.value) { error.value = 'Pilih batas waktu'; return }
  // String ISO yyyy-mm-dd bisa dibandingkan langsung
  if (due.value < todayIso()) { error.value = 'Batas waktu paling cepat hari ini'; return }
  emit('confirm', due.value)
}
</script>

<template>
  <UiDialog :open="open" :title="title" @close="emit('close')">
    <form class="cc-dialog" novalidate @submit.prevent="submit">
      <UiErrorSummary v-if="errors?.length" :errors="errors" />
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
