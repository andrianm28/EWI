<script setup lang="ts">
// Lewati ke konten (GOV.UK): tersembunyi sampai mendapat fokus keyboard.
const props = withDefaults(defineProps<{ target?: string }>(), { target: '#isi' })

function go(e: Event) {
  e.preventDefault()
  const el = document.querySelector<HTMLElement>(props.target)
  el?.focus()
  el?.scrollIntoView()
}
</script>

<template>
  <a class="el-skip" :href="target" @click="go"><slot>Lewati ke konten utama</slot></a>
</template>

<style>
.el-skip { position: absolute; left: -999px; top: 8px; z-index: 100; }
.el-skip:focus { left: 8px; background: var(--el-surface-card); color: var(--el-primary); padding: 8px 12px; border-radius: 8px; }
</style>
