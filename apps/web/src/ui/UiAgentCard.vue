<script setup lang="ts">
// Kartu "Agen AI · …" mockup (`.card.t`): judul tebal, chip Pilot, teks muted, tombol tonal kecil di kanan.
// Tombol hanya ada bila pemanggil memberi `action` dan `to` (pemanggil memeriksa rute/flag dengan routeOpen).
import type { RouteLocationRaw } from 'vue-router'
import UiButton from './UiButton.vue'
import UiChip from './UiChip.vue'

defineProps<{
  title: string
  action?: string
  to?: RouteLocationRaw | null
}>()
</script>

<template>
  <div class="el-card el-card--tonal el-agent">
    <div class="el-agent__text">
      <div class="el-agent__head">
        <h2 class="el-agent__title">Agen AI · {{ title }}</h2>
        <UiChip tone="review">Pilot</UiChip>
      </div>
      <div class="el-muted el-agent__body"><slot /></div>
    </div>
    <UiButton v-if="action && to" variant="tonal" size="sm" :to="to">{{ action }}</UiButton>
  </div>
</template>

<style>
.el-agent { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin: 0 0 16px; }
.el-agent__text { min-width: 0; }
.el-agent__head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.el-agent__title { margin: 0; font-size: 14px; line-height: 20px; font-weight: 500; }
.el-agent__body { margin-top: 4px; }
@media (max-width: 600px) { .el-agent { flex-direction: column; align-items: flex-start; } }
</style>
