<script setup lang="ts">
// Percakapan wawancara (mockup layar `iv`, langkah Wawancara). Mode teks: kotak jawaban. Mode suara (B19): slot
// `masukan-suara` (panel suara) menggantikan kotak teks dan caption sementara tampil di luar log supaya pembaca layar
// tidak dibanjiri potongan caption. Jawaban terakhir karyawan bisa diubah (V5) di kedua mode.
import { computed, ref } from 'vue'
import { UiButton, UiChip } from '@/ui'
import type { Mode, Turn } from './api'
import './iv.css'
import { AI_NAME } from '@/api/ai'

const props = withDefaults(defineProps<{
  turns: Turn[]; questionLimit?: number; canAnswer: boolean; busy?: boolean
  mode?: Mode; pending?: { speaker: 'ai' | 'human'; text: string } | null; canEdit?: boolean
}>(), { mode: 'text', pending: null, canEdit: false })
const emit = defineEmits<{
  send: [text: string, restore: (t: string) => void]
  edit: [turn: Turn, text: string, done: (ok: boolean) => void]
}>()
const text = ref('')

function submit() {
  const answer = text.value.trim()
  if (!answer) return
  text.value = ''
  // Bila server menolak (AI gagal), induk mengembalikan jawaban ke kotak teks untuk dikirim ulang
  emit('send', answer, (t) => { text.value = t })
}

// Jawaban karyawan terbaru yang sudah tersimpan (punya id) boleh diubah
const lastHumanIndex = computed(() => {
  for (let i = props.turns.length - 1; i >= 0; i -= 1) if (props.turns[i]!.speaker === 'human') return props.turns[i]!.id != null ? i : -1
  return -1
})
const editing = ref(false)
const draft = ref('')
function startEdit(t: Turn) { draft.value = t.text; editing.value = true }
function saveEdit(t: Turn) {
  const v = draft.value.trim()
  if (!v) return
  emit('edit', t, v, (ok) => { if (ok) editing.value = false })
}
const askedCount = computed(() => props.turns.filter((t) => t.speaker === 'ai' && !t.interrupted).length)
</script>

<template>
  <div class="iv-chat-head">
    <h2 class="iv-h2">Percakapan</h2>
    <UiChip v-if="questionLimit">Pertanyaan {{ Math.min(askedCount, questionLimit) }} dari {{ questionLimit }}</UiChip>
  </div>
  <div class="iv-chat" role="log" aria-live="polite" aria-label="Percakapan wawancara">
    <div v-for="(t, i) in turns" :key="t.id ?? i" :class="['iv-msg', t.speaker === 'ai' ? 'iv-msg--ai' : 'iv-msg--me']" :data-testid="`turn-${t.speaker}`">
      <small>{{ t.speaker === 'ai' ? AI_NAME : 'Anda' }}<template v-if="t.corrected"> · diubah</template></small>
      <form v-if="canEdit && editing && i === lastHumanIndex" class="iv-edit" @submit.prevent="saveEdit(t)">
        <label class="el-sr-only" for="iv-edit">Ubah jawaban terakhir</label>
        <textarea id="iv-edit" v-model="draft" rows="2" maxlength="8000" class="el-input" />
        <div class="iv-actions">
          <UiButton size="sm" type="submit" :disabled="busy">Simpan</UiButton>
          <UiButton size="sm" variant="text" @click="editing = false">Batal</UiButton>
        </div>
      </form>
      <template v-else>{{ t.text }}</template>
      <UiButton v-if="canEdit && !editing && i === lastHumanIndex" size="sm" variant="text" class="iv-msg__edit" @click="startEdit(t)">Ubah</UiButton>
    </div>
  </div>
  <div v-if="pending && pending.text" :class="['iv-msg', 'iv-msg--pending', pending.speaker === 'ai' ? 'iv-msg--ai' : 'iv-msg--me']" data-testid="caption">
    <small>{{ pending.speaker === 'ai' ? AI_NAME : 'Anda' }}</small>{{ pending.text }}
  </div>
  <template v-if="canAnswer && mode === 'voice'"><slot name="masukan-suara" /></template>
  <form v-else-if="canAnswer" class="iv-answer" @submit.prevent="submit">
    <label class="el-sr-only" for="iv-answer">Jawaban</label>
    <!-- P8 R13 (K-2, IV-7): input satu baris `.inp` mockup; pilihan jawaban AI menunggu paket B6 -->
    <input id="iv-answer" v-model="text" type="text" autocomplete="off" class="el-input iv-grow" placeholder="Ketik jawaban Anda" />
    <UiButton type="submit" :disabled="busy">Kirim</UiButton>
  </form>
</template>
