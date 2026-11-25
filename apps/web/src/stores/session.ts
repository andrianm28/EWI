import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api/client'
import type { SubmoduleKey } from '@/modules'
import { viewOfRole, viewsOfRoles, type ViewKey } from '@/shell/views'

export interface SessionUser {
  id: string
  tenantId: string
  email: string
  name?: string
  role: string
  /** B2: akun multi-peran. Bila tidak dikirim API, dipakai `role` saja. */
  roles?: string[]
  /** Peran utama akun (users.role); tetap walau peran aktif berganti lewat B2. */
  primaryRole?: string
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
  let onExpired: ((reason?: string) => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  // B12 tahap 2: tanda aktivitas. Interaksi (ketik, klik/sentuh, gulir) menandai pengguna masih ada; setiap 5 menit
  // satu heartbeat dikirim hanya bila ada interaksi sejak heartbeat terakhir. Sesi yang benar-benar diam tetap habis.
  const HEARTBEAT_MS = 5 * 60 * 1000
  let interacted = false
  let heartbeat: ReturnType<typeof setInterval> | null = null
  const markActive = () => { interacted = true }
  function startHeartbeat() {
    if (heartbeat || typeof window === 'undefined') return
    for (const ev of ['keydown', 'pointerdown', 'scroll'] as const) window.addEventListener(ev, markActive, { passive: true, capture: true })
    heartbeat = setInterval(() => {
      if (!interacted || !token.value) return
      interacted = false
      api('/sessions/heartbeat', { method: 'POST' }, token.value).catch(() => { /* 401 ditangani client.ts */ })
    }, HEARTBEAT_MS)
  }
  function stopHeartbeat() {
    if (!heartbeat) return
    clearInterval(heartbeat)
    heartbeat = null
    interacted = false
    for (const ev of ['keydown', 'pointerdown', 'scroll'] as const) window.removeEventListener(ev, markActive, { capture: true })
  }

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
    startHeartbeat()
  }

  // B1: tanpa verifikasi dua langkah (keputusan 19 Nov); faktor yang lolos langsung menerbitkan sesi
  type LoginResult = { token: string; user: SessionUser }
  async function finish(res: LoginResult) {
    startSession(res)
    await loadAccess()
  }

  async function login(tenant: string, email: string, password: string) {
    return finish(await api<LoginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ tenant, email, password }),
    }))
  }

  // R3-2: tukar token dari link email (sekali pakai) menjadi sesi
  async function loginWithEmailLink(linkToken: string) {
    return finish(await api<LoginResult>('/auth/email-link/verify', {
      method: 'POST',
      body: JSON.stringify({ token: linkToken }),
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
  /**
   * Akun punya salah satu peran asli ini, di tampilan mana pun. Jangan dipakai untuk menampilkan kontrol layar:
   * akun multi-peran (B2) memakai satu peran aktif, jadi pakai `hasActiveRole` (R39-3).
   */
  const hasAnyRole = (list: readonly string[]) => roles.value.some((r) => list.includes(r))
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
  /**
   * B2 (R39-3): peran yang sedang dipakai sesi. Dari API (peran aktif, `access.role`) bila dikirim; API lama: peran akun
   * yang tampilan utamanya sama dengan tampilan aktif. Tampilan Karyawan selalu memuat `learner` (K2: HR, atasan, dan
   * Admin Tenant juga karyawan), di kedua cabang.
   */
  const activeRoles = computed<string[]>(() => {
    if (!user.value) return []
    const base = apiRoles.value && access.value?.role ? [access.value.role] : roles.value.filter((r) => viewOfRole(r) === activeView.value)
    return activeView.value === 'karyawan' && !base.includes('learner') ? [...base, 'learner'] : base
  })
  /** Peran aktif sesi termasuk salah satu dari daftar ini. Penjaga UI saja; data tetap diotorisasi API. */
  const hasActiveRole = (list: readonly string[]) => activeRoles.value.some((r) => list.includes(r))
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
    stopHeartbeat()
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
  function expire(reason?: string) {
    if (!token.value) return
    clear()
    onExpired?.(reason)
  }

  function setExpiredHandler(fn: ((reason?: string) => void) | null) { onExpired = fn }

  if (token.value) { scheduleExpiry(); startHeartbeat() }

  return { token, user, role, roles, hasAnyRole, activeRoles, hasActiveRole, views, activeView, setView, homeReady, access, isAuthenticated, canOpen, hasFlag, login, loginWithEmailLink, loadAccess, logout, clear, expire, setExpiredHandler }
})
