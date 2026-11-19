<script setup lang="ts">
withDefaults(defineProps<{ tonal?: boolean; as?: string }>(), { tonal: false, as: 'div' })
</script>

<template>
  <component :is="as" :class="['el-card', { 'el-card--tonal': tonal }]"><slot /></component>
</template>

