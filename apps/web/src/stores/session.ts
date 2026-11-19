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

interface Access {
  submodules: SubmoduleKey[]
  flags: Record<string, boolean>
}

const STORAGE_KEY = 'ewi.token'
const VIEW_KEY = 'ewi.view'

function readToken(): string | null {
  try { return sessionStorage.getItem(STORAGE_KEY) } catch { return null }
}

function readView(): string | null {
  try { return sessionStorage.getItem(VIEW_KEY) } catch { return null }
}

// Apakah layar beranda sebuah tampilan sudah bisa dibuka (rute terdaftar dan gerbangnya lolos). Diisi router
// saat dibuat (store tidak mengimpor router supaya tidak ada impor melingkar).
interface Gates { access: Access | null; canOpen: (key: SubmoduleKey) => boolean; roles: string[] }
type HomeReady = (view: ViewKey, session: Gates) => boolean
let homeReadyFn: HomeReady = () => false
export function bindRoutes(fn: (view: ViewKey, session: never) => boolean) { homeReadyFn = fn as HomeReady }

export const useSessionStore = defineStore('session', () => {
  const token = ref<string | null>(readToken())
  const user = ref<SessionUser | null>(null)
  const access = ref<Access | null>(null)

  const isAuthenticated = computed(() => !!token.value)

  function canOpen(key: SubmoduleKey) {
    return !!access.value?.submodules.includes(key) && access.value.flags[`module.${key}`] === true
  }

  async function login(tenant: string, email: string, password: string) {
    const res = await api<{ token: string; user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ tenant, email, password }),
    })
    token.value = res.token
    user.value = res.user
    try { sessionStorage.setItem(STORAGE_KEY, res.token) } catch { /* abaikan */ }
    await loadAccess()
  }

  // R3-2: tukar token dari link email (sekali pakai) menjadi sesi
  async function loginWithEmailLink(linkToken: string) {
    const res = await api<{ token: string; user: SessionUser }>('/auth/email-link/verify', {
      method: 'POST',
      body: JSON.stringify({ token: linkToken }),
    })
    token.value = res.token
    user.value = res.user
    try { sessionStorage.setItem(STORAGE_KEY, res.token) } catch { /* abaikan */ }
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
    return all.filter((v) => v === main || homeReady(v))
  })
  /** Layar beranda tampilan ini (dash, my, users, tenants) terpasang dan gerbangnya lolos. */
  function homeReady(v: ViewKey) {
    return homeReadyFn(v, { access: access.value, canOpen, roles: roles.value })
  }
  const activeView = computed<ViewKey>(() => {
    const picked = views.value.find((v) => v === pickedView.value)
    return picked ?? views.value[0] ?? 'karyawan'
  })
  function setView(v: ViewKey) {
    if (!views.value.includes(v)) return
    pickedView.value = v
    try { sessionStorage.setItem(VIEW_KEY, v) } catch { /* abaikan */ }
  }

  function logout() {
    token.value = null
    user.value = null
    access.value = null
    pickedView.value = null
    try { sessionStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(VIEW_KEY) } catch { /* abaikan */ }
  }

  return { token, user, role, roles, views, activeView, setView, homeReady, access, isAuthenticated, canOpen, hasFlag, login, loginWithEmailLink, loadAccess, logout }
})
