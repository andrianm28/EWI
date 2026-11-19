<script setup lang="ts">
// Stepper alur (mis. wawancara: persetujuan → percakapan → ringkasan → terkirim).
import { computed } from 'vue'
import UiIcon from './UiIcon.vue'

const props = defineProps<{ steps: { key: string; label: string }[]; current: string; label: string }>()
const at = computed(() => props.steps.findIndex((s) => s.key === props.current))
</script>

<template>
  <ol class="el-steps" :aria-label="label">
    <li
      v-for="(s, i) in steps" :key="s.key"
      :class="['el-step', { 'is-on': i === at, 'is-done': i < at }]" :aria-current="i === at ? 'step' : undefined"
    >
      <b><UiIcon v-if="i < at" name="check" :size="16" /><template v-else>{{ i + 1 }}</template></b>
      <span>{{ s.label }}<span v-if="i < at" class="el-sr-only"> (selesai)</span></span>
    </li>
  </ol>
</template>

<style>
.el-steps { display: flex; flex-direction: column; gap: 4px; list-style: none; margin: 0; padding: 0; }
.el-step { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; color: var(--el-on-surface-variant); }
.el-step b {
  width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--el-outline); display: flex;
  align-items: center; justify-content: center; font-weight: 500; flex: none;
}
.el-step.is-on { background: var(--el-secondary-container); color: var(--el-on-secondary-container); font-weight: 500; }
.el-step.is-on b { background: var(--el-primary); color: var(--el-on-primary); border-color: var(--el-primary); }
.el-step.is-done b { background: var(--el-success); color: var(--el-surface-card); border-color: var(--el-success); }
</style>
