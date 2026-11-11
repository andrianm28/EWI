<script setup lang="ts">
import AppShell from '@/components/AppShell.vue'
import { SUBMODULES } from '@/modules'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
</script>

<template>
  <AppShell>
    <h1 class="mb-4 text-lg font-semibold">Learning Needs Analysis</h1>
    <ul class="grid gap-3 sm:grid-cols-2">
      <li v-for="m in SUBMODULES" :key="m.key" :data-testid="`card-${m.key}`" class="rounded-lg border bg-white p-4">
        <div class="flex items-center justify-between">
          <span class="font-medium">{{ m.code }} · {{ m.title }}</span>
          <span v-if="!session.canOpen(m.key)" class="text-xs text-slate-400">Belum aktif</span>
        </div>
        <p class="mt-1 text-sm text-slate-600">{{ m.summary }}</p>
        <RouterLink v-if="session.canOpen(m.key)" :to="`/m/${m.key}`" class="mt-3 inline-block text-sm text-blue-700">Buka</RouterLink>
      </li>
    </ul>
  </AppShell>
</template>
