import { test, expect, type Page } from '@playwright/test'

// B1: layar masuk mengikuti mockup Pak Eji. Spek: docs/designs/b1-login.md. API di-mock.
const user = { id: 'u-1', tenantId: 't-1', email: 'hr@demo.test', role: 'hr_admin' }

async function mockBase(page: Page, { password = false, sso = false } = {}) {
  await page.route('**/api/auth/tenants', (r) => r.fulfill({ json: { data: [] } }))
  await page.route(/\/api\/auth\/methods(\?.*)?$/, (r) => {
    const withTenant = new URL(r.request().url()).searchParams.has('tenant')
    return r.fulfill({ json: { password, emailLink: true, sso: withTenant && sso } })
  })
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: [], flags: {} } }))
}

test('panel kepercayaan memakai klaim UU PDP saja, tanpa kartu demo, dengan catatan audit', async ({ page }) => {
  await mockBase(page)
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Masuk ke ELGOS' })).toBeVisible()
  await expect(page.getByText('Dirancang mengikuti UU PDP No. 27/2022')).toBeVisible()
  await expect(page.getByText(/OJK/)).toHaveCount(0)
  await expect(page.getByText(/khusus demo/i)).toHaveCount(0)
  await expect(page.getByText('Sesi dienkripsi · percobaan masuk dicatat di log audit tenant')).toBeVisible()
})

test('?org= mengisi organisasi; tombol SSO hanya muncul bila organisasi itu menyalakan SSO', async ({ page }) => {
  await mockBase(page, { sso: true })
  let ssoBody: unknown = null
  await page.route('**/api/auth/sso/start', async (r) => {
    ssoBody = r.request().postDataJSON()
    await r.fulfill({ status: 501, json: { error: { code: 'SSO_NOT_CONFIGURED', message: 'SSO perusahaan belum dihubungkan. Masuk lewat link email.' } } })
  })
  await page.goto('/login?org=demo')
  await expect(page.getByLabel('Organisasi')).toHaveValue('demo')
  const ssoBtn = page.getByRole('button', { name: 'Masuk dengan SSO perusahaan' })
  await expect(ssoBtn).toBeVisible()
  await ssoBtn.click()
  await expect(page.getByRole('alert')).toContainText('SSO perusahaan belum dihubungkan')
  expect(ssoBody).toEqual({ tenant: 'demo' })
})

test('tanpa SSO: tombol SSO tidak ada; kolom kosong ditandai di ringkasan galat', async ({ page }) => {
  await mockBase(page)
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Masuk dengan SSO perusahaan' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Kirim link masuk' }).click()
  const summary = page.getByRole('alert')
  await expect(summary).toContainText('Isi organisasi Anda')
  await expect(summary).toContainText('Isi email kerja Anda')
  await summary.getByRole('link', { name: 'Isi email kerja Anda' }).click()
  await expect(page.getByLabel('Email kerja')).toBeFocused()
})

test('tanpa verifikasi dua langkah: link email yang ditukar langsung masuk, tanpa langkah kode', async ({ page }) => {
  await mockBase(page)
  await page.route('**/api/auth/email-link/verify', (r) => r.fulfill({ json: { token: 'tok', user } }))
  await page.goto('/masuk#token=abcdefghijklmnopqrstuvwxyz0123')
  await page.getByRole('button', { name: 'Lanjutkan masuk' }).click()
  await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
  await expect(page.getByLabel('Kode verifikasi')).toHaveCount(0)
})
