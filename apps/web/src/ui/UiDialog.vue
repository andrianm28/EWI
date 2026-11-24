<script setup lang="ts">
// Dialog modal untuk formulir sekunder (paritas P8, R2). Memakai <dialog> bawaan dengan showModal(): fokus terkurung
// di dialog, latar inert, Esc menutup, dan fokus kembali ke tombol pembuka saat ditutup. Isi dirender hanya saat terbuka.
import { nextTick, onMounted, ref, useId, watch } from 'vue'
import UiButton from './UiButton.vue'

const props = defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
const el = ref<HTMLDialogElement | null>(null)
const titleId = useId()
const FIELD = 'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])'

function sync() {
  const d = el.value
  if (!d) return
  if (props.open && !d.open) {
    d.showModal()
    // Triase P8 #7: fokus awal di field pertama, bukan tombol Tutup; tanpa field, perilaku bawaan showModal
    d.querySelector<HTMLElement>(FIELD)?.focus()
  }
  else if (!props.open && d.open) d.close()
}
// <dialog> modal membuat latar inert, tetapi Tab dari elemen terakhir keluar ke UI peramban; putar di dalam dialog
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
function trapTab(e: KeyboardEvent) {
  const d = el.value
  if (e.key !== 'Tab' || !d) return
  const items = [...d.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement)
  if (!items.length) return
  const first = items[0]!
  const last = items[items.length - 1]!
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}
watch(() => props.open, () => nextTick(sync))
onMounted(sync)
</script>

<template>
  <dialog ref="el" class="el-dialog" :aria-labelledby="titleId" @cancel.prevent="emit('close')" @keydown="trapTab" @close="open && emit('close')">
    <template v-if="open">
      <div class="el-dialog__head">
        <h2 :id="titleId" class="el-dialog__title">{{ title }}</h2>
        <UiButton variant="text" size="sm" icon="close" aria-label="Tutup" @click="emit('close')" />
      </div>
      <slot />
    </template>
  </dialog>
</template>

<style>
.el-dialog {
  position: fixed; inset: 0; margin: auto; height: fit-content;
  width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow: auto; padding: 24px;
  border: 1px solid var(--el-outline-variant); border-radius: 16px; background: var(--el-surface-card); color: var(--el-on-surface);
}
.el-dialog::backdrop { background: var(--el-scrim); }
/* modern-web-guidance `dialog`: gulir di dialog atau di atas backdrop tidak berantai ke halaman di belakangnya.
   Peningkatan progresif (tanpa fallback); jangan mengunci gulir dengan overflow: hidden di html/body. */
.el-dialog:modal { overscroll-behavior: contain; }
.el-dialog::backdrop { overflow: hidden; overscroll-behavior: contain; }
.el-dialog__head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.el-dialog__title { font-size: 20px; line-height: 28px; font-weight: 500; margin: 0; }
</style>
