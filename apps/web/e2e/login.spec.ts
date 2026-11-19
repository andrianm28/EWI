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

test('akun dengan verifikasi dua langkah: kata sandi benar membuka langkah kode, kode benar masuk', async ({ page }) => {
  await mockBase(page, { password: true })
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { mfaRequired: true, challenge: 'ch-1' } }))
  let verified: unknown = null
  await page.route('**/api/auth/mfa/verify', async (r) => {
    verified = r.request().postDataJSON()
    const body = verified as { code: string }
    if (body.code !== '123456') return r.fulfill({ status: 401, json: { error: { code: 'MFA_CODE_INVALID', message: 'Kode verifikasi salah atau sudah dipakai' } } })
    return r.fulfill({ json: { token: 'tok', user } })
  })
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill('hr@demo.test')
  await page.getByLabel('Kata sandi').fill(`pw-${Date.now()}`)
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Verifikasi dua langkah' })).toBeVisible()
  await expect(page.getByText('untuk hr@demo.test')).toBeVisible()
  await page.getByLabel('Kode verifikasi').fill('12')
  await page.getByRole('button', { name: 'Verifikasi dan masuk' }).click()
  await expect(page.getByRole('alert')).toContainText('Masukkan 6 digit kode verifikasi')
  await page.getByLabel('Kode verifikasi').fill('000000')
  await page.getByRole('button', { name: 'Verifikasi dan masuk' }).click()
  await expect(page.getByRole('alert')).toContainText('Kode verifikasi salah')
  await page.getByLabel('Kode verifikasi').fill('123456')
  await page.getByRole('button', { name: 'Verifikasi dan masuk' }).click()
  await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
  expect(verified).toEqual({ challenge: 'ch-1', code: '123456' })
})

test('langkah kode: Kembali ke formulir awal', async ({ page }) => {
  await mockBase(page, { password: true })
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { mfaRequired: true, challenge: 'ch-1' } }))
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill('hr@demo.test')
  await page.getByLabel('Kata sandi').fill('x')
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await page.getByRole('button', { name: 'Kembali' }).click()
  await expect(page.getByRole('heading', { name: 'Masuk ke ELGOS' })).toBeVisible()
})

test('link email untuk akun dengan verifikasi dua langkah: minta kode setelah link ditukar', async ({ page }) => {
  await mockBase(page)
  await page.route('**/api/auth/email-link/verify', (r) => r.fulfill({ json: { mfaRequired: true, challenge: 'ch-2' } }))
  await page.route('**/api/auth/mfa/verify', (r) => r.fulfill({ json: { token: 'tok', user } }))
  await page.goto('/masuk#token=abcdefghijklmnopqrstuvwxyz0123')
  await page.getByRole('button', { name: 'Lanjutkan masuk' }).click()
  await page.getByLabel('Kode verifikasi').fill('654321')
  await page.getByRole('button', { name: 'Verifikasi dan masuk' }).click()
  await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
})
