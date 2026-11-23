<script setup lang="ts">
// Top app bar: judul layar, tenant, pil audit, ganti tampilan, identitas, tema, keluar.
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { homeFor } from '@/router'
import { menuLabel } from '@/shell/menu'
import { theme, toggleTheme } from '@/shell/theme'
import { VIEW_LABEL, type ViewKey } from '@/shell/views'
import { UiButton, UiIcon, UiSegmented } from '@/ui'

defineProps<{ drawerOpen: boolean }>()
const emit = defineEmits<{ toggleDrawer: [] }>()

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

const title = computed(() => {
  if (route.meta.title) return route.meta.title
  const key = route.meta.menuKey ?? String(route.name ?? '')
  return menuLabel(key, session.activeView) ?? 'ELGOS'
})

const tenantLine = computed(() => (session.activeView === 'super' ? 'Konsol platform ELGOS · semua tenant' : session.user?.tenantName ?? ''))

// Akun multi-peran melihat tampilan karyawannya sebagai "Karyawan (saya)", seperti di mockup
const viewOptions = computed(() => session.views.map((v) => ({
  key: v,
  label: v === 'karyawan' && session.views.length > 1 ? 'Karyawan (saya)' : VIEW_LABEL[v],
})))

const view = computed({
  get: () => session.activeView as string,
  set: (v: string) => {
    session.setView(v as ViewKey)
      .then(() => router.push({ name: homeFor(session.activeView, session) }))
      .catch(() => { /* sesi berubah di tab lain atau dicabut: penangan 401 membawa ke login */ })
  },
})

function logout() {
  session.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <header class="el-top">
    <button id="tombol-menu" type="button" class="el-top__menu" aria-controls="navigasi-utama" :aria-expanded="drawerOpen" @click="emit('toggleDrawer')">
      <UiIcon :name="drawerOpen ? 'close' : 'menu'" /><span class="el-sr-only">Menu</span>
    </button>
    <div class="el-top__title">
      <div data-testid="judul-layar">{{ title }}</div>
      <div v-if="tenantLine" class="el-top__tenant">{{ tenantLine }}</div>
    </div>
    <span class="el-pill"><UiIcon name="verified_user" :size="16" />Log audit aktif</span>
    <div v-if="viewOptions.length > 1" class="el-top__views">
      <span class="el-top__tenant">Tampilan:</span>
      <UiSegmented v-model="view" :options="viewOptions" label="Tampilan" />
    </div>
    <span v-if="session.user" class="el-pill" data-testid="identitas"><UiIcon name="person" :size="16" />{{ VIEW_LABEL[session.activeView] }} · {{ session.user.email }}</span>
    <button type="button" class="el-top__theme" :aria-pressed="theme === 'dark'" @click="toggleTheme">
      <UiIcon :name="theme === 'dark' ? 'light_mode' : 'dark_mode'" :size="20" /><span class="el-sr-only">Mode gelap</span>
    </button>
    <UiButton variant="outlined" size="sm" icon="logout" @click="logout">Keluar</UiButton>
  </header>
</template>

<style>
.el-top {
  min-height: 64px; background: var(--el-surface-card); border-bottom: 1px solid var(--el-outline-variant);
  display: flex; align-items: center; gap: 12px 16px; padding: 8px 24px; flex-wrap: wrap;
}
.el-top__title { flex: 1 1 200px; font-weight: 500; min-width: 0; }
.el-top__tenant { font-size: 12px; font-weight: 400; color: var(--el-on-surface-variant); }
.el-top__views { display: flex; align-items: center; gap: 6px; }
.el-top__menu, .el-top__theme {
  width: 40px; height: 40px; border-radius: 20px; border: 0; background: transparent; color: var(--el-on-surface-variant);
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
}
.el-top__menu:hover, .el-top__theme:hover { background: var(--el-surface-2); }
.el-top__menu { display: none; }
@media (max-width: 900px) {
  .el-top { padding: 8px 16px; }
  .el-top__menu { display: inline-flex; }
}
</style>
