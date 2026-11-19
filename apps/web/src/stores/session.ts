import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api/client'
import type { SubmoduleKey } from '@/modules'
import { viewsOfRoles, type ViewKey } from '@/shell/views'

export interface SessionUser {
  id: string
  tenantId: string
  email: string
  name?: string
  role: string
  /** B2: akun multi-peran. Bila tidak dikirim API, dipakai `role` saja. */
  roles?: string[]
  /** Nama tenant untuk top bar (dikirim API setelah B2; opsional). */
  tenantName?: string
}

/** B2: tampilan yang boleh dipakai akun ini, dari API (peran yang bisa dipilih lewat POST /auth/switch-role). */
export interface AccessRole { role: string; view: ViewKey; label: string }

interface Access {
  submodules: SubmoduleKey[]
  /** Produk entitlement aktif tenant (mis. ['full_suite']); untuk gerbang modul 2–5 (meta.entitlement). */
  products?: string[]
  flags: Record<string, boolean>
  /** B2: peran aktif sesi, tampilannya, dan tampilan lain yang bisa dipilih. API lama tidak mengirimnya. */
  role?: string
  view?: ViewKey
  roles?: AccessRole[]
}

const STORAGE_KEY = 'ewi.token'
const VIEW_KEY = 'elgos.view'

function readToken(): string | null {
  try { return sessionStorage.getItem(STORAGE_KEY) } catch { return null }
}

/** Waktu kedaluwarsa JWT (ms epoch) atau null bila token tidak bisa dibaca. Hanya untuk UX, bukan keamanan. */
export function tokenExpiry(token: string | null): number | null {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof json.exp === 'number' ? json.exp * 1000 : null
  } catch { return null }
}

function readView(): string | null {
  try { return sessionStorage.getItem(VIEW_KEY) } catch { return null }
}

// Apakah layar beranda sebuah tampilan sudah bisa dibuka (rute terdaftar dan gerbangnya lolos). Diisi router
// saat dibuat (store tidak mengimpor router supaya tidak ada impor melingkar).
/** Bagian sesi yang dibaca gerbang rute (flag, submodul, peran). */
export interface Gates { access: Access | null; canOpen: (key: SubmoduleKey) => boolean; roles: string[] }
/** Apakah layar beranda tampilan `view` sudah bisa dibuka untuk sesi ini. */
export type HomeReadyCheck = (view: ViewKey, gates: Gates) => boolean
let homeReadyFn: HomeReadyCheck = () => false
/** Diisi router: memasang pemeriksa "beranda tampilan siap" (lihat homeFor di router). */
export function bindRoutes(fn: HomeReadyCheck) { homeReadyFn = fn }

