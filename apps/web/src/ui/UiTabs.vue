<script setup lang="ts">
// Tab Material 3 dengan pola keyboard WAI-ARIA: panah kiri/kanan, Home, End.
// Panel dirender pemakai: <div role="tabpanel" :id="`${id}-panel-${key}`" :aria-labelledby="`${id}-tab-${key}`">.
import { ref } from 'vue'

const props = defineProps<{ tabs: { key: string; label: string }[]; id: string; label: string }>()
const model = defineModel<string>({ required: true })
const buttons = ref<HTMLButtonElement[]>([])

function move(e: KeyboardEvent, i: number) {
  const n = props.tabs.length
  let next = i
  if (e.key === 'ArrowRight') next = (i + 1) % n
  else if (e.key === 'ArrowLeft') next = (i - 1 + n) % n
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = n - 1
  else return
  e.preventDefault()
  model.value = props.tabs[next]!.key
  buttons.value[next]?.focus()
}
</script>

<template>
  <div class="el-tabs" role="tablist" :aria-label="label">
    <button
      v-for="(t, i) in tabs" :id="`${id}-tab-${t.key}`" :key="t.key" ref="buttons" type="button" role="tab"
      :class="['el-tab', { 'is-on': t.key === model }]" :aria-selected="t.key === model" :aria-controls="`${id}-panel-${t.key}`"
      :tabindex="t.key === model ? 0 : -1" @click="model = t.key" @keydown="move($event, i)"
    >{{ t.label }}</button>
  </div>
</template>

<style>
.el-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--el-outline-variant); margin: 16px 0; flex-wrap: wrap; }
.el-tab {
  border: 0; border-bottom: 3px solid transparent; background: transparent; height: 48px; padding: 0 20px;
  color: var(--el-on-surface-variant); font: inherit; font-weight: 500; cursor: pointer;
}
.el-tab.is-on { color: var(--el-primary); border-bottom-color: var(--el-primary); }
.el-tab:focus-visible { outline-offset: -2px; }
</style>
