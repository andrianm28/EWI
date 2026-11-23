<script setup lang="ts">
// B15 tahap 3: daftar wawancara ulang milik karyawan (rencana yang menjadwalkannya) dan sesinya. Spek bagian 12.4.
import { onMounted, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { ApiError } from '@/api/client'
import { UiButton, UiCard, UiNote, UiStatus } from '@/ui'
import { lim, type MyReinterview } from './api'
import { tanggal } from './labels'
import ReinterviewSession from './ReinterviewSession.vue'
import './lim.css'

const list = ref<MyReinterview[] | null>(null)
const open = ref<string | null>(null)
const error = ref('')
const STATUS = { open: { text: 'Siap dimulai', tone: 'info' }, in_progress: { text: 'Sedang berjalan', tone: 'warning' }, completed: { text: 'Selesai', tone: 'success' } } as const

async function load() {
  try { list.value = (await lim.mine()).data } catch (e) { error.value = e instanceof ApiError ? e.message : 'Wawancara ulang tidak bisa dimuat' }
}
onMounted(load)
function back() { open.value = null; load() }
</script>

<template>
  <AppShell>
    <h1 class="el-h1">Wawancara ulang</h1>
    <p class="el-muted">Beberapa pekan setelah pelatihan, asisten AI menanyakan bagaimana Anda memakai hasil belajar di pekerjaan. Ini bukan penilaian kinerja.</p>
    <UiNote v-if="error" tone="critical" data-testid="galat">{{ error }}</UiNote>

    <template v-if="open">
      <UiButton variant="text" size="sm" @click="back">Kembali ke daftar</UiButton>
      <UiCard class="lim-gap" as="section" aria-label="Sesi wawancara ulang">
        <ReinterviewSession :plan-id="open" @finished="load" />
      </UiCard>
    </template>
    <template v-else-if="list">
      <UiNote v-if="!list.length" class="lim-gap">Belum ada wawancara ulang untuk Anda. HR menjadwalkannya 4 sampai 6 pekan setelah pelatihan selesai.</UiNote>
      <UiCard v-for="x in list" :key="x.planId" class="lim-gap" as="section" :aria-label="x.planTitle" data-testid="wu-rencana">
        <div class="lim-row">
          <div>
            <h2 class="el-h3">{{ x.planTitle }}</h2>
            <p v-if="x.competencies.length" class="el-muted lim-small">Kompetensi: {{ x.competencies.join(', ') }}</p>
            <p v-if="x.scheduledOn" class="el-muted lim-small">Dijadwalkan {{ tanggal(x.scheduledOn) }}. Anda boleh mulai lebih awal.</p>
          </div>
          <div class="lim-actions">
            <UiStatus :tone="STATUS[x.status].tone">{{ STATUS[x.status].text }}</UiStatus>
            <UiButton size="sm" :variant="x.status === 'completed' ? 'outlined' : 'filled'" @click="open = x.planId">
              {{ x.status === 'open' ? 'Mulai' : x.status === 'in_progress' ? 'Lanjutkan' : 'Lihat' }}
            </UiButton>
          </div>
        </div>
      </UiCard>
    </template>
  </AppShell>
</template>
