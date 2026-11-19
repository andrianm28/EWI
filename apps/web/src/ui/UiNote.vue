<script setup lang="ts">
// Catatan sebaris. Untuk galat formulir pakai UiErrorSummary.
withDefaults(defineProps<{ tone?: 'info' | 'warning' | 'critical' | 'success' }>(), { tone: 'info' })
</script>

<template>
  <div role="note" :class="['el-note', `el-note--${tone}`]"><slot /></div>
</template>

<style>
.el-note {
  border-left: 4px solid var(--el-primary); background: var(--el-primary-container); color: var(--el-on-primary-container);
  padding: 12px 16px; border-radius: 4px 12px 12px 4px;
}
.el-note--warning { border-left-color: var(--el-warning); background: var(--el-warning-container); color: var(--el-on-warning-container); }
.el-note--critical { border-left-color: var(--el-critical); background: var(--el-critical-container); color: var(--el-on-critical-container); }
.el-note--success { border-left-color: var(--el-success); background: var(--el-success-container); color: var(--el-on-success-container); }
</style>
