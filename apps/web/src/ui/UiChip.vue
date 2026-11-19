<script setup lang="ts">
// Chip klasifikasi. Tiga jalur mockup: Training Needs, Improvement Needs, Perlu ditinjau HR; plus sukses, kritis, netral.
import UiIcon from './UiIcon.vue'
import type { IconName } from './icons'

withDefaults(defineProps<{
  tone?: 'training' | 'improvement' | 'review' | 'success' | 'critical' | 'neutral'
  icon?: IconName
}>(), { tone: 'neutral' })
</script>

<template>
  <span :class="['el-chip', `el-chip--${tone}`]"><UiIcon v-if="icon" :name="icon" :size="14" /><slot /></span>
</template>

<style>
.el-chip {
  display: inline-flex; align-items: center; gap: 4px; min-height: 26px; padding: 0 10px; border-radius: 8px;
  font-size: 12px; font-weight: 500; white-space: nowrap;
}
.el-chip--training { background: var(--el-primary-container); color: var(--el-on-primary-container); }
.el-chip--improvement { background: var(--el-tertiary-container); color: var(--el-on-tertiary-container); }
.el-chip--review { background: var(--el-warning-container); color: var(--el-on-warning-container); }
.el-chip--success { background: var(--el-success-container); color: var(--el-on-success-container); }
.el-chip--critical { background: var(--el-critical-container); color: var(--el-on-critical-container); }
.el-chip--neutral { background: var(--el-surface-3); color: var(--el-on-surface-variant); }
</style>
