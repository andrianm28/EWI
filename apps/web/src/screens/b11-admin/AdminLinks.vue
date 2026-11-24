<script setup lang="ts">
// Tautan antar tiga layar Admin Tenant, hanya untuk tampilan selain `admin` (Super Admin yang membuka /admin/*
// lewat alamat). Tampilan `admin` memakai menu laci yang 1:1 dengan mockup, jadi baris ini tidak tampil di sana (P7 ADM-1).
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session'

defineProps<{ current: 'users' | 'jobs' | 'cfg' }>()
const session = useSessionStore()
const show = computed(() => session.activeView !== 'admin')
const LINKS = [{ name: 'users', label: 'Pengguna & peran' }, { name: 'jobs', label: 'Jabatan & kamus kompetensi' }, { name: 'cfg', label: 'Impor data & integrasi' }] as const
</script>

<template>
  <nav v-if="show" class="adm-links" aria-label="Layar Admin Tenant">
    <RouterLink v-for="l in LINKS" :key="l.name" :to="{ name: l.name }" :aria-current="l.name === current ? 'page' : undefined">{{ l.label }}</RouterLink>
  </nav>
</template>

<style scoped>
.adm-links { display: flex; gap: 16px; flex-wrap: wrap; margin: 0 0 12px; font-size: 13px; }
.adm-links a { color: var(--el-primary); }
.adm-links a[aria-current='page'] { color: var(--el-on-surface); font-weight: 500; text-decoration: none; }
</style>
