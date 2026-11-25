import { test, expect } from '@playwright/test'

// Komponen UI bersama (B0) di halaman referensi /ui-kit (hanya build VITE_UI_KIT=1).
test.beforeEach(async ({ page }) => {
  await page.goto('/ui-kit')
  await expect(page.getByRole('heading', { level: 1, name: 'Referensi komponen ELGOS' })).toBeVisible()
  await page.evaluate('document.fonts.ready.then(() => true)')
})

test('token: warna utama navy, latar surface, font Roboto termuat dari aplikasi sendiri', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  await page.reload()
  await page.evaluate('document.fonts.ready.then(() => true)')
  await expect(page.getByTestId('btn-filled')).toHaveCSS('background-color', 'rgb(11, 58, 110)')
  await expect(page.getByTestId('btn-filled')).toHaveCSS('border-radius', '20px')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(248, 249, 252)')
  expect(await page.evaluate(`document.fonts.check('500 14px Roboto') && document.fonts.check('400 11px "Roboto Mono"')`)).toBe(true)
  // Tidak ada panggilan ke pihak ketiga (font dan ikon di-host sendiri)
  const asal = new URL(page.url()).origin
  expect(requests.filter((u) => !u.startsWith(asal))).toEqual([])
})

test('tabel data: header mengurutkan naik, turun, lalu kembali; angka diurutkan sebagai angka', async ({ page }) => {
  const table = page.getByRole('table', { name: 'Contoh daftar kompetensi' })
  const codes = () => table.locator('tbody tr td:first-child')
  await expect(codes()).toHaveText(['ST-A2', 'TC-I1', 'ST-B4', 'ST-B1'])
  const skor = table.getByRole('columnheader', { name: 'Skor' })
  await expect(skor).toHaveAttribute('aria-sort', 'none')
  await skor.getByRole('button').click()
  await expect(skor).toHaveAttribute('aria-sort', 'ascending')
  await expect(codes()).toHaveText(['ST-B4', 'TC-I1', 'ST-A2', 'ST-B1']) // 9 < 44 < 47 < 82, bukan urutan teks
  await skor.getByRole('button').click()
  await expect(skor).toHaveAttribute('aria-sort', 'descending')
  await expect(codes()).toHaveText(['ST-B1', 'ST-A2', 'TC-I1', 'ST-B4'])
  await skor.getByRole('button').click()
  await expect(skor).toHaveAttribute('aria-sort', 'none')
  await expect(codes()).toHaveText(['ST-A2', 'TC-I1', 'ST-B4', 'ST-B1'])
  await table.getByRole('columnheader', { name: 'Kompetensi' }).getByRole('button').click()
  await expect(codes()).toHaveText(['TC-I1', 'ST-B1', 'ST-A2', 'ST-B4'])
  // Kolom tanpa sortable tidak punya tombol
  await expect(table.getByRole('columnheader', { name: 'Status' }).getByRole('button')).toHaveCount(0)
})

test('tabel data: toolbar menyaring dan keadaan kosong menampilkan pesan', async ({ page }) => {
  const table = page.getByRole('table', { name: 'Contoh daftar kompetensi' })
  await page.getByLabel('Cari kompetensi').fill('ticket')
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await page.getByLabel('Cari kompetensi').fill('zzz')
  await expect(table.getByRole('cell', { name: 'Tidak ada kompetensi yang cocok.' })).toBeVisible()
})

