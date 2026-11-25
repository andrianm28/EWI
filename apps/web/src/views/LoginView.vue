<script setup lang="ts">
// B1: layar masuk mengikuti mockup Pak Eji (panel kepercayaan kiri, formulir kanan). Spek: docs/designs/b1-login.md.
// PD-10: produksi hanya link email. Kata sandi tampil bila API mengizinkan (dev/staging), SSO bila flag tenant menyala.
// Kartu "Masuk sebagai (khusus demo)" di mockup tidak dibangun (K4: data demo bukan bagian produk).
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { api } from '@/api/client'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import LoginLayout from '@/components/LoginLayout.vue'
import { UiButton, UiErrorSummary, UiField, UiNote } from '@/ui'

const session = useSessionStore()
const router = useRouter()
const route = useRoute()

const tenant = ref(typeof route.query.org === 'string' ? route.query.org : '')
const email = ref('')
const password = ref('')
const errors = ref<{ message: string; fieldId?: string }[]>([])
const loading = ref(false)
const linkNotice = ref('')
// P4 L2: setelah link diminta, panel kanan berganti ke langkah "Periksa email Anda" (padanan langkah 2 mockup, PD-10)
const step = ref<'form' | 'sent'>('form')
const sentTo = ref('')
const stepHeading = ref<HTMLElement | null>(null)
// Daftar organisasi hanya tersedia bila API mengizinkan (LOGIN_TENANT_PICKER, dev/staging). Selain itu input teks.
const tenants = ref<{ slug: string; name: string }[]>([])
// Bila API tidak bisa ditanya, anggap link email saja (tanpa sandi, tanpa SSO)
const passwordEnabled = ref(false)
const ssoEnabled = ref(false)
const expired = computed(() => route.query.alasan === 'sesi-habis' || route.query.alasan === 'sesi-diam')
// B12 tahap 2: tanpa angka menit, karena pengguna biasa tidak bisa membaca konfigurasi platform
const expiredText = computed(() => (route.query.alasan === 'sesi-diam'
  ? 'Sesi Anda berakhir karena tidak aktif. Silakan masuk lagi.'
  : 'Sesi Anda sudah berakhir. Silakan masuk lagi.'))

interface Methods { password?: boolean; emailLink?: boolean; sso?: boolean; tenantPicker?: boolean }
// Kata sandi ditentukan lingkungan (tanpa organisasi); SSO ditentukan flag organisasi, jadi ditanya terpisah.
// C10 demo 25 Nov: daftar organisasi hanya diminta bila API menyatakan tersedia (tanpa panggilan 404 di /login).
async function loadMethods() {
  let m: Methods = {}
  try { m = await api<Methods>('/auth/methods') } catch { /* anggap link email saja */ }
  passwordEnabled.value = m.password === true
  if (m.tenantPicker === true) {
    try { tenants.value = (await api<{ data: { slug: string; name: string }[] }>('/auth/tenants')).data } catch { tenants.value = [] }
  }
}
async function loadSso() {
  const slug = tenant.value.trim()
  if (!slug) { ssoEnabled.value = false; return }
  try { ssoEnabled.value = (await api<Methods>(`/auth/methods?tenant=${encodeURIComponent(slug)}`)).sso === true } catch { ssoEnabled.value = false }
}

onMounted(async () => {
  await loadMethods()
  if (tenants.value.length === 1 && !tenant.value) tenant.value = tenants.value[0]!.slug
  await loadSso()
})

// SSO tergantung organisasi: tanya ulang setelah organisasi dipilih atau diketik
let ssoTimer: ReturnType<typeof setTimeout> | null = null
watch(tenant, () => {
  if (ssoTimer) clearTimeout(ssoTimer)
  ssoTimer = setTimeout(loadSso, 300)
})

// Kembali ke halaman semula setelah sesi habis; hanya path internal
function target() {
  const ke = typeof route.query.ke === 'string' ? route.query.ke : ''
  return ke.startsWith('/') && !ke.startsWith('//') ? ke : { name: 'home' }
}

function requireFields(withPassword: boolean) {
  const list: { message: string; fieldId: string }[] = []
  if (!tenant.value.trim()) list.push({ message: 'Isi organisasi Anda', fieldId: 'org' })
  if (!email.value.trim()) list.push({ message: 'Isi email kerja Anda', fieldId: 'em' })
  if (withPassword && !password.value) list.push({ message: 'Isi kata sandi', fieldId: 'pw' })
  errors.value = list
  return list.length === 0
}
const fieldError = (id: string) => errors.value.find((e) => e.fieldId === id)?.message
const fail = (e: unknown, fallback: string) => { errors.value = [{ message: e instanceof Error ? e.message : fallback }] }

async function submit() {
  if (!passwordEnabled.value) return sendLink()
  linkNotice.value = ''
  if (!requireFields(true)) return
  loading.value = true
  try {
    await session.login(tenant.value.trim(), email.value.trim(), password.value)
    await router.push(target())
  } catch (e) {
    fail(e, 'Gagal masuk')
  } finally {
    loading.value = false
  }
}

