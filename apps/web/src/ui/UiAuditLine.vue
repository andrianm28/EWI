<script setup lang="ts">
// Baris metadata audit monospasi, mis. "Sesi S-1042 · persetujuan v1.0 · 2 Des 2026 09.14 WIB".
defineProps<{ items?: string[] }>()
</script>

<template>
  <p class="el-audit"><slot>{{ (items ?? []).join(' · ') }}</slot></p>
</template>

<style>
.el-audit { font-family: var(--el-font-mono); font-size: 11px; line-height: 16px; color: var(--el-on-surface-variant); margin: 12px 0 0; }
</style>
