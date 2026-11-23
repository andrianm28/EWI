<script setup lang="ts">
// Segmented button Material 3, dipakai untuk ganti tampilan di top bar.
// variant="chips": tombol terpisah gaya `.rad` mockup (pilihan klasifikasi di Tinjauan HR, B7).
// Opsi `disabled` tidak bisa dipilih; model kosong ('') berarti belum ada pilihan.
withDefaults(defineProps<{
  options: { key: string; label: string; disabled?: boolean }[]
  label: string
  variant?: 'joined' | 'chips'
}>(), { variant: 'joined' })
const model = defineModel<string>({ required: true })
</script>

<template>
  <div :class="['el-seg', { 'el-seg--chips': variant === 'chips' }]" role="group" :aria-label="label">
    <button
      v-for="o in options" :key="o.key" type="button" :class="{ 'is-on': o.key === model }" :aria-pressed="o.key === model"
      :disabled="o.disabled" @click="model = o.key"
    >
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
.el-seg button:disabled { cursor: not-allowed; color: var(--el-outline); }
.el-seg--chips { border: 0; border-radius: 0; overflow: visible; gap: 6px; flex-wrap: wrap; }
.el-seg--chips button {
  border: 1px solid var(--el-outline); border-radius: 8px; height: 32px; padding: 0 12px; background: var(--el-surface-card);
}
.el-seg--chips button:last-child { border-right: 1px solid var(--el-outline); }
.el-seg--chips button.is-on { border-color: var(--el-primary); }
.el-seg--chips button:focus-visible { outline-offset: 2px; }
</style>
