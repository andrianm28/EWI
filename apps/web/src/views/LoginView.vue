<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const tenant = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await session.login(tenant.value.trim(), email.value.trim(), password.value)
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
    <form class="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow" @submit.prevent="submit">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Elite Workforce Intelligence</h1>
        <p class="text-sm text-slate-500">Masuk ke akun organisasi Anda</p>
      </div>
      <label class="block text-sm">Organisasi
        <input v-model="tenant" name="tenant" required class="mt-1 w-full rounded border px-3 py-2" placeholder="kode organisasi" />
      </label>
      <label class="block text-sm">Email
        <input v-model="email" name="email" type="email" required class="mt-1 w-full rounded border px-3 py-2" />
      </label>
      <label class="block text-sm">Password
        <input v-model="password" name="password" type="password" required class="mt-1 w-full rounded border px-3 py-2" />
      </label>
      <p v-if="error" role="alert" class="text-sm text-red-600">{{ error }}</p>
      <button type="submit" :disabled="loading" class="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-60">
        {{ loading ? 'Memproses…' : 'Masuk' }}
      </button>
    </form>
  </main>
</template>
