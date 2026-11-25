<script setup lang="ts">
// Tab Material 3 dengan pola keyboard WAI-ARIA: panah kiri/kanan, Home, End.
// Panel dirender pemakai: <div role="tabpanel" :id="`${id}-panel-${key}`" :aria-labelledby="`${id}-tab-${key}`">.
// Tanpa aria-controls (modern-web-guidance `tabs`): pembaca layar tidak memakainya, dan panel yang tidak terpilih
// tidak dirender (v-if) sehingga IDREF-nya menggantung.
import { computed } from 'vue'

const props = defineProps<{ tabs: { key: string; label: string }[]; id: string; label: string }>()
const model = defineModel<string>({ required: true })
// Tab yang bisa dicapai Tab: yang terpilih, atau yang pertama bila nilai model tidak cocok dengan tab mana pun
const reachable = computed(() => (props.tabs.some((t) => t.key === model.value) ? model.value : props.tabs[0]?.key))

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
  document.getElementById(`${props.id}-tab-${props.tabs[next]!.key}`)?.focus()
}
</script>

<template>
  <div class="el-tabs" role="tablist" :aria-label="label">
    <button
      v-for="(t, i) in tabs" :id="`${id}-tab-${t.key}`" :key="t.key" type="button" role="tab"
      :class="['el-tab', { 'is-on': t.key === model }]" :aria-selected="t.key === model"
      :tabindex="t.key === reachable ? 0 : -1" @click="model = t.key" @keydown="move($event, i)"
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
