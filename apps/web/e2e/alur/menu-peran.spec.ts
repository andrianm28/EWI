import { test, expect, type Page } from '@playwright/test'
import { loginSebagai, navigasi, semuaModulKecuali, SEMUA_MODUL, type Peran } from '../support/sesi'

// B18 4.3 (docs/designs/b18-e2e-qa-malam.md): matriks menu per peran dari fungsi `N` di mockup Pak Eji.
// Seam: menu "Navigasi utama" setelah masuk lewat loginSebagai. Layar di belakang tiap butir tidak diuji di sini;
// permintaan API layar beranda yang tidak di-mock dijawab 404 BELUM_DIMOCK dan tidak memengaruhi menu.

const grup = (page: Page) => navigasi(page).getByRole('button')

/** Sub-butir hanya terlihat saat grup accordion terbuka, jadi grup yang tertutup dibuka dulu. */
async function butirMenu(page: Page) {
  await expect(navigasi(page)).toBeVisible()
  for (const g of await grup(page).all()) {
    if ((await g.getAttribute('aria-expanded')) === 'false') await g.click()
  }
  return navigasi(page).getByRole('link')
}

const MATRIKS: { peran: Peran; grup: string[]; menu: string[] }[] = [
  {
    peran: 'hr',
    grup: ['Learning Needs Analysis', 'Learning Intervention'],
    menu: [
      'Dashboard utama',
      'Core Competencies', 'Developmental Needs', 'Training Needs', 'Improvement Needs',
      'Library', 'Program & Course', 'Permintaan & pengembangan',
      'Learning Delivery', 'Learning Impact Measurement', 'Career & Promotion',
    ],
  },
  {
    peran: 'atasan',
    grup: ['Learning Needs Analysis'],
    // K1: butir Improvement Needs tetap tampil; tanpa akses dari HR layarnya terkunci (diuji di improvement-needs.spec.ts)
    menu: ['Dashboard tim', 'Wawancara AI', 'Developmental Needs', 'Training Needs', 'Improvement Needs', 'Learning Impact Measurement', 'Career & Promotion'],
  },
  { peran: 'admin', grup: [], menu: ['Pengguna & peran', 'Jabatan & kamus kompetensi', 'Impor data & integrasi'] },
  { peran: 'super', grup: [], menu: ['Tenant', 'Konfigurasi platform'] },
]

for (const baris of MATRIKS) {
  test(`menu ${baris.peran} sama dengan matriks mockup saat semua modul menyala`, async ({ page }) => {
    await loginSebagai(page, baris.peran, SEMUA_MODUL)
    await expect(await butirMenu(page)).toHaveText(baris.menu)
    await expect(grup(page)).toHaveText(baris.grup)
  })
}

// Beranda karyawan B8: "Hasil saya" (rute `my`) dan "Rencana belajar" (rute `li`) di balik flag learner.home (ada di SEMUA_MODUL).
// Butir peralihan Developmental Needs dan Training Needs hilang begitu layar beranda karyawan terbuka.
test('menu karyawan sama dengan matriks mockup saat semua modul menyala', async ({ page }) => {
  await loginSebagai(page, 'karyawan', SEMUA_MODUL)
  await expect(await butirMenu(page)).toHaveText(['Hasil saya', 'Wawancara visi & nilai', 'Wawancara akar masalah', 'Rencana belajar'])
  await expect(grup(page)).toHaveCount(0)
})

test('HR, satu flag modul mati: butir modul itu hilang, butir lain tetap', async ({ page }) => {
  await loginSebagai(page, 'hr', semuaModulKecuali({ 'module.tna': false }))
  await expect(await butirMenu(page)).toHaveText([
    'Dashboard utama', 'Core Competencies', 'Developmental Needs', 'Improvement Needs',
    'Library', 'Program & Course', 'Permintaan & pengembangan', 'Learning Delivery', 'Learning Impact Measurement', 'Career & Promotion',
  ])
})

test('atasan, satu flag modul mati: Wawancara AI hilang, butir lain tetap', async ({ page }) => {
  await loginSebagai(page, 'atasan', semuaModulKecuali({ 'module.cca': false }))
  await expect(await butirMenu(page)).toHaveText(['Dashboard tim', 'Developmental Needs', 'Training Needs', 'Improvement Needs', 'Learning Impact Measurement', 'Career & Promotion'])
})

test('submodul tidak dilanggan walau flag menyala: butirnya hilang (Developmental Needs ikut menutup Career & Promotion)', async ({ page }) => {
  await loginSebagai(page, 'hr', { ...SEMUA_MODUL, submodules: ['cca', 'tna', 'ina', 'li', 'ld'] })
  await expect(await butirMenu(page)).toHaveText([
    'Dashboard utama', 'Core Competencies', 'Training Needs', 'Improvement Needs',
    'Library', 'Program & Course', 'Permintaan & pengembangan', 'Learning Delivery', 'Learning Impact Measurement',
  ])
})
