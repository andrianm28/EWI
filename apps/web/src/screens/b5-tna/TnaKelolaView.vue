<script setup lang="ts">
// Kelola TNA (paritas P5, TN-2): pengelolaan TNA lama dipindah dari bawah papan gap supaya `/tna` sama dengan mockup.
// Gerbang rute sama dengan `tna`; otorisasi data tetap di API. Spek: docs/designs/paritas-mockup/p5-lna.md.
import { watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { UiBreadcrumb } from '@/ui'
import TnaPengelolaan from './TnaPengelolaan.vue'
import { useShowBoard } from './board'
import './tna.css'

// Tanpa papan, pengelolaan memang tampil di `/tna` (karyawan, flag papan mati): alihkan ke sana (triase P5)
const showBoard = useShowBoard()
const router = useRouter()
watchEffect(() => { if (!showBoard.value) void router.replace({ name: 'tna' }) })
</script>

<template>
  <AppShell>
    <UiBreadcrumb :items="[{ label: 'Learning Needs Analysis' }, { label: 'Training Needs', to: { name: 'tna' } }, { label: 'Kelola TNA' }]" />
    <h1 class="tna-h1">Kelola TNA</h1>
    <TnaPengelolaan v-if="showBoard" />
  </AppShell>
</template>
