<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ value: number; label: string; tone?: 'primary' | 'critical' | 'success' }>(), { tone: 'primary' })
const pct = computed(() => Math.min(100, Math.max(0, Math.round(Number.isFinite(props.value) ? props.value : 0))))
</script>

<template>
  <div :class="['el-bar', `el-bar--${tone}`]" role="progressbar" :aria-label="label" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="pct">
    <i :style="{ width: `${pct}%` }" />
  </div>
</template>

<style>
.el-bar { height: 8px; border-radius: 4px; background: var(--el-surface-3); overflow: hidden; }
.el-bar i { display: block; height: 100%; background: var(--el-primary); border-radius: 4px; }
.el-bar--critical i { background: var(--el-critical); }
.el-bar--success i { background: var(--el-success); }
</style>
