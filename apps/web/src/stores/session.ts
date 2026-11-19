import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api/client'
import type { SubmoduleKey } from '@/modules'

export interface SessionUser {
  id: string
  tenantId: string
  email: string
  name?: string
  role: string
}

interface Access {
  submodules: SubmoduleKey[]
  flags: Record<string, boolean>
}

const STORAGE_KEY = 'ewi.token'

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

  /** Hapus sesi di browser saja (tanpa memanggil API). */
  function clear() {
    if (timer) { clearTimeout(timer); timer = null }
    token.value = null
    user.value = null
    access.value = null
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* abaikan */ }
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

  return { token, user, role, access, isAuthenticated, canOpen, hasFlag, login, loginWithEmailLink, loadAccess, logout, clear, expire, setExpiredHandler }
})
