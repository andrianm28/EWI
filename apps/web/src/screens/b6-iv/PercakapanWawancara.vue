<script setup lang="ts">
// Percakapan wawancara teks (mockup layar `iv`, langkah Wawancara). Slot `masukan-suara` disiapkan untuk paket suara B19.
import { ref } from 'vue'
import { UiButton, UiChip } from '@/ui'
import type { Turn } from './api'
import './iv.css'

defineProps<{ turns: Turn[]; questionLimit?: number; canAnswer: boolean; busy?: boolean }>()
const emit = defineEmits<{ send: [text: string, restore: (t: string) => void] }>()
const text = ref('')

function submit() {
  const answer = text.value.trim()
  if (!answer) return
  text.value = ''
  // Bila server menolak (AI gagal), induk mengembalikan jawaban ke kotak teks untuk dikirim ulang
  emit('send', answer, (t) => { text.value = t })
}
</script>

<template>
  <div class="iv-chat-head">
    <h2 class="iv-h2">Percakapan</h2>
    <UiChip v-if="questionLimit">Pertanyaan {{ Math.min(turns.filter((t) => t.speaker === 'ai').length, questionLimit) }} dari {{ questionLimit }}</UiChip>
  </div>
  <div class="iv-chat" role="log" aria-live="polite" aria-label="Percakapan wawancara">
    <div v-for="(t, i) in turns" :key="i" :class="['iv-msg', t.speaker === 'ai' ? 'iv-msg--ai' : 'iv-msg--me']" :data-testid="`turn-${t.speaker}`">
      <small>{{ t.speaker === 'ai' ? 'ELGOS AI' : 'Anda' }}</small>{{ t.text }}
    </div>
  </div>
  <form v-if="canAnswer" class="iv-answer" @submit.prevent="submit">
    <label class="el-sr-only" for="iv-answer">Jawaban</label>
    <textarea id="iv-answer" v-model="text" rows="2" class="el-input iv-grow" placeholder="Tulis jawaban Anda" />
    <slot name="masukan-suara" />
    <UiButton type="submit" :disabled="busy">Kirim</UiButton>
  </form>
</template>

