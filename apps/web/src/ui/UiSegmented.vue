<script setup lang="ts">
// Segmented button Material 3, dipakai untuk ganti tampilan di top bar.
defineProps<{ options: { key: string; label: string }[]; label: string }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="el-seg" role="group" :aria-label="label">
    <button v-for="o in options" :key="o.key" type="button" :class="{ 'is-on': o.key === model }" :aria-pressed="o.key === model" @click="model = o.key">
      {{ o.label }}
    </button>
  </div>
</template>

<style>
.el-seg { display: inline-flex; border: 1px solid var(--el-outline); border-radius: 20px; overflow: hidden; }
.el-seg button {
  border: 0; border-right: 1px solid var(--el-outline); background: transparent; padding: 0 14px; height: 36px;
  color: var(--el-on-surface); font: inherit; cursor: pointer; white-space: nowrap;
}
.el-seg button:last-child { border-right: 0; }
.el-seg button.is-on { background: var(--el-secondary-container); color: var(--el-on-secondary-container); font-weight: 500; }
.el-seg button:focus-visible { outline-offset: -2px; }
</style>
