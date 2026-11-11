<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { SUBMODULES } from '@/modules'

const route = useRoute()
const mod = computed(() => SUBMODULES.find((m) => m.key === route.params.key))
</script>

<template>
  <AppShell>
    <h1 class="text-lg font-semibold">{{ mod?.code }} · {{ mod?.title }}</h1>
    <p class="mt-2 text-sm text-slate-600">{{ mod?.summary }}</p>
  </AppShell>
</template>
