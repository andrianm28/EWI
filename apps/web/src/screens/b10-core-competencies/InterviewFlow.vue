<script setup lang="ts">
// Empat langkah alur wawancara berjenjang (mockup); langkah milik tampilan aktif ditonjolkan.
import { UiCard, UiChip } from '@/ui'
defineProps<{ active: 1 | 2 | 3 }>()
const STEPS = [
  { t: 'HR menugaskan', d: 'Topik visi, misi, nilai ke atasan' },
  { t: 'Atasan diwawancarai', d: 'AI mewawancarai pimpinan, seperti DACUM untuk pimpinan' },
  { t: 'Atasan menugaskan karyawan', d: 'Karyawan diwawancarai untuk menilai gap' },
  { t: 'AI menyintesis, HR meninjau', d: 'Hasil masuk ke Core Competencies' },
]
</script>

<template>
  <ol class="el-grid el-grid-4 cc-flow" aria-label="Alur wawancara AI">
    <UiCard v-for="(s, i) in STEPS" :key="s.t" as="li" :tonal="i + 1 !== active" :aria-current="i + 1 === active ? 'step' : undefined">
      <UiChip :tone="i + 1 === active ? 'training' : 'neutral'">Langkah {{ i + 1 }}</UiChip>
      <div style="font-weight: 500; margin-top: 8px">{{ s.t }}</div>
      <div class="el-muted cc-small">{{ s.d }}</div>
    </UiCard>
  </ol>
</template>

<style>
.cc-flow { list-style: none; padding: 0; margin: 0 0 16px; }
</style>
