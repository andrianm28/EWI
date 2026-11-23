<script setup lang="ts">
// Kartu "Data saya" di Hasil saya: unduh data, tarik persetujuan wawancara, minta hapus data (hak subjek data).
// Spek: docs/designs/b8-karyawan.md "Layar web". Sumbernya endpoint tanpa flag (/employees/me/data-requests,
// /employees/:id/export), jadi kartu tetap berfungsi walau /my/results gagal.
import { computed, nextTick, onMounted, ref } from 'vue'
import { ApiError } from '@/api/client'
import { downloadFile } from '@/api/imports'
import { formatWib, lna, type DataRequest } from '@/api/lna'
import { UiButton, UiCard, UiErrorSummary, UiField } from '@/ui'
import { useSessionStore } from '@/stores/session'
import { REQUEST_LABEL, REQUEST_STATUS_LABEL, isAdminAccount } from './view'

const props = defineProps<{ canWithdraw: boolean }>()
const emit = defineEmits<{ changed: [] }>()

const session = useSessionStore()
const rows = ref<DataRequest[]>([])
const error = ref('')
const done = ref('')
const busy = ref(false)
const confirming = ref(false)
const reason = ref('')
const panel = ref<HTMLElement | null>(null)
const trigger = ref<{ $el: HTMLElement } | null>(null)
const statusEl = ref<HTMLElement | null>(null)
const rowsLoaded = ref(false)

const adminAccount = computed(() => isAdminAccount(session.user))
const openDelete = computed(() => rows.value.some((r) => r.type === 'delete_data' && r.status === 'open'))

async function loadRows() {
  try { rows.value = (await lna.myDataRequests()).data; rowsLoaded.value = true } catch (e) { error.value = e instanceof ApiError ? e.message : 'Permintaan data tidak bisa dimuat' }
}
onMounted(loadRows)

async function run(fn: () => Promise<void>) {
  busy.value = true; error.value = ''; done.value = ''
  try { await fn() } catch (e) { error.value = e instanceof ApiError || e instanceof Error ? e.message : 'Permintaan gagal dikirim' } finally { busy.value = false }
  // Fokus ke pesan hasil supaya pengguna papan ketik dan pembaca layar tidak kembali ke awal halaman
  if (done.value) { await nextTick(); statusEl.value?.focus() }
}
async function cancelConfirm() {
  confirming.value = false
  await nextTick()
  trigger.value?.$el?.focus()
}

const download = () => run(async () => {
  if (!session.user) throw new Error('Sesi belum siap. Muat ulang halaman.')
  await downloadFile(`/employees/${encodeURIComponent(session.user.id)}/export`, `elgos-data-saya-${new Date().toISOString().slice(0, 10)}.json`)
})

async function askWithdraw() {
  confirming.value = true
  await nextTick()
  panel.value?.focus()
}
const withdraw = () => run(async () => {
  const r = (await lna.createDataRequest('withdraw_consent')).data
  confirming.value = false
  done.value = `Persetujuan ditarik. ${r.sessions ?? 0} wawancara dihentikan.`
  await loadRows()
  emit('changed')
})
const requestDelete = () => run(async () => {
  const r = (await lna.createDataRequest('delete_data', reason.value.trim() || undefined)).data
  reason.value = ''
  done.value = r.dueAt ? `Permintaan hapus terkirim. HR memprosesnya paling lambat ${formatWib(r.dueAt)} WIB.` : 'Permintaan hapus terkirim. HR memprosesnya paling lambat 3×24 jam.'
  await loadRows()
})
const cancel = (id: string) => run(async () => {
  await lna.cancelDataRequest(id)
  done.value = 'Permintaan hapus dibatalkan.'
  await loadRows()
})
</script>

<template>
  <UiCard data-testid="my-privacy" class="b8-gap">
    <h2 class="b8-h2">Data saya</h2>
    <UiErrorSummary :errors="error ? [{ message: error }] : []" />
    <p ref="statusEl" role="status" tabindex="-1" class="b8-status">{{ done }}</p>

    <div class="b8-row">
      <UiButton variant="outlined" size="sm" icon="download" :disabled="busy" @click="download">Unduh data saya</UiButton>
      <UiButton v-if="props.canWithdraw && !confirming" ref="trigger" variant="text" size="sm" :disabled="busy" @click="askWithdraw">Tarik persetujuan wawancara</UiButton>
    </div>
    <p class="el-muted b8-small">Berkas berisi transkrip wawancara Anda. Jangan simpan di perangkat bersama.</p>

    <section v-if="confirming" ref="panel" tabindex="-1" role="region" aria-label="Konfirmasi tarik persetujuan" class="b8-confirm">
      <p>Wawancara yang sedang berjalan dihentikan dan hasilnya tidak diproses lagi. Data tetap tersimpan sampai HR menghapusnya. Persetujuan yang sudah ditarik tidak bisa dipulihkan; HR bisa mengundang Anda lagi.</p>
      <div class="b8-row">
        <UiButton size="sm" :disabled="busy" @click="withdraw">Ya, tarik persetujuan</UiButton>
        <UiButton variant="text" size="sm" :disabled="busy" @click="cancelConfirm">Batal</UiButton>
      </div>
    </section>

    <p v-if="adminAccount" class="b8-gap-s">Akun HR atau Admin ETA dihapus lewat Admin ETA.</p>
    <form v-else-if="rowsLoaded && !openDelete" class="b8-form" novalidate @submit.prevent="requestDelete">
      <UiField id="b8-reason" label="Alasan (opsional)" :hint="`${reason.length}/1000 karakter`">
        <template #default="{ attrs }"><textarea v-bind="attrs" v-model="reason" rows="2" maxlength="1000" class="el-input" /></template>
      </UiField>
      <div><UiButton type="submit" variant="outlined" size="sm" :disabled="busy">Kirim permintaan hapus</UiButton></div>
    </form>

    <ul v-if="rows.length" class="b8-list b8-gap-s" aria-label="Permintaan data saya">
      <li v-for="r in rows" :key="r.id" class="b8-row b8-between">
        <span>{{ REQUEST_LABEL[r.type] }} · {{ formatWib(r.createdAt) }} WIB · {{ REQUEST_STATUS_LABEL[(r.status ?? 'open') as keyof typeof REQUEST_STATUS_LABEL] }}<template v-if="r.status === 'open' && r.dueAt"> · tenggat {{ formatWib(r.dueAt) }} WIB</template></span>
        <UiButton v-if="r.type === 'delete_data' && r.status === 'open'" variant="text" size="sm" :disabled="busy" @click="cancel(r.id)">Batalkan</UiButton>
      </li>
    </ul>
  </UiCard>
</template>
