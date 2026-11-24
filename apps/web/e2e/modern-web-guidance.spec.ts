import { test, expect, type Page } from '@playwright/test'
import { loginSebagai, navigasi } from './support/sesi'
import { mockApi, mockApiDasar } from './support/api'
import { papanGapTna } from './support/tna-gap'
import { penanganLdDemo } from './support/demo-modul'
import { penanganDashboardDemo, penanganShellDemo, SESI_DEMO } from './support/demo'

// Audit modern-web-guidance 24 Nov (docs/designs/paritas-mockup/egm/modern-web-guidance-24nov.md):
// perilaku aksesibilitas layar demo yang tidak terlihat di snapshot.

/** Setiap aria-controls di halaman menunjuk elemen yang ada (IDREF menggantung adalah galat ARIA). */
async function ariaControlsMenggantung(page: Page): Promise<string[]> {
  // String, bukan fungsi: tsconfig e2e tidak memuat lib DOM (pola yang sama di spec lain)
  return page.evaluate(`[...document.querySelectorAll('[aria-controls]')].flatMap((el) =>
    el.getAttribute('aria-controls').split(/\\s+/).filter((id) => id && !document.getElementById(id))
      .map((id) => (el.textContent.trim() || el.tagName) + ': #' + id))`)
}

const gulirY = (page: Page) => page.evaluate<number>('window.scrollY')

test('tab layar demo tidak menunjuk panel yang tidak dirender (Training Needs, Learning Delivery)', async ({ page }) => {
  await mockApiDasar(page, penanganShellDemo)
  await mockApi(page, papanGapTna({ peran: 'hr' }).penangan)
  await mockApi(page, penanganDashboardDemo)
  await mockApi(page, penanganLdDemo)
  await loginSebagai(page, 'hr', SESI_DEMO())

  await navigasi(page).getByRole('link', { name: 'Training Needs', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Ringkasan' })).toHaveAttribute('aria-selected', 'true')
  expect(await ariaControlsMenggantung(page)).toEqual([])

  await navigasi(page).getByRole('link', { name: 'Learning Delivery', exact: true }).click()
  await page.getByRole('tab', { name: 'Pelatihan offline', exact: true }).click()
  await expect(page.getByRole('tabpanel')).not.toBeEmpty()
  expect(await ariaControlsMenggantung(page)).toEqual([])
})

test('dialog modal: gulir di atas backdrop tidak menggulir halaman di belakangnya', async ({ page }) => {
  await mockApiDasar(page, penanganShellDemo)
  await mockApi(page, papanGapTna({ peran: 'hr' }).penangan)
  await mockApi(page, penanganDashboardDemo)
  await loginSebagai(page, 'hr', SESI_DEMO())
  await page.getByTestId('pareto-baris').first().click()
  const buka = page.getByRole('button', { name: 'Mulai wawancara akar masalah' })
  await expect(buka).toBeVisible()
  // Halaman dibuat lebih tinggi dari viewport supaya ada yang bisa tergulir di belakang dialog
  await page.addStyleTag({ content: 'body { min-height: 300vh; }' })
  await buka.click()
  const dialog = page.getByRole('dialog', { name: 'Tugaskan wawancara akar masalah' })
  await expect(dialog).toBeVisible()

  const awal = await gulirY(page)
  await page.mouse.move(8, 8) // pojok kiri atas: backdrop, di luar kotak dialog
  await page.mouse.wheel(0, 800)
  await page.waitForTimeout(300)
  expect(await gulirY(page)).toBe(awal)

  // Esc tetap menutup dan fokus kembali ke tombol pembuka
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(buka).toBeFocused()
})
