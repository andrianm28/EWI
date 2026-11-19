<script setup lang="ts">
import { ICONS, type IconName } from './icons'

withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 22 })
</script>

<template>
  <svg class="el-icon" :width="size" :height="size" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false">
    <path :d="ICONS[name]" />
  </svg>
</template>

<style>
.el-icon { flex: none; display: inline-block; vertical-align: middle; }
</style>
