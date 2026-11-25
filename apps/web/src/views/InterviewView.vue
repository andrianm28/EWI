<script setup lang="ts">
// Wawancara AI teks DNA (POC). Sesi TNA pindah ke screens/b6-iv (B6). Persetujuan rekaman wajib sebelum pertanyaan pertama.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { lna, type Turn } from '@/api/lna'

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

const send = () => run(async () => {
  const answer = text.value.trim()
  if (!answer) return
  turns.value.push({ speaker: 'human', text: answer, at: new Date().toISOString() })
  text.value = ''
  let r
  try {
    r = await lna.answer(key, id, answer)
  } catch (e) {
    // AI gagal: jawaban tidak tersimpan di server (PK-06), jadi kembalikan ke kotak teks untuk dikirim ulang
    turns.value.pop()
    text.value = answer
    throw e
  }
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

    <section v-else-if="status === 'scheduled'" class="mt-4 rounded-lg border bg-white p-4 text-sm text-slate-600">
      Teks persetujuan untuk wawancara asesmen kompetensi belum terbit. Hubungi HR.
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
