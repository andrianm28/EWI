import { test, expect, type Page } from '@playwright/test'
import { loginSebagai, semuaModulDengan, SEMUA_MODUL, type Peran } from '../support/sesi'

// B18 4.4 (docs/designs/b18-e2e-qa-malam.md): batas akses di tingkat tampilan (router). Alamat yang dibuka langsung
// tidak boleh membuka layar peran lain atau modul yang mati. Penegakan sesungguhnya ada di API (test integrasi paket).
// Tidak digandakan di sini:
// - transkrip tidak tampil untuk selain karyawan yang diwawancarai: layar memutuskan dari `transcriptVisible` di
//   respons API, bukan dari peran (poc-dna-tna.spec.ts, iv.spec.ts); API-nya diuji untuk atasan, HR, dan Super Admin
//   di privacy-audit.test.js dan user-roles.test.js
// - atasan tanpa akses dari HR melihat pesan terkunci di Improvement Needs (K1): improvement-needs.spec.ts
// - Super Admin tidak punya butir menu ke layar wawancara: menu-peran.spec.ts
// - flag mati untuk Learning Intervention, Career & Promotion, Dashboard, Admin Tenant, Super Admin, dan produk
//   full_suite: li.spec.ts, b16-cp.spec.ts, dashboard.spec.ts, admin-tenant.spec.ts, super-admin.spec.ts, shell.spec.ts

/** Beranda karyawan masih Beranda lama sampai layar B8 "Hasil saya" (rute `my`) dibangun. */
const BERANDA: Record<Peran, string> = { karyawan: '/', atasan: '/dashboard', hr: '/dashboard', admin: '/admin/pengguna', super: '/tenants' }

const LAYAR_HR_SAJA = ['/cc', '/lib', '/prog', '/req', '/ld', '/m/tna/review']
const LAYAR_HR_ATASAN = ['/dashboard', '/lim', '/cp', '/ina', '/tna/gap']
const LAYAR_ADMIN = ['/admin/pengguna', '/admin/jabatan', '/admin/impor']
const LAYAR_SUPER = ['/tenants', '/platform']

async function dialihkanKeBeranda(page: Page, peran: Peran, alamat: string[]) {
  await expect(page).toHaveURL((u) => u.pathname === BERANDA[peran])
  for (const a of alamat) {
    await test.step(a, async () => {
      await page.goto(a)
      await expect(page).toHaveURL((u) => u.pathname === BERANDA[peran])
      await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
    })
  }
}

test('karyawan membuka alamat layar HR, atasan, Admin Tenant, atau Super Admin: dialihkan ke berandanya', async ({ page }) => {
  await loginSebagai(page, 'karyawan', SEMUA_MODUL)
  await dialihkanKeBeranda(page, 'karyawan', [...LAYAR_HR_SAJA, ...LAYAR_HR_ATASAN, ...LAYAR_ADMIN, ...LAYAR_SUPER])
})

test('atasan membuka alamat layar khusus HR, Admin Tenant, atau Super Admin: dialihkan ke Dashboard tim', async ({ page }) => {
  await loginSebagai(page, 'atasan', SEMUA_MODUL)
  await dialihkanKeBeranda(page, 'atasan', [...LAYAR_HR_SAJA, ...LAYAR_ADMIN, ...LAYAR_SUPER])
})

test('Admin Tenant membuka alamat layar Super Admin: dialihkan ke Pengguna & peran', async ({ page }) => {
  await loginSebagai(page, 'admin', SEMUA_MODUL)
  await dialihkanKeBeranda(page, 'admin', LAYAR_SUPER)
})

const MODUL_MATI: { peran: Peran; flag: string; alamat: string[] }[] = [
  { peran: 'hr', flag: 'module.cca', alamat: ['/cc'] },
  { peran: 'hr', flag: 'module.dna', alamat: ['/dna', '/m/dna'] },
  { peran: 'hr', flag: 'module.tna', alamat: ['/tna', '/tna/gap', '/m/tna/review'] },
  { peran: 'hr', flag: 'module.ina', alamat: ['/ina'] },
  { peran: 'hr', flag: 'module.ld', alamat: ['/ld'] },
  { peran: 'hr', flag: 'module.lim', alamat: ['/lim'] },
  { peran: 'atasan', flag: 'module.cca', alamat: ['/aiv'] },
  { peran: 'karyawan', flag: 'module.tna', alamat: ['/iv', '/iv/s1'] },
]

for (const k of MODUL_MATI) {
  test(`${k.peran}, flag ${k.flag} mati: alamat langsung ke layarnya dialihkan ke beranda`, async ({ page }) => {
    await loginSebagai(page, k.peran, semuaModulDengan({ [k.flag]: false }))
    await dialihkanKeBeranda(page, k.peran, k.alamat)
  })
}
