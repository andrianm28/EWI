<script setup lang="ts">
// B17 Asisten ELGOS: FAB + panel chat di semua layar ber-shell (mockup Pak Eji, `.fab`/`.asst`).
// Dipasang AppShell lewat glob (B0 5.3). Gerbang: flag `assistant` dan tampilan karyawan/atasan/hr (bukan super, keputusan user 23 Nov).
// Spek: docs/designs/paritas-mockup/b17-asisten-web.md, docs/designs/b17-asisten-elgos.md
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { UiButton, UiIcon } from '@/ui'
import { routeOpen } from '@/router'
import { useSessionStore } from '@/stores/session'
import { VIEW_LABEL } from '@/shell/views'
import type { AssistantView } from '@/api/assistant'
import { useAsistenStore } from './store'

// Keputusan user 23 Nov: tidak di tampilan Super Admin; eta_admin memakainya dari tampilan HR tenant
const ASSISTANT_VIEWS: readonly AssistantView[] = ['karyawan', 'atasan', 'hr']

const session = useSessionStore()
const store = useAsistenStore()
const { open, turns, draft, intro, pending, unavailable } = storeToRefs(store)
const router = useRouter()
const titleId = useId()

const view = computed<AssistantView | null>(() => {
  const v = session.activeView as AssistantView
  return ASSISTANT_VIEWS.includes(v) ? v : null
})
const allowed = computed(() => !!session.user && session.hasFlag('assistant') && view.value !== null)
const enabled = computed(() => allowed.value && !unavailable.value)

// Percakapan milik satu akun (tenant + pengguna) dan satu tampilan (mockup mengosongkan asTurns saat ganti peran).
// Salam dimuat lebih dulu supaya tampilan yang ditolak server (403 VIEW_FORBIDDEN) tidak pernah menampilkan tombol.
watch(() => `${session.user?.tenantId ?? ''}|${session.user?.id ?? ''}|${view.value ?? ''}`, (k) => {
  store.bind(k)
  if (allowed.value) store.loadIntro(view.value!)
}, { immediate: true })

const roleLabel = computed(() => intro.value?.roleLabel ?? (view.value ? VIEW_LABEL[view.value] : ''))
const greeting = computed(() => intro.value?.greeting ?? `Halo, saya Asisten ELGOS. Tanyakan apa pun tentang urusan Anda sebagai ${roleLabel.value} di sini.`)
const disclaimer = computed(() => intro.value?.disclaimer ?? `Hanya menjawab dari data yang boleh Anda lihat sebagai ${roleLabel.value}. Jawaban dicatat di log audit.`)
const suggestions = computed(() => intro.value?.suggestions ?? [])

const fabEl = ref<HTMLButtonElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const bodyEl = ref<HTMLElement | null>(null)

// Kunci halaman dari API ke nama rute. `review` di API berarti antrean tinjauan HR (sama dengan dashboard B3),
// bukan rute `review` per gap yang butuh rujukan gap di query (P9 IR-1).
const PAGE_ROUTE: Record<string, string> = { review: 'tna-review' }
const routeOf = (page: string) => PAGE_ROUTE[page] ?? page

function canGo(page: string) {
  return !!view.value && routeOpen(routeOf(page), view.value, session)
}

async function show() {
  open.value = true
  if (view.value) store.loadIntro(view.value)
  await nextTick()
  inputEl.value?.focus()
}

async function hide() {
  open.value = false
  await nextTick()
  fabEl.value?.focus()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  // Jangan sampai ke penangan Esc drawer di AppShell
  e.stopPropagation()
  hide()
}

function send(text: string) {
  if (view.value) store.ask(text, view.value)
}

function go(page: string) {
  store.refocus = true
  router.push({ name: routeOf(page) })
}

watch(() => turns.value.length + (pending.value ? 1 : 0), async () => {
  await nextTick()
  if (bodyEl.value) bodyEl.value.scrollTop = bodyEl.value.scrollHeight
})

onMounted(async () => {
  if (!open.value || !enabled.value) return
  await nextTick()
  if (bodyEl.value) bodyEl.value.scrollTop = bodyEl.value.scrollHeight
  if (store.refocus) {
    store.refocus = false
    inputEl.value?.focus()
  }
})
</script>

