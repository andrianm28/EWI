// Tampilan (peran di UI) mengikuti mockup Pak Eji dan default K2: lima tampilan, akun multi-peran bisa berganti.
// Tampilan hanya mengatur menu dan rute di UI. Otorisasi data tetap di API.
export type ViewKey = 'hr' | 'atasan' | 'karyawan' | 'admin' | 'super'

export const VIEW_LABEL: Record<ViewKey, string> = {
  hr: 'HR / L&D',
  atasan: 'Atasan',
  karyawan: 'Karyawan',
  admin: 'Admin Tenant',
  super: 'Super Admin',
}

// Peran API -> tampilan utama. Peran yang tidak dikenal jatuh ke karyawan (hak paling sempit).
const ROLE_VIEW: Record<string, ViewKey> = {
  hr_admin: 'hr',
  supervisor: 'atasan',
  pimpinan: 'atasan',
  role_leader: 'atasan',
  learner: 'karyawan',
  sme: 'karyawan',
  tenant_admin: 'admin',
  eta_admin: 'super',
}

// K2: HR, Atasan, dan Admin Tenant juga karyawan; Admin Tenant juga HR.
const ALSO: Record<ViewKey, ViewKey[]> = {
  hr: ['karyawan'],
  atasan: ['karyawan'],
  karyawan: [],
  admin: ['hr', 'karyawan'],
  super: [],
}

const ORDER: ViewKey[] = ['super', 'admin', 'hr', 'atasan', 'karyawan']

export function viewOfRole(role: string): ViewKey {
  return ROLE_VIEW[role] ?? 'karyawan'
}

/** Semua tampilan yang dimiliki akun, tampilan utama lebih dulu. */
export function viewsOfRoles(roles: string[]): ViewKey[] {
  const set = new Set<ViewKey>()
  for (const r of roles) {
    const v = viewOfRole(r)
    set.add(v)
    for (const a of ALSO[v]) set.add(a)
  }
  if (!set.size) set.add('karyawan')
  return ORDER.filter((v) => set.has(v))
}

/** Rute beranda tiap tampilan, sesuai `home` di objek ROLE mockup. Dipakai bila rutenya sudah terdaftar. */
export const VIEW_HOME: Record<ViewKey, string> = {
  hr: 'dash',
  atasan: 'dash',
  karyawan: 'my',
  admin: 'users',
  super: 'tenants',
}