// R3-2 / PD-10: masuk lewat link email sekali pakai; satu-satunya cara masuk di produksi
async function sendLink() {
  if (loading.value) return
  const resend = step.value === 'sent'
  linkNotice.value = ''
  if (!requireFields(false)) return
  loading.value = true
  try {
    const res = await api<{ message: string }>('/auth/email-link', { method: 'POST', body: JSON.stringify({ tenant: tenant.value.trim(), email: email.value.trim() }) })
    linkNotice.value = resend ? `Link baru sudah diminta. ${res.message}` : res.message
    sentTo.value = email.value.trim()
    if (step.value !== 'sent') {
      step.value = 'sent'
      await nextTick()
      stepHeading.value?.focus()
    }
  } catch (e) {
    fail(e, 'Gagal mengirim link')
  } finally {
    loading.value = false
  }
}

// Kembali ke formulir; isian organisasi dan email tetap. Fokus ke email supaya tidak hilang bersama tombol Kembali.
async function back() {
  errors.value = []
  linkNotice.value = ''
  step.value = 'form'
  await nextTick()
  document.getElementById('em')?.focus()
}

async function sso() {
  errors.value = []
  try {
    await api('/auth/sso/start', { method: 'POST', body: JSON.stringify({ tenant: tenant.value.trim() }) })
  } catch (e) {
    fail(e, 'SSO belum tersedia')
  }
}


</script>

<template>
  <LoginLayout>
    <form v-if="step === 'form'" novalidate @submit.prevent="submit">
      <h1 class="lg-h1">Masuk ke ELGOS</h1>
      <p class="lg-sub">Gunakan akun kerja yang didaftarkan oleh admin perusahaan Anda.</p>
      <div v-if="expired" data-testid="session-expired"><UiNote tone="warning">{{ expiredText }}</UiNote></div>
      <UiErrorSummary :errors="errors" />

      <UiField id="org" v-slot="{ attrs }" label="Organisasi" :error="fieldError('org')">
        <select v-if="tenants.length" v-bind="attrs" v-model="tenant" name="tenant" class="el-input lg-w" autocomplete="organization">
          <option value="" disabled>Pilih organisasi</option>
          <option v-for="t in tenants" :key="t.slug" :value="t.slug">{{ t.name }}</option>
        </select>
        <input v-else v-bind="attrs" v-model="tenant" name="tenant" class="el-input lg-w" placeholder="kode organisasi" autocomplete="organization" />
      </UiField>
      <UiField id="em" v-slot="{ attrs }" label="Email kerja" :error="fieldError('em')">
        <input v-bind="attrs" v-model="email" name="email" type="email" class="el-input lg-w" placeholder="nama@perusahaan.com" autocomplete="email" />
      </UiField>
      <UiField v-if="passwordEnabled" id="pw" v-slot="{ attrs }" label="Kata sandi" hint="Hanya di lingkungan uji." :error="fieldError('pw')">
        <input v-bind="attrs" v-model="password" name="password" type="password" class="el-input lg-w" autocomplete="current-password" />
      </UiField>

      <div class="lg-actions">
        <UiButton type="submit" :disabled="loading">{{ loading ? 'Memproses…' : (passwordEnabled ? 'Masuk' : 'Kirim link masuk') }}</UiButton>
        <UiButton v-if="passwordEnabled" variant="text" :disabled="loading" @click="sendLink">Minta link lewat email</UiButton>
        <UiButton v-if="ssoEnabled" variant="outlined" icon="badge" :disabled="loading" @click="sso">Masuk dengan SSO perusahaan</UiButton>
      </div>
      <p v-if="!passwordEnabled" class="lg-help">Kami mengirim link masuk ke email Anda. Link berlaku 15 menit dan hanya bisa dipakai sekali.</p>
    </form>

    <section v-else aria-labelledby="lg-sent-h">
      <h1 id="lg-sent-h" ref="stepHeading" class="lg-h1" tabindex="-1">Periksa email Anda</h1>
      <p class="lg-sub">Bila {{ sentTo }} terdaftar, link masuk dikirim ke alamat itu. Link berlaku 15 menit dan hanya bisa dipakai sekali.</p>
      <UiErrorSummary :errors="errors" />
      <div role="status" data-testid="link-notice"><UiNote v-if="linkNotice" tone="info">{{ linkNotice }}</UiNote></div>
      <div class="lg-row">
        <UiButton :disabled="loading" @click="sendLink">{{ loading ? 'Memproses…' : 'Kirim ulang' }}</UiButton>
        <UiButton variant="text" :disabled="loading" @click="back">Kembali</UiButton>
      </div>
    </section>
  </LoginLayout>
</template>

<style scoped>
.lg-w { width: 100%; }
.lg-actions { margin-top: 20px; display: flex; flex-direction: column; gap: 10px; }
.lg-actions :deep(.el-btn) { justify-content: center; }
.lg-help { font-size: 13px; color: var(--el-on-surface-variant); margin-top: 12px; }
</style>
