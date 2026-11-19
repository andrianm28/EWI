<script setup lang="ts">
// Pembungkus field formulir: label, petunjuk, dan pesan galat yang tertaut ke input lewat aria-describedby.
// Input diberikan lewat slot dan memakai kelas `el-input`:
//   <UiField id="email" v-slot="{ attrs }" label="Email kerja" :error="err"><input v-bind="attrs" v-model="email" class="el-input" type="email" /></UiField>
import { computed } from 'vue'

const props = defineProps<{ id: string; label: string; hint?: string; error?: string }>()
const describedBy = computed(() => [props.hint ? `${props.id}-petunjuk` : '', props.error ? `${props.id}-galat` : ''].filter(Boolean).join(' ') || undefined)
const attrs = computed(() => ({ id: props.id, 'aria-describedby': describedBy.value, 'aria-invalid': props.error ? ('true' as const) : undefined }))
</script>

<template>
  <div class="el-field">
    <label class="el-label" :for="id">{{ label }}</label>
    <div v-if="hint" :id="`${id}-petunjuk`" class="el-field__hint">{{ hint }}</div>
    <div v-if="error" :id="`${id}-galat`" class="el-field__error"><span class="el-sr-only">Galat: </span>{{ error }}</div>
    <slot :attrs="attrs" />
  </div>
</template>

<style>
.el-field { display: flex; flex-direction: column; }
.el-field .el-input { width: 100%; }
.el-field__hint { color: var(--el-on-surface-variant); font-size: 12px; margin: -2px 0 6px; }
.el-field__error { color: var(--el-critical); font-weight: 500; margin: 0 0 6px; }
</style>
