<script setup lang="ts">
// B15 tahap 3: sesi wawancara ulang AI untuk karyawan (mockup Pak Eji: "Konfirmasi hasil belajar"). Spek bagian 12.
// Langkah: persetujuan -> 2 × kompetensi + 1 pertanyaan (tiga pilihan + isian bebas) -> penilaian -> selesai tanpa skor.
// Transkrip hanya tampil di sini, untuk karyawan sendiri (T-6).
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '@/api/client'
import { LIM_CONSENT_VERSION } from '@/content/consent'
import { UiButton, UiChip, UiErrorSummary, UiNote } from '@/ui'
import { lim, type ReinterviewSession } from './api'
import '../b6-iv/iv.css'

const props = defineProps<{ planId: string }>()
const emit = defineEmits<{ finished: [] }>()

const s = ref<ReinterviewSession | null>(null)
const busy = ref(false)
const errors = ref<{ message: string; fieldId?: string }[]>([])
const agreed = ref(false)
const text = ref('')

async function load() {
  try { s.value = (await lim.session(props.planId)).data } catch (e) { errors.value = [{ message: (e as Error).message }] }
}
onMounted(load)

async function act(fn: () => Promise<unknown>, onError?: (e: unknown) => string | void) {
  errors.value = []; busy.value = true
  try { await fn() } catch (e) {
    errors.value = [{ message: onError?.(e) || (e as Error).message }]
  } finally { await load(); busy.value = false }
}

const last = computed(() => (s.value?.turns.length ? s.value.turns[s.value.turns.length - 1] : null))
const pending = computed(() => (s.value && last.value?.role === 'ai' && s.value.answerCount < s.value.questionCount ? last.value : null))
const needQuestion = computed(() => !!s.value && s.value.step === 'chat' && !pending.value)
const KIND = { scenario: 'Situasi kerja', verify: 'Cara memastikan', apply: 'Penerapan' } as const

function agree() {
  if (!agreed.value) { errors.value = [{ message: 'Centang persetujuan untuk melanjutkan', fieldId: 'wu-consent' }]; return }
  act(() => lim.consent(props.planId, LIM_CONSENT_VERSION))
}
function answer(value: string) {
  const v = value.trim()
  if (!v) { errors.value = [{ message: 'Tulis jawaban atau pilih salah satu pilihan', fieldId: 'wu-answer' }]; return }
  text.value = ''
  act(async () => { const r = await lim.turn(props.planId, v); if (r.data.done) emit('finished') }, (e) => {
    // AI gagal setelah jawaban tersimpan: tinggal minta lagi. Galat lain: jawaban dikembalikan ke kotak teks.
    if (e instanceof ApiError && e.code === 'AI_UNAVAILABLE') return `${e.message} Jawaban Anda sudah tersimpan.`
    text.value = v
  })
}
const retry = () => act(async () => { const r = await lim.turn(props.planId); if (r.data.done) emit('finished') })
</script>

