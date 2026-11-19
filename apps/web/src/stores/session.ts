import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api/client'
import type { SubmoduleKey } from '@/modules'
import { viewsOfRoles, VIEW_HOME, type ViewKey } from '@/shell/views'

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

interface Access {
  submodules: SubmoduleKey[]
  flags: Record<string, boolean>
}

const STORAGE_KEY = 'ewi.token'
const VIEW_KEY = 'ewi.view'

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

// Rute yang terdaftar menentukan tampilan mana yang sudah punya layar. Diisi router saat dibuat
// (store tidak mengimpor router supaya tidak ada impor melingkar).
let hasRoute: (name: string) => boolean = () => false
export function bindRoutes(fn: (name: string) => boolean) { hasRoute = fn }

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

  async function login(tenant: string, email: string, password: string) {
    startSession(await api<{ token: string; user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ tenant, email, password }),
    }))
    await loadAccess()
  }

  // R3-2: tukar token dari link email (sekali pakai) menjadi sesi
  async function loginWithEmailLink(linkToken: string) {
    startSession(await api<{ token: string; user: SessionUser }>('/auth/email-link/verify', {
      method: 'POST',
      body: JSON.stringify({ token: linkToken }),
    }))
    await loadAccess()
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
  const views = computed<ViewKey[]>(() => {
    if (!user.value) return []
    const all = viewsOfRoles(roles.value)
    const main = all[0]!
    // Tampilan tambahan baru ditawarkan setelah layar berandanya ada (mis. "Hasil saya" untuk karyawan).
    // Sebelum itu halaman lama akan memperlihatkan data peran asli di bawah label tampilan lain.
    return all.filter((v) => v === main || hasRoute(VIEW_HOME[v]))
  })
  const activeView = computed<ViewKey>(() => {
    const picked = views.value.find((v) => v === pickedView.value)
    return picked ?? views.value[0] ?? 'karyawan'
  })
  function setView(v: ViewKey) {
    if (!views.value.includes(v)) return
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

  return { token, user, role, roles, views, activeView, setView, access, isAuthenticated, canOpen, hasFlag, login, loginWithEmailLink, loadAccess, logout, clear, expire, setExpiredHandler }
})
