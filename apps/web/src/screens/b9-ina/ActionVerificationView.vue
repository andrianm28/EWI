<script setup lang="ts">
// B9: pemilik tindakan menjawab verifikasi AI (maksimal tiga pertanyaan). Isi percakapan hanya untuk pemilik (PO-6).
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { ina, REPORTED_LABEL, VERIFICATION_LABEL, CONSENT_VERSION, type Turn, type Verification } from '@/api/ina'
import { UiAuditLine, UiButton, UiCard, UiErrorSummary, UiField, UiNote, UiStepper } from '@/ui'

const route = useRoute()
const router = useRouter()
const id = computed(() => (typeof route.params.id === 'string' && route.params.id ? route.params.id : null))

const mine = ref<Verification[]>([])
const current = ref<Verification | null>(null)
const turns = ref<Turn[]>([])
const loading = ref(true)
const busy = ref(false)
const loadError = ref('')
const errors = ref<{ message: string; fieldId?: string }[]>([])
const agreed = ref(false)
const answer = ref('')

const STEPS = [{ key: 'consent', label: 'Persetujuan' }, { key: 'chat', label: 'Percakapan' }, { key: 'done', label: 'Selesai' }]
const step = computed(() => (current.value?.status === 'assigned' ? 'consent' : current.value?.status === 'in_progress' ? 'chat' : 'done'))
const answered = computed(() => turns.value.filter((t) => t.speaker === 'human').length)
const fail = (e: unknown) => (e instanceof ApiError ? e.message : 'Terjadi kesalahan. Coba lagi.')

