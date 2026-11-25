import { test, expect } from '@playwright/test'
import { loginSebagai, SEMUA_MODUL } from './support/sesi'

// Paritas mockup Pak Eji (docs/designs/paritas-mockup/). Satu test per gap tampilan yang diperbaiki.

// Admin Tenant dengan tiga tampilan tidak muat satu baris bahkan di mockup (bar mockup terpotong di 64px),
// jadi tidak diuji di sini; lihat p2-bug-tampilan.md bagian Keputusan.
for (const [peran, peranLain, lebar] of [['hr', ['karyawan'], 1280], ['atasan', ['karyawan'], 1280]] as const) {
  test(`S2: top bar tetap satu baris 64px di lebar ${lebar} untuk ${peran} multi-peran`, async ({ page }) => {
    await page.setViewportSize({ width: lebar, height: 800 })
    await loginSebagai(page, peran, { ...SEMUA_MODUL, peranLain: [...peranLain] })
    const bar = page.locator('header.el-top')
    await expect(bar.getByRole('group', { name: 'Tampilan' }).getByRole('button')).toHaveCount(peranLain.length + 1)
    const box = await bar.boundingBox()
    expect(box!.height).toBeLessThanOrEqual(64)
  })
}

test('S2: tombol mode gelap pindah ke drawer, bukan top bar', async ({ page }) => {
  await loginSebagai(page, 'hr', SEMUA_MODUL)
  await expect(page.locator('header.el-top').getByRole('button', { name: 'Mode gelap' })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('button', { name: 'Mode gelap' })).toBeVisible()
})

test('S2: layar sempit, Mode gelap tetap terjangkau lewat drawer', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 })
  await loginSebagai(page, 'hr', SEMUA_MODUL)
  await page.getByRole('button', { name: 'Menu' }).click()
  const tema = page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('button', { name: 'Mode gelap' })
  await tema.click()
  await expect(tema).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
