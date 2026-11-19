<script setup lang="ts">
defineProps<{ label: string; value: string | number; note?: string }>()
</script>

<template>
  <div class="el-card el-kpi">
    <div class="el-kpi__label">{{ label }}</div>
    <div class="el-kpi__value">{{ value }}</div>
    <div v-if="note || $slots.default" class="el-kpi__note"><slot>{{ note }}</slot></div>
  </div>
</template>

<style>
.el-kpi__label { color: var(--el-on-surface-variant); font-size: 12px; letter-spacing: 0.4px; text-transform: uppercase; }
.el-kpi__value { font-size: 32px; line-height: 40px; font-weight: 400; }
.el-kpi__note { color: var(--el-on-surface-variant); font-size: 12px; }
</style>
