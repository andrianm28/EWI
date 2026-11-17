<script setup lang="ts">
// Wawancara AI teks (DNA / TNA). Persetujuan rekaman wajib sebelum pertanyaan pertama.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { lna, type Turn } from '@/api/lna'
import { TNA_CONSENT_VERSION } from '@/content/consent'

const route = useRoute()
const router = useRouter()
const key = route.params.key as 'dna' | 'tna'
const id = route.params.id as string
const status = ref('')
const turns = ref<Turn[]>([])
const text = ref('')
const done = ref(false)
const busy = ref(false)
const error = ref('')
const agreed = ref(false)
const transcriptVisible = ref(true)
const title = computed(() => (key === 'dna' ? 'Wawancara asesmen kompetensi (DNA)' : 'Wawancara kebutuhan training (TNA)'))

async function run(fn: () => Promise<void>) {
  busy.value = true; error.value = ''
  try { await fn() } catch (e) { error.value = (e as Error).message } finally { busy.value = false }
}

onMounted(() => run(async () => {
  const s = (await lna.session(key, id)).data
  status.value = s.status
  transcriptVisible.value = s.transcriptVisible !== false
  turns.value = s.turns ?? []
}))

const consent = () => run(async () => {
  const r = await lna.consent(key, id, TNA_CONSENT_VERSION)
  status.value = 'in_progress'
  if (r.data.question) turns.value.push(r.data.question)
})

const send = () => run(async () => {
  const answer = text.value.trim()
  if (!answer) return
  turns.value.push({ speaker: 'human', text: answer, at: new Date().toISOString() })
  text.value = ''
  const r = await lna.answer(key, id, answer)
  if (r.data.question) turns.value.push(r.data.question)
  done.value = r.data.done
})

const finish = () => run(async () => {
  await lna.complete(key, id)
  await router.push(`/m/${key}`)
})
</script>

<template>
  <AppShell>
    <h1 class="text-lg font-semibold">{{ title }}</h1>
    <p v-if="error" role="alert" class="mt-2 text-sm text-red-600">{{ error }}</p>

    <section v-if="!transcriptVisible" class="mt-4 rounded-lg border bg-white p-4 text-sm text-slate-600" data-testid="transcript-private">
      Percakapan wawancara hanya bisa dibaca karyawan yang bersangkutan. Lihat ringkasan dan temuannya di halaman temuan.
    </section>

    <section v-else-if="status === 'scheduled' && key === 'dna'" class="mt-4 rounded-lg border bg-white p-4 text-sm text-slate-600">
      Teks persetujuan untuk wawancara asesmen kompetensi belum terbit. Hubungi HR.
    </section>

    <section v-else-if="status === 'scheduled'" class="mt-4 space-y-3 rounded-lg border bg-white p-4 text-sm" data-testid="consent">
      <h2 class="font-semibold">Sebelum mulai: tentang wawancara ini</h2>
      <p>
        Wawancara ini membantu perusahaan memahami mengapa sebagian target kerja Anda belum tercapai dan dukungan apa yang Anda butuhkan,
        misalnya pelatihan, alat kerja, atau perbaikan proses. Wawancara ini <strong>bukan penilaian kinerja</strong> dan tidak dipakai
        untuk sanksi atau keputusan promosi.
      </p>
      <h3 class="font-semibold">Yang akan terjadi</h3>
      <ul class="list-disc pl-5">
        <li>Anda bercakap lewat teks dengan asisten AI. Anda bisa berhenti dan melanjutkan nanti.</li>
        <li>Asisten AI akan menyebut KPI Anda yang belum tercapai beserta target dan realisasinya. Bila angkanya salah, sampaikan saat wawancara.</li>
        <li>Setelah selesai, AI menyusun ringkasan, temuan, dan rekomendasi. <strong>Tim HR meninjau hasil itu</strong> sebelum dipakai.</li>
      </ul>
      <h3 class="font-semibold">Siapa melihat apa</h3>
      <ul class="list-disc pl-5">
        <li><strong>Anda:</strong> seluruh percakapan, ringkasan, dan rekomendasi untuk Anda.</li>
        <li><strong>Atasan langsung dan HR:</strong> ringkasan dan temuan, bukan percakapan lengkap Anda.</li>
        <li><strong>Tim teknis ETA:</strong> hanya untuk memperbaiki masalah teknis, dan setiap akses tercatat.</li>
      </ul>
      <p>
        Percakapan Anda diproses oleh model AI Claude melalui Amazon Web Services di Singapura, disimpan terenkripsi,
        dan tidak dipakai untuk melatih model AI.
      </p>
      <h3 class="font-semibold">Hak Anda</h3>
      <ul class="list-disc pl-5">
        <li>Ikut wawancara ini sukarela. Menolak atau berhenti <strong>tidak berdampak</strong> pada penilaian atau status kerja Anda.</li>
        <li>Anda bisa menarik persetujuan, meminta salinan, atau meminta data Anda dikoreksi atau dihapus dengan menghubungi HR.</li>
        <li>Mohon tidak menuliskan informasi kesehatan, keyakinan, atau data pribadi orang lain.</li>
      </ul>
      <label class="flex items-start gap-2">
        <input v-model="agreed" type="checkbox" class="mt-1" data-testid="consent-check">
        <span>Saya sudah membaca keterangan di atas dan setuju mengikuti wawancara.</span>
      </label>
      <div class="flex items-center gap-3">
        <button class="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50" :disabled="busy || !agreed" @click="consent">Setuju dan mulai</button>
        <button class="rounded border px-4 py-2" type="button" @click="router.push(`/m/${key}`)">Tidak sekarang</button>
      </div>
      <p class="text-xs text-slate-500">{{ TNA_CONSENT_VERSION }}</p>
    </section>

    <section v-else-if="status === 'completed'" class="mt-4 text-sm text-slate-600">Wawancara ini sudah selesai.</section>

    <section v-else-if="status" class="mt-4 space-y-3">
      <div v-for="(t, i) in turns" :key="i" :class="t.speaker === 'ai' ? 'mr-12 bg-white' : 'ml-12 bg-blue-50'" class="rounded-lg border p-3 text-sm" :data-testid="`turn-${t.speaker}`">
        {{ t.text }}
      </div>
      <form v-if="!done" class="flex gap-2" @submit.prevent="send">
        <label class="sr-only" for="answer">Jawaban</label>
        <textarea id="answer" v-model="text" rows="2" class="flex-1 rounded border px-3 py-2 text-sm" placeholder="Tulis jawaban Anda" />
        <button type="submit" class="rounded bg-slate-900 px-4 text-white" :disabled="busy">Kirim</button>
      </form>
      <button v-if="turns.some((t) => t.speaker === 'human')" class="rounded border px-4 py-2 text-sm" :disabled="busy" @click="finish">
        {{ done ? 'Selesai dan kirim' : 'Akhiri wawancara' }}
      </button>
    </section>
  </AppShell>
</template>
