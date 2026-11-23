<script setup lang="ts">
// Dialog modal untuk formulir sekunder (paritas P8, R2). Memakai <dialog> bawaan dengan showModal(): fokus terkurung
// di dialog, latar inert, Esc menutup, dan fokus kembali ke tombol pembuka saat ditutup. Isi dirender hanya saat terbuka.
import { nextTick, onMounted, ref, useId, watch } from 'vue'
import UiButton from './UiButton.vue'

const props = defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
const el = ref<HTMLDialogElement | null>(null)
const titleId = useId()

function sync() {
  const d = el.value
  if (!d) return
  if (props.open && !d.open) d.showModal()
  else if (!props.open && d.open) d.close()
}
watch(() => props.open, () => nextTick(sync))
onMounted(sync)
</script>

<template>
  <dialog ref="el" class="el-dialog" :aria-labelledby="titleId" @cancel.prevent="emit('close')" @close="open && emit('close')">
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
.el-dialog::backdrop { background: rgb(0 0 0 / 0.4); }
.el-dialog__head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.el-dialog__title { font-size: 20px; line-height: 28px; font-weight: 500; margin: 0; }
</style>
