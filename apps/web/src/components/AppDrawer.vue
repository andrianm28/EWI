<script setup lang="ts">
// Navigation drawer accordion (Material 3). Isi menu dari src/shell/menu.ts sesuai tampilan aktif.
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { buildMenu, menuContext, openGroups } from '@/shell/menu'
import { theme, toggleTheme } from '@/shell/theme'
import { UiIcon } from '@/ui'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const session = useSessionStore()
const route = useRoute()

const menu = computed(() => buildMenu(menuContext(session)))

// Rute sesi wawancara lama (/m/:key/sessions/:id) menyalakan butir submodulnya
const activeKey = computed(() => route.meta.menuKey ?? (route.name === 'interview' ? String(route.params.key) : String(route.name ?? '')))

// Layar sempit: saat drawer dibuka, fokus pindah ke butir pertama
const root = ref<HTMLElement | null>(null)
watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  root.value?.querySelector<HTMLElement>('a, button')?.focus()
})
</script>

<template>
  <nav id="navigasi-utama" ref="root" :class="['el-drawer', { 'is-open': open }]" aria-label="Navigasi utama">
    <div class="el-drawer__brand">
      <div class="el-drawer__logo" aria-hidden="true">EG</div>
      <div>
        <div class="el-drawer__name">ELGOS</div>
        <div class="el-drawer__sub">Elite Learning &amp; Growth OS</div>
      </div>
    </div>
    <ul class="el-drawer__list">
      <template v-for="e in menu" :key="`${e.type}-${e.key}`">
        <li v-if="e.type === 'item'">
          <RouterLink :to="{ name: e.key }" :class="['el-nav', { 'is-active': e.key === activeKey }]" :aria-current="e.key === activeKey ? 'page' : undefined" @click="emit('close')">
            <UiIcon :name="e.icon" /><span>{{ e.label }}</span>
          </RouterLink>
        </li>
        <li v-else>
          <button type="button" class="el-nav" :aria-expanded="openGroups[e.key]" :aria-controls="`nav-grup-${e.key}`" @click="openGroups[e.key] = !openGroups[e.key]">
            <UiIcon :name="e.icon" /><span>{{ e.label }}</span><UiIcon :name="openGroups[e.key] ? 'expand_less' : 'expand_more'" :size="20" />
          </button>
          <ul v-show="openGroups[e.key]" :id="`nav-grup-${e.key}`" class="el-drawer__list">
            <li v-for="c in e.children" :key="c.key">
              <RouterLink :to="{ name: c.key }" :class="['el-nav el-nav--l1', { 'is-active': c.key === activeKey }]" :aria-current="c.key === activeKey ? 'page' : undefined" @click="emit('close')">
                <UiIcon :name="c.icon" /><span>{{ c.label }}</span>
              </RouterLink>
            </li>
          </ul>
        </li>
      </template>
    </ul>
    <div class="el-drawer__foot">
      <!-- Mode gelap bukan bagian mockup (spek B0 bagian 3); diletakkan di kaki drawer agar top bar tetap seperti mockup -->
      <button type="button" class="el-nav" :aria-pressed="theme === 'dark'" @click="toggleTheme">
        <UiIcon :name="theme === 'dark' ? 'light_mode' : 'dark_mode'" /><span>Mode gelap</span>
      </button>
    </div>
  </nav>
</template>

<style>
.el-drawer {
  flex: 0 0 280px; width: 280px; background: var(--el-surface-1); border-right: 1px solid var(--el-outline-variant);
  padding: 16px 12px; display: flex; flex-direction: column; gap: 2px; overflow-y: auto;
}
.el-drawer__brand { display: flex; align-items: center; gap: 12px; padding: 8px 12px 16px; }
.el-drawer__logo {
  width: 40px; height: 40px; border-radius: 12px; background: var(--el-primary); color: var(--el-on-primary);
  display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px; letter-spacing: 0.5px;
}
.el-drawer__name { font-weight: 500; font-size: 16px; }
.el-drawer__sub { font-size: 12px; color: var(--el-on-surface-variant); }
.el-drawer__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.el-nav {
  display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 0 16px; border-radius: 28px; border: 0;
  background: transparent; color: var(--el-on-surface-variant); text-align: left; width: 100%; font: inherit;
  text-decoration: none; cursor: pointer;
}
.el-nav > span { flex: 1; }
.el-nav:hover { background: var(--el-surface-3); }
.el-nav.is-active { background: var(--el-secondary-container); color: var(--el-on-secondary-container); font-weight: 500; }
.el-drawer__foot { margin-top: auto; padding-top: 12px; }
.el-nav--l1 { margin-left: 12px; width: calc(100% - 12px); min-height: 44px; }
.el-nav:focus-visible { outline-offset: -2px; }

@media (max-width: 900px) {
  .el-drawer { display: none; position: fixed; inset: 0 auto 0 0; z-index: 40; max-width: 86vw; box-shadow: var(--el-shadow); }
  .el-drawer.is-open { display: flex; }
}
</style>
