<script setup lang="ts">
// R3-2: halaman tujuan link masuk dari email. Token di fragmen URL (#token=...) dan baru ditukar setelah tombol
// ditekan, supaya pemindai link di email tidak menghabiskan link sekali pakai.
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const token = ref('')
const error = ref('')
const loading = ref(false)

onMounted(() => {
  token.value = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? ''
  // hapus token dari address bar/riwayat
  if (token.value) history.replaceState(null, '', window.location.pathname)
  else error.value = 'Link tidak lengkap. Minta link masuk baru di halaman login.'
})

async function enter() {
  error.value = ''
  loading.value = true
  try {
    await session.loginWithEmailLink(token.value)
    await router.push({ name: 'home' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Gagal masuk'
  } finally {
    loading.value = false
  }
}

</script>

<template>
  <main class="min-h-screen grid place-items-center bg-slate-50 px-4">
    <div class="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 text-center shadow">
      <h1 class="text-xl font-semibold text-slate-900">Masuk ke ELGOS</h1>
      <p v-if="token && !error" class="text-sm text-slate-600">Tekan tombol di bawah untuk melanjutkan.</p>
      <p v-if="error" role="alert" class="text-sm text-red-600">{{ error }}</p>
      <button v-if="token" type="button" :disabled="loading" class="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-60" @click="enter">
        {{ loading ? 'Memproses…' : 'Lanjutkan masuk' }}
      </button>
      <RouterLink to="/login" class="block text-sm text-blue-700">Ke halaman login</RouterLink>
    </div>
  </main>
</template>
