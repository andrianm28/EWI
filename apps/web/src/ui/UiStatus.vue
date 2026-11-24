<script setup lang="ts">
// Label status: selalu ikon + teks, tidak pernah warna saja (prinsip mockup untuk perbankan).
import { computed } from 'vue'
import UiIcon from './UiIcon.vue'
import type { IconName } from './icons'
import type { StatusTone as Tone } from './tones'

const props = withDefaults(defineProps<{ tone?: Tone; icon?: IconName }>(), { tone: 'neutral' })

const DEFAULT_ICON: Record<Tone, IconName> = {
  success: 'check_circle',
  warning: 'warning',
  critical: 'error',
  info: 'info',
  neutral: 'pending',
}
const iconName = computed(() => props.icon ?? DEFAULT_ICON[props.tone])
</script>

<template>
  <span :class="['el-status', `el-status--${tone}`]"><UiIcon :name="iconName" :size="16" /><span><slot /></span></span>
</template>

<style>
.el-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; }
.el-status--success { color: var(--el-success); }
.el-status--warning { color: var(--el-warning); }
.el-status--critical { color: var(--el-critical); }
.el-status--info { color: var(--el-primary); }
.el-status--neutral { color: var(--el-on-surface-variant); }
</style>
