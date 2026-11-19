<script setup lang="ts">
// B1: layar masuk mengikuti mockup Pak Eji (panel kepercayaan kiri, formulir kanan). Spek: docs/designs/b1-login.md.
// PD-10: produksi hanya link email. Kata sandi tampil bila API mengizinkan (dev/staging), SSO bila flag tenant menyala.
// Kartu "Masuk sebagai (khusus demo)" di mockup tidak dibangun (K4: data demo bukan bagian produk).
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '@/api/client'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { UiButton, UiErrorSummary, UiField, UiIcon, UiNote } from '@/ui'

const session = useSessionStore()
const router = useRouter()
const route = useRoute()

const tenant = ref(typeof route.query.org === 'string' ? route.query.org : '')
const email = ref('')
const password = ref('')
const errors = ref<{ message: string; fieldId?: string }[]>([])
const loading = ref(false)
const linkNotice = ref('')
// Daftar organisasi hanya tersedia bila API mengizinkan (LOGIN_TENANT_PICKER, dev/staging). Selain itu input teks.
const tenants = ref<{ slug: string; name: string }[]>([])
// Bila API tidak bisa ditanya, anggap link email saja (tanpa sandi, tanpa SSO)
const passwordEnabled = ref(false)
const ssoEnabled = ref(false)
const expired = computed(() => route.query.alasan === 'sesi-habis')

interface Methods { password?: boolean; emailLink?: boolean; sso?: boolean }
// Kata sandi ditentukan lingkungan (tanpa organisasi); SSO ditentukan flag organisasi, jadi ditanya terpisah
async function loadMethods() {
  try { passwordEnabled.value = (await api<Methods>('/auth/methods')).password === true } catch { passwordEnabled.value = false }
}
async function loadSso() {
  const slug = tenant.value.trim()
  if (!slug) { ssoEnabled.value = false; return }
  try { ssoEnabled.value = (await api<Methods>(`/auth/methods?tenant=${encodeURIComponent(slug)}`)).sso === true } catch { ssoEnabled.value = false }
}

onMounted(async () => {
  const [t] = await Promise.allSettled([api<{ data: { slug: string; name: string }[] }>('/auth/tenants'), loadMethods()])
  tenants.value = t.status === 'fulfilled' ? t.value.data : []
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
  linkNotice.value = ''
  if (!requireFields(false)) return
  loading.value = true
  try {
    const res = await api<{ message: string }>('/auth/email-link', { method: 'POST', body: JSON.stringify({ tenant: tenant.value.trim(), email: email.value.trim() }) })
    linkNotice.value = res.message
  } catch (e) {
    fail(e, 'Gagal mengirim link')
  } finally {
    loading.value = false
  }
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
  <div class="lg">
    <aside class="lg-l" aria-label="Tentang ELGOS">
      <div>
        <div class="lg-brand"><div class="lg-logo" aria-hidden="true">EG</div><div><div class="lg-name">ELGOS</div><div class="lg-tag">Elite Learning &amp; Growth Operating System</div></div></div>
        <p class="lg-small">Workforce intelligence berbasis AI: dari gap kompetensi sampai dampak bisnis.</p>
      </div>
      <div>
        <p class="lg-hero">Kebutuhan belajar yang terukur, keputusan talenta yang berbukti.</p>
        <p class="lg-lead">Platform analisis dan pengembangan kompetensi untuk organisasi yang mengutamakan kepercayaan dan kepatuhan.</p>
      </div>
      <ul class="lg-trust">
        <li><UiIcon name="verified_user" :size="20" /><span>Akses berbasis peran dan log audit di setiap sesi</span></li>
        <li><UiIcon name="lock" :size="20" /><span>Data tiap perusahaan terisolasi; persetujuan karyawan tercatat</span></li>
        <!-- K3: klaim kepatuhan hanya UU PDP; tidak ada klaim OJK -->
        <li><UiIcon name="policy" :size="20" /><span>Dirancang mengikuti UU PDP No. 27/2022</span></li>
      </ul>
    </aside>

    <main id="isi-login" class="lg-r">
      <div class="lg-c">
        <form novalidate @submit.prevent="submit">
          <h1 class="lg-h1">Masuk ke ELGOS</h1>
          <p class="lg-sub">Gunakan akun kerja yang didaftarkan oleh admin perusahaan Anda.</p>
          <p v-if="expired" data-testid="session-expired"><UiNote tone="warning">Sesi Anda sudah berakhir. Silakan masuk lagi.</UiNote></p>
          <UiErrorSummary :errors="errors" />

          <UiField id="org" v-slot="{ attrs }" label="Organisasi" :error="fieldError('org')">
            <select v-if="tenants.length" v-bind="attrs" v-model="tenant" name="tenant" class="el-input lg-w">
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

          <p v-if="linkNotice" role="status"><UiNote tone="success">{{ linkNotice }}</UiNote></p>

          <div class="lg-actions">
            <UiButton type="submit" :disabled="loading">{{ loading ? 'Memproses…' : (passwordEnabled ? 'Masuk' : 'Kirim link masuk') }}</UiButton>
            <UiButton v-if="passwordEnabled" variant="text" :disabled="loading" @click="sendLink">Minta link lewat email</UiButton>
            <UiButton v-if="ssoEnabled" variant="outlined" icon="badge" :disabled="loading" @click="sso">Masuk dengan SSO perusahaan</UiButton>
          </div>
          <p v-if="!passwordEnabled" class="lg-help">Kami mengirim link masuk ke email Anda. Link berlaku 15 menit dan hanya bisa dipakai sekali.</p>
        </form>


        <p class="lg-meta">Sesi dienkripsi · percobaan masuk dicatat di log audit tenant</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.lg { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); background: var(--el-surface); color: var(--el-on-surface); }
.lg-l { background: var(--el-primary); color: var(--el-on-primary); padding: 48px; display: flex; flex-direction: column; justify-content: space-between; gap: 32px; }
.lg-brand { display: flex; align-items: center; gap: 12px; }
.lg-logo { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; background: var(--el-on-primary); color: var(--el-primary); font-weight: 600; }
.lg-name { font-weight: 500; font-size: 18px; }
.lg-tag, .lg-small { font-size: 12px; opacity: .8; }
.lg-small { margin-top: 12px; max-width: 440px; }
.lg-hero { font-size: 32px; line-height: 40px; max-width: 440px; }
.lg-lead { opacity: .85; max-width: 440px; margin-top: 16px; }
.lg-trust { display: flex; flex-direction: column; gap: 12px; font-size: 13px; list-style: none; padding: 0; margin: 0; }
.lg-trust li { display: flex; gap: 10px; align-items: center; }
.lg-r { display: grid; place-items: center; padding: 48px 16px; }
.lg-c { width: 100%; max-width: 400px; }
.lg-h1 { font-size: 24px; line-height: 32px; font-weight: 500; }
.lg-sub { color: var(--el-on-surface-variant); margin: 4px 0 16px; }
.lg-w { width: 100%; }
.lg-actions { margin-top: 20px; display: flex; flex-direction: column; gap: 10px; }
.lg-actions :deep(.el-btn) { justify-content: center; }
.lg-row { margin-top: 20px; display: flex; gap: 8px; flex-wrap: wrap; }
.lg-help { font-size: 13px; color: var(--el-on-surface-variant); margin-top: 12px; }
.lg-meta { margin-top: 28px; font-size: 12px; color: var(--el-on-surface-variant); }
@media (max-width: 840px) {
  .lg { grid-template-columns: 1fr; }
  .lg-l { padding: 24px 16px; }
  .lg-hero, .lg-lead, .lg-small { display: none; }
}
</style>
