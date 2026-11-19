import { expect, type Page } from '@playwright/test'
import { mockApiDasar } from './api'

// B18 (docs/designs/b18-e2e-qa-malam.md 4.2): masuk sebagai peran lewat tautan email, dengan API di-mock.
// Tanda tangan fungsi tetap; isinya menyesuaikan saat B1 (login tautan email) dan B2 (peran) digabung.

/** Tampilan K2. Kunci peran API yang dipakai untuk tiap tampilan ada di PERAN_API. */
export type Peran = 'hr' | 'atasan' | 'karyawan' | 'admin' | 'super'

export const PERAN_API: Record<Peran, string> = {
  hr: 'hr_admin',
  atasan: 'supervisor',
  karyawan: 'learner',
  admin: 'tenant_admin',
  super: 'eta_admin',
}

const SUBMODUL = ['cca', 'dna', 'tna', 'ina', 'li', 'ld']

export interface OpsiSesi {
  /** Flag yang ditimpa. Bawaan: `module.<x>` menyala untuk setiap submodul di `submodules`. */
  flags?: Record<string, boolean>
  /** Submodul yang dilanggan tenant (bawaan semua). */
  submodules?: string[]
  /** Produk entitlement (bawaan ['full_suite']). Wajib ada di `/me/access`: gerbang meta.entitlement gagal-tertutup (spek B0 5.3). */
  products?: string[]
  /** Peran tambahan untuk akun multi-peran (K2), mis. HR yang juga atasan. */
  peranLain?: Peran[]
  nama?: string
  tenantName?: string
}

export interface PenggunaUji {
  id: string
  tenantId: string
  email: string
  name: string
  role: string
  roles: string[]
  tenantName: string
}

/**
 * Me-mock verifikasi tautan email, `/api/auth/me`, dan `/api/me/access`, lalu masuk lewat halaman `/masuk`.
 * Selesai saat shell tampil (tombol Keluar). Penangan dari mockApi selalu menang atas mock sesi ini.
 */
export async function loginSebagai(page: Page, peran: Peran, opsi: OpsiSesi = {}): Promise<PenggunaUji> {
  const role = PERAN_API[peran]
  const user: PenggunaUji = {
    id: `u-${peran}`,
    tenantId: 't-contoh',
    email: `${peran}@contoh.test`,
    name: opsi.nama ?? 'Pengguna Contoh',
    role,
    roles: [role, ...(opsi.peranLain ?? []).map((p) => PERAN_API[p])],
    tenantName: opsi.tenantName ?? 'PT Contoh',
  }
  const submodules = opsi.submodules ?? SUBMODUL
  const flags = { ...Object.fromEntries(submodules.map((s) => [`module.${s}`, true])), ...opsi.flags }
  const products = opsi.products ?? ['full_suite']

  await mockApiDasar(page, (req) => {
    if (req.method === 'POST' && req.path === '/auth/email-link/verify') return { json: { token: `token-${peran}`, user } }
    if (req.method === 'GET' && req.path === '/auth/me') return { json: { user } }
    if (req.method === 'GET' && req.path === '/me/access') return { json: { submodules, products, flags } }
    return undefined
  })

  await page.goto('/masuk#token=tautan-uji')
  await page.getByRole('button', { name: 'Lanjutkan masuk' }).click()
  await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
  return user
}
