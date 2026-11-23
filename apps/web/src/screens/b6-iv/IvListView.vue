<script setup lang="ts">
// Daftar wawancara akar masalah milik pengguna (mockup layar `iv`, menu karyawan). Spek B6 bagian 15.
import { computed, onMounted, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { formatWib } from '@/api/lna'
import { UiCard, UiErrorSummary } from '@/ui'
import { useSessionStore } from '@/stores/session'
import { iv, isOpenListSession, listStatus, type ListSession } from './api'
import './iv.css'
import '../b5-tna/tna.css'

const session = useSessionStore()
const rows = ref<ListSession[]>([])
const error = ref('')
const loaded = ref(false)
onMounted(async () => {
  try { rows.value = (await iv.list()).data.filter((s) => s.intervieweeId === session.user?.id) } catch (e) { error.value = e instanceof ApiError ? e.message : 'Daftar wawancara tidak bisa dimuat' }
  loaded.value = true
})
const open = computed(() => rows.value.filter(isOpenListSession))
const history = computed(() => rows.value.filter((s) => !isOpenListSession(s)))
const topic = (s: ListSession) => s.focusLabel || 'Target kerja yang belum tercapai'
const duration = (s: ListSession) => (s.durationMinutes ? `${s.durationMinutes} menit` : 'sekitar 30 menit')
</script>

<template>
  <AppShell>
    <h1 class="tna-h1">Wawancara akar masalah</h1>
    <p class="el-muted">AI mewawancarai Anda tentang hambatan kerja, lalu Anda memeriksa ringkasannya sebelum dikirim ke HR.</p>
    <UiErrorSummary :errors="error ? [{ message: error }] : []" />
    <p v-if="loaded && !rows.length && !error" class="el-muted">Belum ada wawancara untuk Anda.</p>
    <section v-if="open.length" data-testid="iv-open" class="iv-list">
      <h2 class="iv-h2">Perlu dikerjakan</h2>
      <UiCard v-for="s in open" :key="s.id" class="iv-item">
        <RouterLink :to="{ name: 'iv-session', params: { id: s.id } }" class="tna-link">{{ topic(s) }}</RouterLink>
        <div class="el-muted iv-small">{{ listStatus(s) }} · {{ duration(s) }}<template v-if="s.inviteExpiresAt"> · tenggat {{ formatWib(s.inviteExpiresAt) }} WIB</template></div>
      </UiCard>
    </section>
    <section v-if="history.length" data-testid="iv-history" class="iv-list">
      <h2 class="iv-h2">Riwayat</h2>
      <UiCard v-for="s in history" :key="s.id" class="iv-item">
        <RouterLink :to="{ name: 'iv-session', params: { id: s.id } }" class="tna-link">{{ topic(s) }}</RouterLink>
        <div class="el-muted iv-small">{{ listStatus(s) }}</div>
      </UiCard>
    </section>
  </AppShell>
</template>

