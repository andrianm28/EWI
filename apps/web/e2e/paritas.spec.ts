import { test, expect } from '@playwright/test'
import { loginSebagai, SEMUA_MODUL } from './support/sesi'

// Paritas mockup Pak Eji (docs/designs/paritas-mockup/). Satu test per gap tampilan yang diperbaiki.

test('S2: top bar tetap satu baris 64px di lebar 1280 untuk akun multi-peran', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await loginSebagai(page, 'hr', { ...SEMUA_MODUL, peranLain: ['karyawan'] })
  const bar = page.locator('header.el-top')
  await expect(bar.getByRole('group', { name: 'Tampilan' })).toBeVisible()
  const box = await bar.boundingBox()
  expect(box!.height).toBeLessThanOrEqual(64)
})

test('S2: tombol mode gelap pindah ke drawer, bukan top bar', async ({ page }) => {
  await loginSebagai(page, 'hr', SEMUA_MODUL)
  await expect(page.locator('header.el-top').getByRole('button', { name: 'Mode gelap' })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('button', { name: 'Mode gelap' })).toBeVisible()
})
