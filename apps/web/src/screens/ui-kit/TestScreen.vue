<script setup lang="ts">
import { useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'

const route = useRoute()
</script>

<template>
  <AppShell>
    <h1 class="el-h1">Layar uji: {{ String(route.name) }}</h1>
  </AppShell>
</template>
