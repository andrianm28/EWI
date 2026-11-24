<script setup lang="ts">
// B9: pengingat melayang untuk pemilik tindakan yang punya verifikasi AI menunggu. Pemilik bisa berperan apa pun
// (termasuk karyawan, yang tidak punya butir menu Improvement Needs), jadi pintu masuknya ada di sini.
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ina } from '@/api/ina'
import { useSessionStore } from '@/stores/session'
import { UiButton } from '@/ui'

const session = useSessionStore()
const route = useRoute()
const pending = ref(0)

async function refresh() {
  pending.value = 0
  // Super Admin tidak membuka isi data karyawan (API: denyEmployeeContent), jadi tidak bertanya ke /ina sama sekali
  if (session.activeView === 'super') return
  if (!session.canOpen('ina') || session.access?.flags['ina.ai_verification'] !== true) return
  try { pending.value = (await ina.me()).data.pendingVerifications } catch { /* pengingat bersifat tambahan */ }
}
onMounted(refresh)
watch(() => route.name, refresh)
</script>

<template>
  <aside v-if="pending > 0 && route.name !== 'ina-verifikasi'" class="ina-extra" aria-label="Verifikasi tindakan perbaikan" data-testid="ina-pengingat">
    <span>{{ pending }} verifikasi tindakan perbaikan menunggu jawaban Anda.</span>
    <UiButton size="sm" :to="{ name: 'ina-verifikasi' }">Buka</UiButton>
  </aside>
</template>

<style scoped>
.ina-extra {
  /* posisi diatur kolom tambahan shell di AppShell (P9 CD-2) */
  display: flex; gap: 12px; align-items: center; max-width: 360px;
  padding: 12px 16px; border-radius: 16px; background: var(--el-surface); color: var(--el-on-surface);
  border: 1px solid var(--el-outline-variant); box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
}
</style>
