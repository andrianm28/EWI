<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api/client'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const route = useRoute()
const tenant = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const linkNotice = ref('')
// Daftar organisasi hanya tersedia bila API mengizinkan (LOGIN_TENANT_PICKER, dev/staging). Selain itu input teks.
const tenants = ref<{ slug: string; name: string }[]>([])
// PK-16 / PD-10: form password hanya tampil bila API mengizinkan (dev/staging). Produksi: link email saja.
// Bila API tidak bisa ditanya, anggap link email saja.
const passwordEnabled = ref(false)
const expired = computed(() => route.query.alasan === 'sesi-habis')

onMounted(async () => {
  const [t, m] = await Promise.allSettled([
    api<{ data: { slug: string; name: string }[] }>('/auth/tenants'),
    api<{ password: boolean }>('/auth/methods'),
  ])
  tenants.value = t.status === 'fulfilled' ? t.value.data : []
  if (tenants.value.length === 1) tenant.value = tenants.value[0]!.slug
  passwordEnabled.value = m.status === 'fulfilled' && m.value.password === true
})

// Kembali ke halaman semula setelah sesi habis; hanya path internal
function target() {
  const ke = typeof route.query.ke === 'string' ? route.query.ke : ''
  return ke.startsWith('/') && !ke.startsWith('//') ? ke : { name: 'home' }
}

async function submit() {
  if (!passwordEnabled.value) return sendLink()
  error.value = ''
  loading.value = true
  try {
    await session.login(tenant.value.trim(), email.value.trim(), password.value)
    await router.push(target())
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Gagal masuk'
  } finally {
    loading.value = false
  }
}

// R3-2: masuk lewat link email (tanpa password). PD-10: satu-satunya cara masuk di produksi.
async function sendLink() {
  error.value = ''; linkNotice.value = ''
  if (!tenant.value.trim() || !email.value.trim()) { error.value = 'Isi organisasi dan email dulu.'; return }
  loading.value = true
  try {
    const res = await api<{ message: string }>('/auth/email-link', { method: 'POST', body: JSON.stringify({ tenant: tenant.value.trim(), email: email.value.trim() }) })
    linkNotice.value = res.message
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Gagal mengirim link'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="min-h-screen grid place-items-center bg-slate-50 px-4">
    <form class="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow" @submit.prevent="submit">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Elite Learning & Growth Operating System</h1>
        <p class="text-sm text-slate-500">Masuk ke akun organisasi Anda</p>
      </div>
      <p v-if="expired" data-testid="session-expired" class="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Sesi Anda sudah berakhir. Silakan masuk lagi.
      </p>
      <label class="block text-sm">Organisasi
        <select v-if="tenants.length" v-model="tenant" name="tenant" required class="mt-1 w-full rounded border bg-white px-3 py-2">
          <option value="" disabled>Pilih organisasi</option>
          <option v-for="t in tenants" :key="t.slug" :value="t.slug">{{ t.name }}</option>
        </select>
        <input v-else v-model="tenant" name="tenant" required class="mt-1 w-full rounded border px-3 py-2" placeholder="kode organisasi" />
      </label>
      <label class="block text-sm">Email
        <input v-model="email" name="email" type="email" required class="mt-1 w-full rounded border px-3 py-2" />
      </label>
      <label v-if="passwordEnabled" class="block text-sm">Password
        <input v-model="password" name="password" type="password" required class="mt-1 w-full rounded border px-3 py-2" />
      </label>
      <p v-if="error" role="alert" class="text-sm text-red-600">{{ error }}</p>
      <p v-if="linkNotice" role="status" class="text-sm text-emerald-700">{{ linkNotice }}</p>
      <template v-if="passwordEnabled">
        <button type="submit" :disabled="loading" class="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-60">
          {{ loading ? 'Memproses…' : 'Masuk' }}
        </button>
        <div class="border-t pt-3 text-center text-sm">
          <p class="text-slate-500">Login password hanya tersedia di lingkungan uji.</p>
          <button type="button" :disabled="loading" class="mt-1 text-blue-700" @click="sendLink">Minta link lewat email</button>
        </div>
      </template>
      <template v-else>
        <button type="submit" :disabled="loading" class="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-60">
          {{ loading ? 'Memproses…' : 'Minta link lewat email' }}
        </button>
        <p class="text-center text-sm text-slate-500">Kami mengirim link masuk ke email Anda. Link berlaku 15 menit dan hanya bisa dipakai sekali.</p>
      </template>
    </form>
  </main>
</template>
