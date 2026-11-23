<script setup lang="ts">
// Antrean HR untuk permintaan data karyawan: tarik persetujuan wawancara dan hapus data (spek B8 "Layar HR: Permintaan data").
// Tarik persetujuan ditutup dengan atau tanpa menghapus data wawancara (keputusan user 19 Nov: hanya ditandai, HR yang
// menghapus). Hapus data dipenuhi dengan menghapus akun karyawan (DELETE /employees/:userId), tenggat 3×24 jam (LIN-B23).
import { nextTick, onMounted, ref, watch } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { formatWib, lna, type DataRequestRow } from '@/api/lna'
import { useSessionStore } from '@/stores/session'
import { UiButton, UiCard, UiErrorSummary, UiSegmented, UiStatus } from '@/ui'
import { REQUEST_LABEL } from './view'
import './b8.css'

type Filter = 'open' | 'done' | 'cancelled' | 'all'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'Terbuka' }, { key: 'done', label: 'Selesai' }, { key: 'cancelled', label: 'Dibatalkan' }, { key: 'all', label: 'Semua' },
]

const session = useSessionStore()
const filter = ref<Filter>('open')
const rows = ref<DataRequestRow[]>([])
const loaded = ref(false)
const error = ref('')
const done = ref('')
const busy = ref(false)
/** Konfirmasi yang terbuka: hapus data wawancara (tarik persetujuan) atau hapus akun (hapus data). */
const confirm = ref<{ id: string; kind: 'erase' | 'account' } | null>(null)
const panel = ref<HTMLElement[] | HTMLElement | null>(null)

async function load() {
  error.value = ''
  try { rows.value = (await lna.dataRequests(filter.value)).data } catch (e) { error.value = e instanceof ApiError ? e.message : 'Permintaan data tidak bisa dimuat' }
  loaded.value = true
}
onMounted(load)
watch(filter, () => { done.value = ''; confirm.value = null; load() })

async function ask(id: string, kind: 'erase' | 'account') {
  confirm.value = { id, kind }
  await nextTick()
  const el = Array.isArray(panel.value) ? panel.value[0] : panel.value
  el?.focus()
}

async function act(fn: () => Promise<string>) {
  busy.value = true; error.value = ''; done.value = ''
  try { done.value = await fn(); confirm.value = null; await load() } catch (e) { error.value = e instanceof ApiError ? e.message : 'Permintaan gagal diproses' } finally { busy.value = false }
}
const who = (r: DataRequestRow) => r.userName ?? 'karyawan'
const close = (r: DataRequestRow, erase: boolean) => act(async () => {
  const res = (await lna.fulfillDataRequest(r.id, erase ? { erase: true } : {})).data
  if (!res.erased) return `Permintaan ${who(r)} ditutup. Data wawancara tetap tersimpan.`
  return `Permintaan ${who(r)} ditutup. Dihapus: ${res.deletedTurns ?? 0} giliran percakapan, ${res.deletedFindings ?? 0} temuan, ${res.deletedPlanItems ?? 0} rencana.`
})
const deleteAccount = (r: DataRequestRow) => act(async () => {
  await lna.deleteEmployee(r.userId)
  return `Akun dan data ${who(r)} dihapus.`
})
const STATUS_LABEL: Record<string, string> = { open: 'Terbuka', done: 'Selesai', cancelled: 'Dibatalkan' }
</script>

<template>
  <AppShell>
    <h1 class="el-h1">Permintaan data karyawan</h1>
    <p class="el-muted b8-sub">Permintaan hapus data diproses paling lambat 3×24 jam. Penarikan persetujuan tidak bertenggat; datanya tetap tersimpan sampai Anda menghapusnya.</p>
    <UiSegmented v-model="filter" :options="FILTERS" label="Status permintaan" />
    <UiErrorSummary :errors="error ? [{ message: error }] : []" />
    <p v-if="done" role="status" class="b8-status b8-gap-s">{{ done }}</p>
    <p v-if="loaded && !rows.length && !error" class="el-muted b8-gap-s">Tidak ada permintaan.</p>
    <ul class="b8-list b8-gap-s">
      <li v-for="r in rows" :key="r.id" :data-testid="`dsr-${r.id}`">
        <UiCard>
          <div class="b8-row b8-between">
            <strong>{{ who(r) }}</strong>
            <span class="b8-row">
              <UiStatus v-if="r.overdue" tone="critical">Lewat tenggat</UiStatus>
              <span class="el-muted b8-small">{{ STATUS_LABEL[r.status] ?? r.status }}</span>
            </span>
          </div>
          <p>{{ REQUEST_LABEL[r.type] }} · diajukan {{ formatWib(r.createdAt) }} WIB<template v-if="r.dueAt && r.status === 'open'"> · tenggat {{ formatWib(r.dueAt) }} WIB</template></p>
          <p v-if="r.reason" class="b8-small">Alasan: {{ r.reason }}</p>
          <p v-if="r.status !== 'open' && r.resolvedByName" class="el-muted b8-small">Ditutup {{ r.resolvedByName }}<template v-if="r.resolvedAt"> · {{ formatWib(r.resolvedAt) }} WIB</template></p>

          <template v-if="r.status === 'open'">
            <p v-if="r.userId === session.user?.id" class="el-muted b8-small">Permintaan Anda sendiri diproses HR lain atau Admin ETA.</p>
            <template v-else-if="r.type === 'withdraw_consent'">
              <div v-if="confirm?.id !== r.id" class="b8-row b8-gap-s">
                <UiButton size="sm" variant="outlined" :disabled="busy" @click="close(r, false)">Tutup</UiButton>
                <UiButton size="sm" variant="text" :disabled="busy" @click="ask(r.id, 'erase')">Tutup dan hapus data wawancara</UiButton>
              </div>
              <section v-else ref="panel" tabindex="-1" role="region" aria-label="Konfirmasi hapus data wawancara" class="b8-confirm">
                <p>Percakapan, temuan, dan rencana belajar dari wawancara yang persetujuannya ditarik akan dihapus. Tindakan ini tidak bisa dibatalkan.</p>
                <div class="b8-row">
                  <UiButton size="sm" :disabled="busy" @click="close(r, true)">Ya, hapus data wawancara</UiButton>
                  <UiButton size="sm" variant="text" :disabled="busy" @click="confirm = null">Batal</UiButton>
                </div>
              </section>
            </template>
            <template v-else>
              <div v-if="confirm?.id !== r.id" class="b8-row b8-gap-s">
                <UiButton size="sm" variant="outlined" :disabled="busy" @click="ask(r.id, 'account')">Hapus akun dan data karyawan</UiButton>
              </div>
              <section v-else ref="panel" tabindex="-1" role="region" aria-label="Konfirmasi hapus akun" class="b8-confirm">
                <p>Akun {{ who(r) }} beserta seluruh datanya di ELGOS dihapus. Tindakan ini tidak bisa dibatalkan.</p>
                <div class="b8-row">
                  <UiButton size="sm" :disabled="busy" @click="deleteAccount(r)">Ya, hapus akun {{ who(r) }}</UiButton>
                  <UiButton size="sm" variant="text" :disabled="busy" @click="confirm = null">Batal</UiButton>
                </div>
              </section>
            </template>
          </template>
        </UiCard>
      </li>
    </ul>
  </AppShell>
</template>
