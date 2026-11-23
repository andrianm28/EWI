<script setup lang="ts">
// Breadcrumb mockup (`.bc`): 12px, pemisah "›", induk dengan `to` menjadi tautan bergaris bawah warna primary.
import type { RouteLocationRaw } from 'vue-router'

defineProps<{ items: { label: string; to?: RouteLocationRaw }[] }>()
</script>

<template>
  <nav class="el-bc" aria-label="Lokasi">
    <ol>
      <li v-for="(it, i) in items" :key="i">
        <span v-if="i > 0" class="el-bc__sep" aria-hidden="true">›</span>
        <RouterLink v-if="it.to && i < items.length - 1" :to="it.to">{{ it.label }}</RouterLink>
        <span v-else :aria-current="i === items.length - 1 ? 'page' : undefined">{{ it.label }}</span>
      </li>
    </ol>
  </nav>
</template>

<style>
.el-bc { font-size: 12px; line-height: 16px; color: var(--el-on-surface-variant); margin-bottom: 8px; }
.el-bc ol { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0; padding: 0; list-style: none; }
.el-bc li { display: inline-flex; align-items: center; gap: 6px; }
.el-bc a { color: var(--el-primary); text-decoration: underline; }
</style>