test('tab: panah kanan dan End memindahkan pilihan dan fokus', async ({ page }) => {
  const tabs = page.getByRole('tablist', { name: 'Contoh tab' })
  await tabs.getByRole('tab', { name: 'Gap kompetensi' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.getByRole('tab', { name: 'Gap OKR' })).toBeFocused()
  await expect(tabs.getByRole('tab', { name: 'Gap OKR' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel')).toHaveText('Panel: okr')
  await page.keyboard.press('End')
  await expect(tabs.getByRole('tab', { name: 'Alur gap ke solusi' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(tabs.getByRole('tab', { name: 'Gap kompetensi' })).toBeFocused()
})

test('ringkasan galat: muncul dengan fokus dan menaut ke field', async ({ page }) => {
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Mulai', exact: true }).click()
  const summary = page.getByRole('alert')
  await expect(summary).toBeFocused()
  await expect(summary.getByRole('heading', { name: 'Ada masalah' })).toBeVisible()
  await summary.getByRole('link', { name: 'Centang persetujuan sebelum melanjutkan.' }).click()
  await expect(page.getByRole('checkbox')).toBeFocused()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Mulai', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('field: label, petunjuk tertaut ke input', async ({ page }) => {
  const input = page.getByLabel('Nama panggilan')
  await expect(input).toHaveAttribute('aria-describedby', 'kit-nama-petunjuk')
  await expect(page.locator('#kit-nama-petunjuk')).toHaveText('Dipakai AI untuk menyapa Anda.')
})

test('stepper: langkah aktif ditandai dan langkah selesai punya teks', async ({ page }) => {
  const steps = page.getByRole('list', { name: 'Alur wawancara' })
  await expect(steps.locator('[aria-current="step"]')).toHaveText('2Percakapan')
  await expect(steps.getByRole('listitem').first()).toContainText('Persetujuan (selesai)')
  await page.getByRole('button', { name: 'Lanjut' }).click()
  await expect(steps.locator('[aria-current="step"]')).toContainText('Ringkasan temuan')
})

test('status: setiap label punya ikon dan teks', async ({ page }) => {
  const items = page.getByTestId('kit-status').locator('.el-status')
  await expect(items).toHaveText(['Menguasai', 'Sebagian', 'Belum', 'Dijadwalkan', 'Belum dinilai'])
  for (const item of await items.all()) await expect(item.locator('svg')).toHaveCount(1)
})

test('progres: nilai tersedia untuk pembaca layar', async ({ page }) => {
  await expect(page.getByRole('progressbar', { name: 'Kesiapan modul' })).toHaveAttribute('aria-valuenow', '70')
})

// Paritas P3 (docs/designs/paritas-mockup/p3-komponen-bersama.md)
test('kartu Agen AI: judul, chip Pilot, teks, dan tombol tonal hanya bila ada tujuan', async ({ page }) => {
  const dengan = page.getByTestId('kit-agen')
  await expect(dengan.getByRole('heading', { name: 'Agen AI · Wawancara akar masalah' })).toBeVisible()
  await expect(dengan.locator('.el-chip--review')).toHaveText('Pilot')
  const tombol = dengan.getByRole('link', { name: 'Contoh wawancara' })
  await expect(tombol).toHaveClass(/el-btn--tonal/)
  await expect(tombol).toHaveClass(/el-btn--sm/)
  await expect(dengan.locator('.el-card')).toHaveCSS('background-color', 'rgb(242, 244, 249)')
  const tanpa = page.getByTestId('kit-agen-tanpa')
  await expect(tanpa).toContainText('Agen AI · Validasi kamus kompetensi')
  await expect(tanpa.getByRole('link')).toHaveCount(0)
  await expect(tanpa.getByRole('button')).toHaveCount(0)
})

test('breadcrumb: nav Lokasi 12px, induk tautan bergaris bawah, butir terakhir halaman ini', async ({ page }) => {
  const crumb = page.getByRole('navigation', { name: 'Lokasi' })
  await expect(crumb).toHaveText(/Training Needs\s*›\s*Detail gap/)
  await expect(crumb).toHaveCSS('font-size', '12px')
  const induk = crumb.getByRole('link', { name: 'Training Needs' })
  await expect(induk).toHaveCSS('text-decoration-line', 'underline')
  await expect(induk).toHaveCSS('color', 'rgb(11, 58, 110)')
  await expect(crumb.locator('[aria-current="page"]')).toHaveText('Detail gap')
})

test('tabel data: baris bisa diklik dan dibuka dengan keyboard; pengurutan tetap', async ({ page }) => {
  const table = page.getByRole('table', { name: 'Contoh daftar kompetensi' })
  await table.getByRole('row', { name: /Ticket Life Cycle/ }).getByRole('cell').last().click()
  await expect(page).toHaveURL(/kode=ST-B4/)
  await expect(page.getByTestId('kit-terpilih')).toHaveText('Baris dipilih: ST-B4')
  await table.getByRole('columnheader', { name: 'Skor' }).getByRole('button').click()
  await expect(table.locator('tbody tr td:first-child')).toHaveText(['ST-B4', 'TC-I1', 'ST-A2', 'ST-B1'])
  await expect(page).toHaveURL(/kode=ST-B4/) // klik header tidak membuka baris
  await table.getByRole('link', { name: 'Fondasi Layanan' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('kit-terpilih')).toHaveText('Baris dipilih: ST-B1')
})

test('referensi komponen: snapshot visual terang dan gelap', async ({ page }) => {
  await expect(page).toHaveScreenshot('ui-kit-terang.png', { fullPage: true })
  await page.getByTestId('kit-tema').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page).toHaveScreenshot('ui-kit-gelap.png', { fullPage: true })
})
