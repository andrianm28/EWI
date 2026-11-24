<script setup lang="ts">
// Kartu "Wawancara untuk Anda": sesi TNA milik pengguna yang belum selesai. Dipakai pengelolaan TNA lama dan, sejak
// keputusan user 23 Nov, di bawah papan gap supaya atasan tetap menemukan sesinya di /tna (membatalkan K-P5-4).
import { computed } from 'vue'
import { UiButton, UiCard } from '@/ui'
import { formatWib, type Session } from '@/api/lna'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ sessions: Session[] }>()
const session = useSessionStore()
const mine = computed(() => props.sessions.filter((s) => s.intervieweeId === session.user?.id && s.status !== 'completed'))
const isExpired = (s: Session) => !!s.inviteExpiresAt && new Date(s.inviteExpiresAt).getTime() <= Date.now()
</script>

<template>
  <UiCard v-if="mine.length" tonal data-testid="tna-my-sessions">
    <h2 class="tna-h2">Wawancara untuk Anda</h2>
    <p class="el-muted">Sekitar 30 menit, membahas target yang belum tercapai.</p>
    <div v-for="s in mine" :key="s.id" class="tna-session">
      <p v-if="s.status === 'scheduled' && isExpired(s)" class="tna-crit">Undangan sudah berakhir. Minta HR memperpanjang undangan Anda.</p>
      <UiButton v-else size="sm" :to="`/iv/${s.id}`">{{ s.status === 'scheduled' ? 'Mulai wawancara' : 'Lanjutkan wawancara' }}</UiButton>
      <p v-if="s.inviteExpiresAt && !isExpired(s)" class="el-muted tna-small">Undangan berlaku sampai {{ formatWib(s.inviteExpiresAt) }} WIB.</p>
    </div>
  </UiCard>
</template>
