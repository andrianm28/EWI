import { test, expect, type Page } from '@playwright/test'
import { loginSebagai, type Peran, type OpsiSesi } from '../support/sesi'

// B18 4.3 (docs/designs/b18-e2e-qa-malam.md): matriks menu per peran dari fungsi `N` di mockup Pak Eji.
// Seam: menu "Navigasi utama" setelah masuk lewat loginSebagai. Layar di belakang tiap butir tidak diuji di sini;
// permintaan API layar beranda yang tidak di-mock dijawab 404 BELUM_DIMOCK dan tidak memengaruhi menu.

/** Semua modul dan layar menyala, sehingga menu sama dengan matriks spek. */
const SEMUA_FLAG: Record<string, boolean> = {
  'module.cca': true, 'module.dna': true, 'module.tna': true, 'module.ina': true,
  'module.li': true, 'module.ld': true, 'module.lim': true,
  'dashboard.main': true, 'ina.dashboard': true, 'promotion.recommendation': true,
  'admin.tenant': true, 'platform.console': true,
}
const SEMUA: OpsiSesi = { flags: SEMUA_FLAG }

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigasi utama' })
const butir = (page: Page) => nav(page).getByRole('link')
const grup = (page: Page) => nav(page).getByRole('button')

const MATRIKS: { peran: Peran; menu: string[]; grup: string[] }[] = [
  {
    peran: 'hr',
    menu: [
      'Dashboard utama',
      'Core Competencies', 'Developmental Needs', 'Training Needs', 'Improvement Needs',
      'Library', 'Program & Course', 'Permintaan & pengembangan',
      'Learning Delivery', 'Learning Impact Measurement', 'Career & Promotion',
    ],
    grup: ['Learning Needs Analysis', 'Learning Intervention'],
  },
  {
    peran: 'atasan',
    // K1: butir Improvement Needs tetap tampil; tanpa akses dari HR layarnya terkunci (batas-akses.spec.ts, improvement-needs.spec.ts)
    menu: ['Dashboard tim', 'Wawancara AI', 'Developmental Needs', 'Training Needs', 'Improvement Needs', 'Learning Impact Measurement', 'Career & Promotion'],
    grup: ['Learning Needs Analysis'],
  },
  { peran: 'admin', menu: ['Pengguna & peran', 'Jabatan & kamus kompetensi', 'Impor data & integrasi'], grup: [] },
  { peran: 'super', menu: ['Tenant', 'Konfigurasi platform'], grup: [] },
]

for (const baris of MATRIKS) {
  test(`menu ${baris.peran} sama dengan matriks mockup saat semua modul menyala`, async ({ page }) => {
    await loginSebagai(page, baris.peran, SEMUA)
    await expect(grup(page).filter({ hasText: /Learning/ })).toHaveText(baris.grup)
    await expect(butir(page)).toHaveText(baris.menu)
  })
}

// Layar "Hasil saya" (rute `my`) dan "Rencana belajar" (rute `li`) dari spek B8 belum dibangun di web
// (B8 bagian "Bukan tujuan": dibangun di PR lanjutan di atas B0). Tanpa keduanya karyawan masih mendarat di
// Beranda lama dengan butir peralihan Developmental Needs dan Training Needs.
test.fixme('menu karyawan sama dengan matriks mockup saat semua modul menyala', async ({ page }) => {
  await loginSebagai(page, 'karyawan', SEMUA)
  await expect(grup(page).filter({ hasText: /Learning/ })).toHaveCount(0)
  await expect(butir(page)).toHaveText(['Hasil saya', 'Wawancara visi & nilai', 'Wawancara akar masalah', 'Rencana belajar'])
})

test('flag satu modul mati: butirnya hilang dari menu HR dan atasan, butir lain tetap', async ({ page }) => {
  await loginSebagai(page, 'hr', { flags: { ...SEMUA_FLAG, 'module.tna': false, 'module.ld': false } })
  await expect(butir(page)).toHaveText([
    'Dashboard utama', 'Core Competencies', 'Developmental Needs', 'Improvement Needs',
    'Library', 'Program & Course', 'Permintaan & pengembangan', 'Learning Impact Measurement', 'Career & Promotion',
  ])
})

test('flag modul atasan mati: Training Needs dan Wawancara AI hilang dari menu atasan', async ({ page }) => {
  await loginSebagai(page, 'atasan', { flags: { ...SEMUA_FLAG, 'module.tna': false, 'module.cca': false } })
  await expect(butir(page)).toHaveText(['Dashboard tim', 'Developmental Needs', 'Improvement Needs', 'Learning Impact Measurement', 'Career & Promotion'])
})

test('submodul tidak dilanggan walau flag menyala: butirnya hilang (Developmental Needs ikut menutup Career & Promotion)', async ({ page }) => {
  await loginSebagai(page, 'hr', { flags: SEMUA_FLAG, submodules: ['cca', 'tna', 'ina', 'li', 'ld'] })
  await expect(butir(page)).toHaveText([
    'Dashboard utama', 'Core Competencies', 'Training Needs', 'Improvement Needs',
    'Library', 'Program & Course', 'Permintaan & pengembangan', 'Learning Delivery', 'Learning Impact Measurement',
  ])
})

test('tanpa entitlement full_suite: modul 2–5 hilang walau flag menyala, Learning Needs Analysis tetap', async ({ page }) => {
  await loginSebagai(page, 'hr', { flags: SEMUA_FLAG, products: [] })
  await expect(grup(page).filter({ hasText: /Learning/ })).toHaveText(['Learning Needs Analysis'])
  await expect(butir(page)).toHaveText(['Dashboard utama', 'Core Competencies', 'Developmental Needs', 'Training Needs', 'Improvement Needs', 'Career & Promotion'])
})
