<script setup lang="ts">
// Kelola TNA (paritas P5, TN-2): pengelolaan TNA lama dipindah dari bawah papan gap supaya `/tna` sama dengan mockup.
// Gerbang rute sama dengan `tna`; otorisasi data tetap di API. Spek: docs/designs/paritas-mockup/p5-lna.md.
import AppShell from '@/components/AppShell.vue'
import { UiBreadcrumb } from '@/ui'
import TnaPengelolaan from './TnaPengelolaan.vue'
import './tna.css'
</script>

<template>
  <AppShell>
    <UiBreadcrumb :items="[{ label: 'Learning Needs Analysis' }, { label: 'Training Needs', to: { name: 'tna' } }, { label: 'Kelola TNA' }]" />
    <h1 class="tna-h1">Kelola TNA</h1>
    <TnaPengelolaan />
  </AppShell>
</template>
