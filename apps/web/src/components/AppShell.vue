<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
function logout() {
  session.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <header class="flex items-center justify-between border-b bg-white px-4 py-3">
      <RouterLink to="/" class="font-semibold text-slate-900">EWI</RouterLink>
      <button class="text-sm text-slate-600" @click="logout">Keluar</button>
    </header>
    <main class="mx-auto max-w-5xl p-4"><slot /></main>
  </div>
</template>