export const useSessionStore = defineStore('session', () => {
  const token = ref<string | null>(readToken())
  const user = ref<SessionUser | null>(null)
  const access = ref<Access | null>(null)
  // PK-16: dipanggil saat sesi berakhir (kedaluwarsa atau dicabut); dipasang di main.ts untuk pindah ke halaman login
  let onExpired: (() => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const isAuthenticated = computed(() => !!token.value)

  function canOpen(key: SubmoduleKey) {
    return !!access.value?.submodules.includes(key) && access.value.flags[`module.${key}`] === true
  }

  function scheduleExpiry() {
    if (timer) { clearTimeout(timer); timer = null }
    const exp = tokenExpiry(token.value)
    if (exp === null) return
    // setTimeout maksimal ~24,8 hari; TTL sesi ELGOS jauh di bawah itu
    const ms = Math.min(Math.max(exp - Date.now(), 0), 2_147_000_000)
    timer = setTimeout(() => expire(), ms)
  }

  function startSession(res: { token: string; user: SessionUser }) {
    token.value = res.token
    user.value = res.user
    try { sessionStorage.setItem(STORAGE_KEY, res.token) } catch { /* abaikan */ }
    scheduleExpiry()
  }

  // B1: faktor pertama bisa dijawab { mfaRequired, challenge } bila akun memakai verifikasi dua langkah.
  // Return challenge (sesi belum terbit) atau null (sudah masuk).
  type FirstFactor = { token: string; user: SessionUser } | { mfaRequired: true; challenge: string }
  async function finish(res: FirstFactor): Promise<string | null> {
    if ('mfaRequired' in res && res.mfaRequired) return res.challenge
    startSession(res as { token: string; user: SessionUser })
    await loadAccess()
    return null
  }

  async function login(tenant: string, email: string, password: string) {
    return finish(await api<FirstFactor>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ tenant, email, password }),
    }))
  }

  // R3-2: tukar token dari link email (sekali pakai) menjadi sesi
  async function loginWithEmailLink(linkToken: string) {
    return finish(await api<FirstFactor>('/auth/email-link/verify', {
      method: 'POST',
      body: JSON.stringify({ token: linkToken }),
    }))
  }

  // B1: langkah kedua (kode 6 digit dari aplikasi autentikator)
  async function verifyMfa(challenge: string, code: string) {
    await finish(await api<FirstFactor>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ challenge, code }),
    }))
  }

  async function loadAccess() {
    access.value = await api<Access>('/me/access', {}, token.value)
    if (!user.value) {
      // Setelah muat ulang halaman: ambil identitas dari token (peran menentukan tampilan dashboard)
      try { user.value = (await api<{ user: SessionUser }>('/auth/me', {}, token.value)).user } catch { /* tetap tanpa profil */ }
    }
  }

  const role = computed(() => user.value?.role ?? '')
  const hasFlag = (key: string) => access.value?.flags[key] === true

  // --- Tampilan (ganti peran di UI). Hanya mengatur menu dan rute; data tetap diotorisasi API. ---
  const pickedView = ref<string | null>(readView())
  const roles = computed(() => {
    const u = user.value
    if (!u) return []
    return Array.isArray(u.roles) && u.roles.length ? u.roles : [u.role]
  })
  // B2: bila API mengirim daftar peran yang bisa dipilih, tampilan diambil dari sana (otorisasi di API).
  // Tanpa itu (API lama), tampilan diturunkan di browser dari peran akun seperti B0.
  const apiRoles = computed(() => (access.value?.roles?.length ? access.value.roles : null))
  const views = computed<ViewKey[]>(() => {
    if (!user.value) return []
    const all = apiRoles.value ? [...new Set([access.value!.view ?? apiRoles.value[0]!.view, ...apiRoles.value.map((r) => r.view)])] : viewsOfRoles(roles.value)
    const main = all[0]!
    // Tampilan tambahan baru ditawarkan setelah layar berandanya ada (mis. "Hasil saya" untuk karyawan).
    // Sebelum itu halaman lama akan memperlihatkan data peran asli di bawah label tampilan lain.
    return all.filter((v) => v === main || homeReady(v))
  })
  /** Layar beranda tampilan ini (dash, my, users, tenants) terpasang dan gerbangnya lolos. */
  function homeReady(v: ViewKey) {
    return homeReadyFn(v, { access: access.value, canOpen, roles: roles.value })
  }
  const activeView = computed<ViewKey>(() => {
    // B2: tampilan aktif = peran aktif sesi di API
    if (apiRoles.value && access.value?.view) return access.value.view
    const picked = views.value.find((v) => v === pickedView.value)
    return picked ?? views.value[0] ?? 'karyawan'
  })
  async function setView(v: ViewKey) {
    if (!views.value.includes(v)) return
    const target = apiRoles.value?.find((r) => r.view === v)
    if (target && v !== activeView.value) {
      // B2: ganti peran aktif di API. Token lama langsung tidak berlaku, jadi token baru dipakai sebelum memuat akses.
      const res = await api<{ token: string; user: SessionUser }>('/auth/switch-role', { method: 'POST', body: JSON.stringify({ role: target.role }) }, token.value)
      startSession(res)
      await loadAccess()
    }
    pickedView.value = v
    try { sessionStorage.setItem(VIEW_KEY, v) } catch { /* abaikan */ }
  }

  /** Hapus sesi di browser saja (tanpa memanggil API). */
  function clear() {
    if (timer) { clearTimeout(timer); timer = null }
    token.value = null
    user.value = null
    access.value = null
    pickedView.value = null
    try { sessionStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(VIEW_KEY) } catch { /* abaikan */ }
  }

  /** Keluar: cabut sesi di server (PK-16), lalu hapus di browser. Gagal jaringan tidak menghalangi keluar. */
  async function logout(allDevices = false) {
    const t = token.value
    clear()
    if (t) {
      try { await api(allDevices ? '/auth/logout-all' : '/auth/logout', { method: 'POST' }, t) } catch { /* sesi lokal sudah dihapus */ }
    }
  }

  /** Sesi berakhir di luar kendali user (kedaluwarsa atau dicabut). */
  function expire() {
    if (!token.value) return
    clear()
    onExpired?.()
  }

  function setExpiredHandler(fn: (() => void) | null) { onExpired = fn }

  if (token.value) scheduleExpiry()

  return { token, user, role, roles, views, activeView, setView, homeReady, access, isAuthenticated, canOpen, hasFlag, login, loginWithEmailLink, verifyMfa, loadAccess, logout, clear, expire, setExpiredHandler }
})
