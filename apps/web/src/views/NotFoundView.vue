<script setup lang="ts">
// Gap C9: alamat yang tidak dikenal tampil di dalam shell, bukan halaman putih.
import AppShell from '@/components/AppShell.vue'
import { UiButton } from '@/ui'
</script>

<template>
  <AppShell>
    <h1 class="el-h1" data-testid="tidak-ditemukan">Halaman tidak ditemukan</h1>
    <p class="el-muted nf__lead">Alamat ini tidak ada di ELGOS atau belum tersedia untuk peran Anda. Periksa alamatnya, atau kembali ke beranda.</p>
    <UiButton :to="{ name: 'home' }">Kembali ke beranda</UiButton>
  </AppShell>
</template>

<style scoped>
.nf__lead { margin: 0 0 16px; }
</style>