async function load() {
  loading.value = true
  loadError.value = ''
  errors.value = []
  current.value = null
  turns.value = []
  try {
    if (id.value) {
      const res = await ina.verification(id.value)
      current.value = res.data
      turns.value = res.data.turns ?? []
    } else {
      mine.value = (await ina.myVerifications()).data
    }
  } catch (e) {
    loadError.value = e instanceof ApiError && e.status === 404 ? 'Verifikasi ini tidak ditemukan atau bukan untuk Anda.' : fail(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(id, load)

async function run(fn: () => Promise<void>) {
  busy.value = true
  errors.value = []
  try { await fn() } catch (e) { errors.value = [{ message: fail(e) }] } finally { busy.value = false }
}

function start() {
  if (!agreed.value) { errors.value = [{ message: 'Centang persetujuan sebelum memulai.', fieldId: 'verif-setuju' }]; return }
  run(async () => {
    const res = await ina.consent(current.value!.id)
    current.value = { ...current.value!, status: 'in_progress' }
    if (res.data.question) turns.value = [{ speaker: 'ai', text: res.data.question }]
  })
}
function send() {
  const text = answer.value.trim()
  if (!text) { errors.value = [{ message: 'Tulis jawaban Anda.', fieldId: 'verif-jawaban' }]; return }
  run(async () => {
    const res = await ina.answer(current.value!.id, text)
    turns.value = [...turns.value, { speaker: 'human', text }]
    answer.value = ''
    if (res.data.done) await load()
    else if (res.data.question) turns.value = [...turns.value, { speaker: 'ai', text: res.data.question }]
  })
}
const finish = () => run(async () => { await ina.complete(current.value!.id); await load() })
const withdraw = () => run(async () => { await ina.withdraw(current.value!.id); await load() })
const OPEN = ['assigned', 'in_progress']
</script>

<template>
  <AppShell>
    <h1 class="el-h1">Verifikasi tindakan perbaikan</h1>
    <UiNote v-if="loadError" tone="critical">{{ loadError }}</UiNote>
    <p v-else-if="loading" class="el-muted">Memuat…</p>

    <template v-else-if="!id">
      <p class="el-muted">HR meminta kabar tentang tindakan perbaikan yang Anda pegang. Percakapannya singkat, paling banyak tiga pertanyaan.</p>
      <ul v-if="mine.length" class="verif__list" data-testid="verif-daftar">
        <li v-for="v in mine" :key="v.id">
          <span><b>{{ v.actionTitle }}</b> <span class="el-muted">{{ VERIFICATION_LABEL[v.status] }}</span></span>
          <UiButton size="sm" :variant="OPEN.includes(v.status) ? 'filled' : 'text'" :to="{ name: 'ina-verifikasi', params: { id: v.id } }">{{ OPEN.includes(v.status) ? 'Jawab' : 'Lihat' }}</UiButton>
        </li>
      </ul>
      <UiNote v-else>Tidak ada verifikasi yang menunggu Anda.</UiNote>
    </template>

    <template v-else-if="current">
      <p class="el-muted">Tindakan: <b>{{ current.actionTitle }}</b></p>
      <UiCard class="verif__card">
        <UiStepper :steps="STEPS" :current="step" label="Alur verifikasi" />
        <UiErrorSummary :errors="errors" class="verif__gap" />

        <form v-if="step === 'consent'" novalidate class="verif__gap" @submit.prevent="start">
          <p>AI akan menanyakan status tindakan ini, hambatannya, dan bantuan yang Anda butuhkan.</p>
          <ul class="verif__points">
            <li>Jawaban Anda disimpan terenkripsi. Isi percakapan hanya bisa Anda buka.</li>
            <li>HR hanya menerima ringkasan singkat dan status yang Anda laporkan.</li>
            <li>Anda boleh berhenti kapan saja. Bila menarik diri, percakapan dihapus.</li>
          </ul>
          <label class="el-check verif__gap">
            <input id="verif-setuju" v-model="agreed" type="checkbox" />
            <span>Saya setuju jawaban saya diringkas untuk HR.</span>
          </label>
          <div class="verif__row verif__gap">
            <UiButton type="submit" :disabled="busy">Mulai</UiButton>
            <UiButton variant="text" :disabled="busy" @click="withdraw">Saya tidak bersedia</UiButton>
          </div>
        </form>

        <template v-else>
          <ol class="verif__turns verif__gap" aria-label="Percakapan" data-testid="verif-percakapan">
            <li v-for="(t, i) in turns" :key="i" :class="`verif__turn verif__turn--${t.speaker}`">
              <span class="el-sr-only">{{ t.speaker === 'ai' ? 'AI: ' : 'Anda: ' }}</span>{{ t.text }}
            </li>
          </ol>
          <form v-if="step === 'chat'" novalidate class="verif__gap" @submit.prevent="send">
            <UiField id="verif-jawaban" v-slot="{ attrs }" :label="`Jawaban Anda (pertanyaan ${Math.min(answered + 1, 3)} dari 3)`">
              <textarea v-bind="attrs" v-model="answer" class="el-input" maxlength="4000" />
            </UiField>
            <div class="verif__row verif__gap">
              <UiButton type="submit" :disabled="busy">Kirim jawaban</UiButton>
              <UiButton v-if="answered > 0" variant="outlined" :disabled="busy" @click="finish">Akhiri sekarang</UiButton>
              <UiButton variant="text" :disabled="busy" @click="withdraw">Tarik diri dan hapus percakapan</UiButton>
            </div>
          </form>
          <div v-else class="verif__gap" data-testid="verif-selesai">
            <UiNote v-if="current.status === 'completed'" tone="success">
              Terima kasih. HR menerima ringkasan berikut, tanpa isi percakapan: "{{ current.summary }}"
              <template v-if="current.reportedStatus"> Status yang tercatat: {{ REPORTED_LABEL[current.reportedStatus] }}.</template>
            </UiNote>
            <UiNote v-else-if="current.status === 'withdrawn'">Anda menarik diri. Percakapan sudah dihapus.</UiNote>
            <UiNote v-else>Verifikasi ini dibatalkan oleh HR.</UiNote>
            <UiButton variant="text" class="verif__gap" @click="router.push({ name: 'ina-verifikasi' })">Kembali ke daftar</UiButton>
          </div>
        </template>
        <UiAuditLine :items="[`persetujuan ${CONSENT_VERSION}`, 'dicatat di log audit']" class="verif__gap" />
      </UiCard>
    </template>
  </AppShell>
</template>

<style scoped>
.verif__card { margin-top: 16px; max-width: 760px; }
.verif__gap { margin-top: 16px; }
.verif__row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.verif__points { margin: 8px 0 0; padding-left: 20px; }
.verif__list { list-style: none; margin: 16px 0 0; padding: 0; max-width: 760px; }
.verif__list li { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 12px 0; border-top: 1px solid var(--el-outline-variant); }
.verif__turns { list-style: none; margin: 16px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.verif__turn { padding: 10px 14px; border-radius: 12px; max-width: 85%; white-space: pre-wrap; }
.verif__turn--ai { background: var(--el-secondary-container); align-self: flex-start; }
.verif__turn--human { background: var(--el-primary-container); align-self: flex-end; }
</style>
