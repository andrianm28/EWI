<script setup lang="ts">
// Tombol Material 3: filled (aksi utama), tonal, outlined, text. Dengan `to` menjadi RouterLink.
import type { RouteLocationRaw } from 'vue-router'
import UiIcon from './UiIcon.vue'
import type { IconName } from './icons'

withDefaults(defineProps<{
  variant?: 'filled' | 'tonal' | 'outlined' | 'text'
  size?: 'md' | 'sm'
  icon?: IconName
  to?: RouteLocationRaw
  type?: 'button' | 'submit'
  disabled?: boolean
}>(), { variant: 'filled', size: 'md', type: 'button', disabled: false })
</script>

<template>
  <RouterLink v-if="to && !disabled" :to="to" :class="['el-btn', `el-btn--${variant}`, `el-btn--${size}`]">
    <UiIcon v-if="icon" :name="icon" :size="18" /><slot />
  </RouterLink>
  <button v-else :type="type" :disabled="disabled" :class="['el-btn', `el-btn--${variant}`, `el-btn--${size}`]">
    <UiIcon v-if="icon" :name="icon" :size="18" /><slot />
  </button>
</template>

<style>
.el-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 24px;
  border-radius: 20px; border: 1px solid transparent; font: inherit; font-weight: 500; text-decoration: none;
  cursor: pointer; white-space: nowrap;
}
.el-btn--sm { height: 32px; padding: 0 16px; }
.el-btn--filled { background: var(--el-primary); color: var(--el-on-primary); }
.el-btn--tonal { background: var(--el-secondary-container); color: var(--el-on-secondary-container); }
.el-btn--outlined { background: transparent; color: var(--el-primary); border-color: var(--el-outline); }
.el-btn--text { background: transparent; color: var(--el-primary); padding: 0 12px; }
.el-btn:hover:not(:disabled) { filter: brightness(1.15); }
.el-btn--outlined:hover:not(:disabled), .el-btn--text:hover:not(:disabled) { filter: none; background: var(--el-surface-2); }
.el-btn:disabled { background: var(--el-surface-3); color: var(--el-outline); border-color: transparent; cursor: not-allowed; }
</style>
