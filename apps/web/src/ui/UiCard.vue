<script setup lang="ts">
withDefaults(defineProps<{ tonal?: boolean; as?: string }>(), { tonal: false, as: 'div' })
</script>

<template>
  <component :is="as" :class="['el-card', { 'el-card--tonal': tonal }]"><slot /></component>
</template>

<style>
.el-card { background: var(--el-surface-card); border: 1px solid var(--el-outline-variant); border-radius: 16px; padding: 20px; }
.el-card--tonal { background: var(--el-surface-1); }
</style>
