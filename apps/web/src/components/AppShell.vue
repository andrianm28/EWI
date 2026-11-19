<script setup lang="ts">
// Kerangka aplikasi ELGOS (mockup Pak Eji): drawer + top bar + konten. Halaman membungkus isinya dengan <AppShell>.
import { ref, watch, type Component } from 'vue'
import { useRoute } from 'vue-router'
import AppDrawer from './AppDrawer.vue'
import AppTopBar from './AppTopBar.vue'
import { UiSkipLink } from '@/ui'

const route = useRoute()
const drawerOpen = ref(false)
watch(() => route.fullPath, () => { drawerOpen.value = false })

function closeDrawer() {
  if (!drawerOpen.value) return
  drawerOpen.value = false
  document.getElementById('tombol-menu')?.focus()
}

// Titik sambung untuk elemen yang melayang di atas semua layar, mis. Asisten ELGOS (B17):
// paket menaruh src/screens/<paket>/ShellExtra.vue dan shell memasangnya tanpa perlu diedit.
const extras = Object.entries(import.meta.glob<{ default: Component }>('@/screens/*/ShellExtra.vue', { eager: true }))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, mod]) => ({ path, component: mod.default }))
</script>

<template>
  <div class="el-app" @keydown.esc="closeDrawer">
    <UiSkipLink />
    <AppDrawer :open="drawerOpen" @close="closeDrawer" />
    <div v-if="drawerOpen" class="el-app__scrim" @click="closeDrawer" />
    <div class="el-app__main">
      <AppTopBar :drawer-open="drawerOpen" @toggle-drawer="drawerOpen = !drawerOpen" />
      <main id="isi" class="el-app__content" tabindex="-1"><slot /></main>
    </div>
    <component :is="x.component" v-for="x in extras" :key="x.path" />
  </div>
</template>

<style>
.el-app { display: flex; min-height: 100vh; }
.el-app__main { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; }
.el-app__content { padding: 24px; max-width: 1280px; width: 100%; }
.el-app__content:focus { outline: none; }
.el-app__scrim { display: none; }
@media (max-width: 900px) {
  .el-app__content { padding: 16px; }
  .el-app__scrim { display: block; position: fixed; inset: 0; background: rgb(0 0 0 / 0.4); z-index: 30; }
}
</style>
