<script setup lang="ts">
// Ringkasan galat (GOV.UK): muncul di atas formulir, menerima fokus, tiap galat menaut ke field-nya.
import { nextTick, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ title?: string; errors: { message: string; fieldId?: string }[] }>(), { title: 'Ada masalah' })
const box = ref<HTMLElement | null>(null)

watch(() => props.errors, async (list) => {
  if (!list.length) return
  await nextTick()
  box.value?.focus()
}, { immediate: true, deep: true })

function jump(e: Event, fieldId: string) {
  e.preventDefault()
  const el = document.getElementById(fieldId)
  el?.focus()
  el?.scrollIntoView({ block: 'center' })
}
</script>

<template>
  <div v-if="errors.length" ref="box" class="el-errsum" role="alert" tabindex="-1">
    <h2 class="el-errsum__title">{{ title }}</h2>
    <ul>
      <li v-for="(e, i) in errors" :key="i">
        <a v-if="e.fieldId" :href="`#${e.fieldId}`" @click="jump($event, e.fieldId)">{{ e.message }}</a>
        <span v-else>{{ e.message }}</span>
      </li>
    </ul>
  </div>
</template>

<style>
.el-errsum {
  border: 2px solid var(--el-critical); border-radius: 12px; background: var(--el-critical-container);
  color: var(--el-on-critical-container); padding: 16px 20px; margin: 12px 0;
}
.el-errsum__title { font-size: 16px; line-height: 24px; font-weight: 500; margin: 0 0 8px; }
.el-errsum ul { margin: 0; padding-left: 20px; list-style: disc; }
.el-errsum a { color: inherit; font-weight: 500; text-decoration: underline; }
</style>