<template>
  <template v-if="enabled">
    <button v-if="!open" ref="fabEl" type="button" class="b17-fab" aria-label="Buka Asisten ELGOS" @click="show">
      <UiIcon name="smart_toy" :size="22" />
    </button>
    <div v-else class="b17-asst" role="dialog" :aria-labelledby="titleId" @keydown="onKeydown">
      <div class="b17-asst__hd">
        <div>
          <div :id="titleId" class="b17-asst__title">Asisten ELGOS</div>
          <div class="b17-asst__sub">Tanyakan urusan Anda · {{ roleLabel }}</div>
        </div>
        <button type="button" class="b17-asst__close" aria-label="Tutup" @click="hide"><UiIcon name="close" :size="22" /></button>
      </div>
      <div ref="bodyEl" class="b17-asst__bd" role="log" aria-live="polite">
        <div class="b17-msg b17-msg--ai"><small>Asisten ELGOS</small>{{ greeting }}</div>
        <div v-for="t in turns" :key="t.id" :class="['b17-msg', `b17-msg--${t.who}`]">
          <small>{{ t.who === 'me' ? 'Anda' : 'Asisten ELGOS' }}</small>{{ t.text }}
          <div v-if="t.action && canGo(t.action.page)" class="b17-msg__act">
            <UiButton variant="tonal" size="sm" @click="go(t.action.page)">Buka {{ t.action.label }}</UiButton>
          </div>
        </div>
        <div v-if="pending" class="b17-msg b17-msg--ai"><small>Asisten ELGOS</small>Sedang menyiapkan jawaban…</div>
      </div>
      <div class="b17-asst__ft">
        <div v-if="suggestions.length" class="b17-asst__chips">
          <button v-for="s in suggestions" :key="s" type="button" class="b17-chip" :disabled="pending" @click="send(s)">{{ s }}</button>
        </div>
        <form class="b17-asst__form" @submit.prevent="send(draft)">
          <input ref="inputEl" v-model="draft" class="el-input b17-asst__input" placeholder="Tanya apa saja" aria-label="Pertanyaan" maxlength="500" autocomplete="off">
          <UiButton type="submit" size="sm" :disabled="pending">Kirim</UiButton>
        </form>
        <div class="el-muted b17-asst__note">{{ disclaimer }}</div>
      </div>
    </div>
  </template>
</template>

<style>
.b17-fab {
  position: fixed; right: 24px; bottom: 24px; width: 56px; height: 56px; border-radius: 28px; border: 0;
  background: var(--el-primary); color: var(--el-on-primary); box-shadow: var(--el-shadow);
  display: flex; align-items: center; justify-content: center; z-index: 50; cursor: pointer;
}
.b17-fab:hover { filter: brightness(1.15); }
.b17-asst {
  position: fixed; right: 24px; bottom: 24px; width: 380px; max-width: calc(100vw - 32px); height: 560px;
  max-height: calc(100vh - 48px); background: var(--el-surface-card); border: 1px solid var(--el-outline-variant);
  border-radius: 20px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.25); display: flex; flex-direction: column; z-index: 50;
  overflow: hidden;
}
.b17-asst__hd {
  padding: 14px 16px; background: var(--el-primary); color: var(--el-on-primary);
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.b17-asst__title { font-weight: 500; }
.b17-asst__sub { font-size: 12px; opacity: 0.85; }
.b17-asst__close {
  display: inline-flex; align-items: center; justify-content: center; height: 32px; padding: 0 12px; border: 0;
  border-radius: 20px; background: transparent; color: inherit; cursor: pointer;
}
.b17-asst__close:focus-visible { outline-color: var(--el-on-primary); }
.b17-asst__bd { flex: 1; min-height: 0; overflow: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.b17-msg { max-width: 88%; padding: 12px 16px; border-radius: 16px; white-space: pre-line; overflow-wrap: anywhere; }
.b17-msg small { display: block; font-size: 11px; opacity: 0.75; margin-bottom: 2px; letter-spacing: 0.4px; white-space: normal; }
.b17-msg--ai { background: var(--el-surface-2); border-bottom-left-radius: 4px; align-self: flex-start; }
.b17-msg--me { background: var(--el-primary); color: var(--el-on-primary); border-bottom-right-radius: 4px; align-self: flex-end; }
.b17-msg__act { margin-top: 8px; white-space: normal; }
.b17-asst__ft { padding: 10px 12px; border-top: 1px solid var(--el-outline-variant); }
.b17-asst__chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.b17-chip {
  display: inline-flex; align-items: center; min-height: 30px; padding: 4px 10px; border-radius: 8px;
  border: 1px solid var(--el-outline); background: var(--el-surface-card); color: var(--el-on-surface);
  font: inherit; font-size: 12px; text-align: left; cursor: pointer;
}
.b17-chip:hover:not(:disabled) { background: var(--el-surface-2); }
.b17-chip:disabled { opacity: 0.6; cursor: not-allowed; }
.b17-asst__form { display: flex; gap: 12px; align-items: center; }
.b17-asst__input { height: 40px; flex: 1 1 auto; }
.b17-asst__note { font-size: 11px; line-height: 16px; margin-top: 6px; }
</style>
