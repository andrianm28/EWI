<script setup lang="ts">
// Tautan antar layar Admin Tenant: ketiga layar saling menautkan di sini.
defineProps<{ current: 'users' | 'jobs' | 'cfg' }>()
const LINKS = [{ name: 'users', label: 'Pengguna & peran' }, { name: 'jobs', label: 'Jabatan & kamus kompetensi' }, { name: 'cfg', label: 'Impor data & integrasi' }] as const
</script>

<template>
  <nav class="adm-nav" aria-label="Layar Admin Tenant">
    <RouterLink v-for="l in LINKS" :key="l.name" :to="{ name: l.name }" class="el-pill" :aria-current="l.name === current ? 'page' : undefined">{{ l.label }}</RouterLink>
  </nav>
</template>

<style scoped>
.adm-nav { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 16px; }
.adm-nav a { text-decoration: none; }
.adm-nav a[aria-current='page'] { background: var(--el-secondary-container); font-weight: 500; }
</style>
