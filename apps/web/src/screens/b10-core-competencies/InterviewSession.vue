<script setup lang="ts">
// B10 tahap 2: sesi wawancara Core Competencies untuk peserta (pimpinan atau karyawan). Spek bagian 11.4 dan 11.8.
// Langkah: persetujuan -> 4 pertanyaan (pilihan jawaban + isian bebas) -> ringkasan per tema -> "Sesuai, kirim".
// Transkrip hanya tampil di sini, untuk peserta sendiri.
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '@/api/client'
import { cca, THEME_LABEL, type InterviewSession } from '@/api/cca'
import { CCA_CONSENT_VERSION } from '@/content/consent'
import { UiButton, UiChip, UiErrorSummary, UiNote } from '@/ui'
import '../b6-iv/iv.css'

const props = defineProps<{ assignmentId: string }>()
const emit = defineEmits<{ finished: [] }>()

const s = ref<InterviewSession | null>(null)
const busy = ref(false)
const errors = ref<{ message: string; fieldId?: string }[]>([])
const agreed = ref(false)
const text = ref('')

async function load() {
  try { s.value = await cca.session(props.assignmentId) } catch (e) { errors.value = [{ message: (e as Error).message }] }
}
onMounted(load)

/** Jalankan aksi lalu muat ulang sesi. onError dipanggil dengan galatnya (mis. mengembalikan jawaban ke kotak teks). */
async function act(fn: () => Promise<unknown>, onError?: (e: unknown) => string | void) {
  errors.value = []; busy.value = true
  try { await fn() } catch (e) {
    errors.value = [{ message: onError?.(e) || (e as Error).message }]
  } finally { await load(); busy.value = false }
}

const last = computed(() => (s.value?.turns.length ? s.value.turns[s.value.turns.length - 1] : null))
const pending = computed(() => (s.value && last.value?.role === 'ai' && s.value.answerCount < s.value.questionCount ? last.value : null))
const needQuestion = computed(() => !!s.value && s.value.step === 'chat' && !pending.value && s.value.answerCount < s.value.questionCount)
const allAnswered = computed(() => !!s.value && s.value.answerCount >= s.value.questionCount)
const isLeader = computed(() => s.value?.assignment.tier === 'leader')

function agree() {
  if (!agreed.value) { errors.value = [{ message: 'Centang persetujuan untuk melanjutkan', fieldId: 'cc-consent' }]; return }
  // versi teks yang ditampilkan layar ini; server menolak bila sudah tidak berlaku (CONSENT_VERSION_INVALID)
  act(() => cca.consent(props.assignmentId, CCA_CONSENT_VERSION))
}
function answer(value: string) {
  const v = value.trim()
  if (!v) { errors.value = [{ message: 'Tulis jawaban atau pilih salah satu pilihan', fieldId: 'cc-answer' }]; return }
  text.value = ''
  act(() => cca.turn(props.assignmentId, v), (e) => {
    // AI gagal setelah jawaban tersimpan: tinggal minta pertanyaan berikutnya. Galat lain: jawaban dikembalikan.
    if (e instanceof ApiError && e.code === 'AI_UNAVAILABLE') return `${e.message} Jawaban Anda sudah tersimpan.`
    text.value = v
  })
}
const restart = () => act(async () => { await cca.restart(props.assignmentId); await cca.turn(props.assignmentId) })
const confirm = () => act(async () => { await cca.confirm(props.assignmentId); emit('finished') })
</script>

