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
// B1: akun dengan verifikasi dua langkah mendapat challenge setelah link ditukar
const challenge = ref('')
const otp = ref('')

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
    const next = await session.loginWithEmailLink(token.value)
    if (next) { challenge.value = next; return }
    await router.push({ name: 'home' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Gagal masuk'
  } finally {
    loading.value = false
  }
}

async function verify() {
  if (!/^\d{6}$/.test(otp.value.trim())) { error.value = 'Masukkan 6 digit kode verifikasi'; return }
  error.value = ''
  loading.value = true
  try {
    await session.verifyMfa(challenge.value, otp.value.trim())
    await router.push({ name: 'home' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Kode tidak bisa diverifikasi'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="min-h-screen grid place-items-center bg-slate-50 px-4">
    <div class="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 text-center shadow">
      <h1 class="text-xl font-semibold text-slate-900">Masuk ke ELGOS</h1>
      <template v-if="challenge">
        <p class="text-sm text-slate-600">Masukkan 6 digit kode dari aplikasi autentikator Anda.</p>
        <p v-if="error" role="alert" class="text-sm text-red-600">{{ error }}</p>
        <form class="space-y-3 text-left" @submit.prevent="verify">
          <label class="block text-sm" for="otp">Kode verifikasi</label>
          <input id="otp" v-model="otp" class="el-input w-full" inputmode="numeric" maxlength="6" autocomplete="one-time-code" />
          <button type="submit" :disabled="loading" class="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-60">{{ loading ? 'Memproses…' : 'Verifikasi dan masuk' }}</button>
        </form>
      </template>
      <p v-if="token && !error && !challenge" class="text-sm text-slate-600">Tekan tombol di bawah untuk melanjutkan.</p>
      <p v-if="error && !challenge" role="alert" class="text-sm text-red-600">{{ error }}</p>
      <button v-if="token && !challenge" type="button" :disabled="loading" class="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-60" @click="enter">
        {{ loading ? 'Memproses…' : 'Lanjutkan masuk' }}
      </button>
      <RouterLink to="/login" class="block text-sm text-blue-700">Ke halaman login</RouterLink>
    </div>
  </main>
</template>