<template>
  <section class="lim-stack" data-testid="wu-sesi">
    <UiErrorSummary :errors="errors" />
    <p v-if="!s" class="el-muted">Memuat…</p>

    <div v-else-if="s.step === 'consent'" class="iv-consent" data-testid="wu-persetujuan">
      <h2 class="iv-h3">Sebelum mulai: tentang wawancara ulang</h2>
      <p>
        Wawancara ini mengukur apakah hasil pelatihan masih terpakai di pekerjaan Anda. Hasilnya dibandingkan dengan data kinerja untuk
        menilai dampak program pelatihan, <strong>bukan dasar penilaian kinerja Anda</strong>, dan tidak dipakai untuk sanksi atau keputusan promosi.
      </p>
      <h3 class="iv-h3">Yang akan terjadi</h3>
      <ul class="iv-bullets">
        <li>Asisten AI mengajukan {{ s.questionCount }} pertanyaan tentang {{ s.competencies.join(', ') }}. Anda bisa memilih salah satu jawaban atau menulis sendiri.</li>
        <li>Setelah pertanyaan terakhir, AI memberi skor per kompetensi dengan satu kalimat alasan. Wawancara tidak bisa diulang.</li>
      </ul>
      <h3 class="iv-h3">Siapa melihat apa</h3>
      <ul class="iv-bullets">
        <li><strong>Anda:</strong> seluruh percakapan.</li>
        <li><strong>HR:</strong> skor dan alasan singkat per kompetensi, bukan percakapan Anda.</li>
        <li><strong>Atasan Anda:</strong> hanya angka gabungan tim.</li>
      </ul>
      <p>Percakapan diproses oleh model AI Claude melalui Amazon Web Services di Singapura, disimpan terenkripsi, dan tidak dipakai untuk melatih model AI.</p>
      <ul class="iv-bullets">
        <li>Ikut wawancara ini sukarela. Menolak atau berhenti tidak berdampak pada penilaian atau status kerja Anda.</li>
        <li>Mohon tidak menuliskan informasi kesehatan, keyakinan, atau data pribadi orang lain.</li>
      </ul>
      <label class="el-check">
        <input id="wu-consent" v-model="agreed" type="checkbox">
        <span>Saya sudah membaca keterangan di atas dan setuju mengikuti wawancara ulang.</span>
      </label>
      <div class="iv-actions"><UiButton :disabled="busy" @click="agree">Mulai wawancara</UiButton></div>
      <p class="el-muted iv-small">{{ LIM_CONSENT_VERSION }}</p>
    </div>

    <template v-else-if="s.step === 'chat' || s.step === 'scoring'">
      <div class="iv-chat-head">
        <h2 class="iv-h2">Konfirmasi hasil belajar</h2>
        <UiChip>Pertanyaan {{ Math.min(s.answerCount + 1, s.questionCount) }} dari {{ s.questionCount }}</UiChip>
      </div>
      <div class="iv-chat" role="log" aria-live="polite" aria-label="Percakapan wawancara ulang">
        <div v-for="t in s.turns" :key="t.position" :class="['iv-msg', t.role === 'ai' ? 'iv-msg--ai' : 'iv-msg--me']" :data-testid="`wu-turn-${t.role}`">
          <small>{{ t.role === 'ai' ? `ELGOS-AI · ${KIND[t.kind]}${t.competency ? ` · ${t.competency}` : ''}` : 'Anda' }}</small>{{ t.text }}
        </div>
      </div>
      <template v-if="pending">
        <div v-if="pending.options?.length" class="lim-actions" role="group" aria-label="Pilihan jawaban">
          <UiButton v-for="o in pending.options" :key="o" variant="outlined" size="sm" :disabled="busy" @click="answer(o)">{{ o }}</UiButton>
        </div>
        <form class="iv-answer" @submit.prevent="answer(text)">
          <label class="el-sr-only" for="wu-answer">Jawaban</label>
          <textarea id="wu-answer" v-model="text" rows="2" maxlength="2000" class="el-input iv-grow" placeholder="Atau ketik jawaban sendiri" />
          <UiButton type="submit" :disabled="busy">Kirim</UiButton>
        </form>
      </template>
      <UiNote v-else-if="s.step === 'scoring'" tone="warning">
        Semua jawaban tersimpan, tetapi penilaian belum selesai.
        <UiButton variant="text" size="sm" :disabled="busy" @click="retry">Coba nilai lagi</UiButton>
      </UiNote>
      <UiNote v-else-if="needQuestion" tone="warning">
        Pertanyaan berikutnya belum termuat.
        <UiButton variant="text" size="sm" :disabled="busy" @click="retry">Muat pertanyaan</UiButton>
      </UiNote>
    </template>

    <template v-else-if="s.step === 'done'">
      <h2 class="iv-h2">Terima kasih</h2>
      <p class="el-muted" data-testid="wu-selesai">Jawaban Anda sudah tersimpan. Hasilnya dipakai HR untuk menilai dampak program pelatihan.</p>
    </template>
  </section>
</template>