<template>
  <section class="cc-stack" data-testid="cc-sesi">
    <UiErrorSummary :errors="errors" />
    <p v-if="!s" class="el-muted">Memuat…</p>

    <div v-else-if="s.step === 'consent'" class="iv-consent" data-testid="cc-persetujuan">
      <h2 class="iv-h3">Sebelum mulai: tentang wawancara ini</h2>
      <p>
        Wawancara ini memetakan pemahaman Anda tentang visi, misi, dan nilai perusahaan. Wawancara ini <strong>bukan penilaian kinerja</strong>
        dan tidak dipakai untuk sanksi atau keputusan promosi.
      </p>
      <h3 class="iv-h3">Yang akan terjadi</h3>
      <ul class="iv-bullets">
        <li>Asisten AI mengajukan {{ s.questionCount }} pertanyaan, sekitar {{ s.assignment.durationMinutes }} menit. Anda bisa memilih jawaban yang disarankan atau menulis sendiri.</li>
        <li>Setelah itu AI meringkas jawaban Anda per tema. Anda memeriksa ringkasan sebelum dikirim, dan bisa mengulang wawancara satu kali.</li>
      </ul>
      <h3 class="iv-h3">Siapa melihat apa</h3>
      <ul class="iv-bullets">
        <li><strong>Anda:</strong> seluruh percakapan dan ringkasan.</li>
        <li v-if="isLeader"><strong>HR:</strong> ringkasan per tema, bukan percakapan lengkap.</li>
        <li v-else><strong>HR:</strong> hanya angka gabungan seluruh karyawan (paling sedikit 5 orang), bukan jawaban Anda per orang.</li>
        <li><strong>Atasan Anda:</strong> hanya status selesai atau belum.</li>
      </ul>
      <p>Percakapan diproses oleh model AI Claude melalui Amazon Web Services di Singapura, disimpan terenkripsi, dan tidak dipakai untuk melatih model AI.</p>
      <ul class="iv-bullets">
        <li>Ikut wawancara ini sukarela. Menolak atau berhenti tidak berdampak pada penilaian atau status kerja Anda.</li>
        <li>Mohon tidak menuliskan informasi kesehatan, keyakinan, atau data pribadi orang lain.</li>
      </ul>
      <label class="el-check">
        <input id="cc-consent" v-model="agreed" type="checkbox">
        <span>Saya sudah membaca keterangan di atas dan setuju mengikuti wawancara.</span>
      </label>
      <div class="iv-actions"><UiButton :disabled="busy" @click="agree">Mulai wawancara</UiButton></div>
      <p class="el-muted iv-small">{{ CCA_CONSENT_VERSION }}</p>
    </div>

    <template v-else-if="s.step === 'chat'">
      <div class="iv-chat-head">
        <h2 class="iv-h2">Percakapan</h2>
        <UiChip>Pertanyaan {{ Math.min(s.answerCount + 1, s.questionCount) }} dari {{ s.questionCount }}</UiChip>
      </div>
      <div class="iv-chat" role="log" aria-live="polite" aria-label="Percakapan wawancara">
        <div v-for="(t, i) in s.turns" :key="i" :class="['iv-msg', t.role === 'ai' ? 'iv-msg--ai' : 'iv-msg--me']" :data-testid="`cc-turn-${t.role}`">
          <small>{{ t.role === 'ai' ? `ELGOS-AI · ${THEME_LABEL[t.theme]}` : 'Anda' }}</small>{{ t.text }}
        </div>
      </div>
      <template v-if="pending">
        <div v-if="pending.options?.length" class="cc-actions" role="group" aria-label="Pilihan jawaban">
          <UiButton v-for="o in pending.options" :key="o" variant="outlined" size="sm" :disabled="busy" @click="answer(o)">{{ o }}</UiButton>
        </div>
        <form class="iv-answer" @submit.prevent="answer(text)">
          <label class="el-sr-only" for="cc-answer">Jawaban</label>
          <textarea id="cc-answer" v-model="text" rows="2" maxlength="2000" class="el-input iv-grow" placeholder="Tulis jawaban Anda" />
          <UiButton type="submit" :disabled="busy">Kirim</UiButton>
        </form>
      </template>
      <UiNote v-else-if="needQuestion" tone="warning">
        Pertanyaan berikutnya belum termuat.
        <UiButton variant="text" size="sm" :disabled="busy" @click="act(() => cca.turn(assignmentId))">Muat pertanyaan</UiButton>
      </UiNote>
      <div v-else-if="allAnswered" class="iv-actions">
        <UiButton :disabled="busy" @click="act(() => cca.summarize(assignmentId))">Buat ringkasan</UiButton>
      </div>
    </template>

    <template v-else-if="s.summary">
      <h2 class="iv-h2">{{ s.step === 'done' ? 'Terkirim' : 'Ringkasan jawaban Anda' }}</h2>
      <UiNote v-if="s.step === 'summary'">Periksa ringkasan ini sebelum dianggap final.</UiNote>
      <p v-else class="el-muted">Terima kasih. Ringkasan berikut sudah dikirim.</p>
      <dl class="cc-summary" data-testid="cc-ringkasan">
        <template v-for="(t, i) in s.summary.themes" :key="i">
          <dt>{{ t.theme ? THEME_LABEL[t.theme] : 'Ringkasan' }}</dt>
          <dd>{{ t.answer ?? 'Tidak ada ringkasan untuk tema ini.' }}</dd>
        </template>
      </dl>
      <div v-if="s.step === 'summary'" class="iv-actions">
        <UiButton :disabled="busy" @click="confirm">Sesuai, kirim</UiButton>
        <UiButton v-if="s.assignment.restartsLeft > 0" variant="outlined" :disabled="busy" @click="restart">Ulangi wawancara</UiButton>
      </div>
      <p v-if="s.step === 'summary' && s.assignment.restartsLeft > 0" class="el-muted iv-small">Mengulang menghapus percakapan dan ringkasan ini. Hanya bisa sekali.</p>
    </template>

    <template v-else-if="s.step === 'done'">
      <h2 class="iv-h2">Terkirim</h2>
      <p class="el-muted">Wawancara ini sudah selesai.</p>
    </template>

    <UiNote v-else tone="warning">Penugasan ini sudah dibatalkan.</UiNote>
  </section>
</template>
