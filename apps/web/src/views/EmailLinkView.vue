<script setup lang="ts">
// R3-2: halaman tujuan link masuk dari email. Token di fragmen URL (#token=...) dan baru ditukar setelah tombol
// ditekan, supaya pemindai link di email tidak menghabiskan link sekali pakai.
// P4 L1: tata letak dua panel yang sama dengan /login (LoginLayout); galat token di UiErrorSummary.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import LoginLayout from '@/components/LoginLayout.vue'
import { UiButton, UiErrorSummary } from '@/ui'

const session = useSessionStore()
const router = useRouter()
const token = ref('')
const error = ref('')
const loading = ref(false)
const errors = computed(() => (error.value ? [{ message: error.value }] : []))

onMounted(() => {
  token.value = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? ''
  // hapus token dari address bar/riwayat
  if (token.value) history.replaceState(null, '', window.location.pathname)
  else error.value = 'Link tidak lengkap. Minta link masuk baru di halaman login.'
})

async function enter() {
  if (loading.value) return
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
  <LoginLayout>
    <h1 class="lg-h1">Masuk ke ELGOS</h1>
    <p v-if="token && !error" class="lg-sub">Tekan tombol di bawah untuk melanjutkan.</p>
    <UiErrorSummary :errors="errors" />
    <div class="lg-row">
      <UiButton v-if="token && !error" :disabled="loading" @click="enter">{{ loading ? 'Memproses…' : 'Lanjutkan masuk' }}</UiButton>
      <UiButton variant="text" to="/login">Ke halaman login</UiButton>
    </div>
  </LoginLayout>
</template>
