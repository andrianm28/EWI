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

// Paritas P4 (docs/designs/paritas-mockup/p4-login.md): langkah 2 dan /masuk memakai tata letak login mockup.
const pesanTerkirim = 'Bila email terdaftar di organisasi ini, link masuk sudah dikirim. Periksa kotak masuk Anda.'

test('P4 L2: setelah kirim link, panel kanan berganti ke "Periksa email Anda" dengan Kirim ulang dan Kembali', async ({ page }) => {
  await mockBase(page)
  const kiriman: unknown[] = []
  await page.route('**/api/auth/email-link', async (r) => {
    kiriman.push(r.request().postDataJSON())
    await r.fulfill({ status: 202, json: { message: pesanTerkirim } })
  })
  await page.goto('/login?org=demo')
  await page.getByLabel('Email kerja').fill('hr@demo.test')
  await page.getByRole('button', { name: 'Kirim link masuk' }).click()

  const h1 = page.getByRole('heading', { level: 1, name: 'Periksa email Anda' })
  await expect(h1).toBeVisible()
  await expect(h1).toBeFocused()
  await expect(page.locator('#isi-login')).toContainText('hr@demo.test')
  await expect(page.getByRole('status')).toContainText('link masuk sudah dikirim')
  await expect(page.getByLabel('Email kerja')).toHaveCount(0)
  await expect(page.getByLabel('Kata sandi')).toHaveCount(0)
  await expect(page.getByLabel('Kode verifikasi')).toHaveCount(0)
  await expect(page.getByText('Sesi dienkripsi · percobaan masuk dicatat di log audit tenant')).toBeVisible()

  await page.getByRole('button', { name: 'Kirim ulang' }).click()
  await expect.poll(() => kiriman.length).toBe(2)
  expect(kiriman[1]).toEqual({ tenant: 'demo', email: 'hr@demo.test' })

  await page.getByRole('button', { name: 'Kembali' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Masuk ke ELGOS' })).toBeVisible()
  await expect(page.getByLabel('Email kerja')).toHaveValue('hr@demo.test')
  await expect(page.getByLabel('Organisasi')).toHaveValue('demo')
})

test('P4 L2: kirim ulang ditolak server, galat tampil di ringkasan langkah 2', async ({ page }) => {
  await mockBase(page)
  let n = 0
  await page.route('**/api/auth/email-link', async (r) => {
    n += 1
    if (n === 1) return r.fulfill({ status: 202, json: { message: pesanTerkirim } })
    return r.fulfill({ status: 429, json: { error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan link. Coba lagi nanti.' } } })
  })
  await page.goto('/login?org=demo')
  await page.getByLabel('Email kerja').fill('hr@demo.test')
  await page.getByRole('button', { name: 'Kirim link masuk' }).click()
  await page.getByRole('button', { name: 'Kirim ulang' }).click()
  await expect(page.getByRole('alert')).toContainText('Terlalu banyak permintaan link')
  await expect(page.getByRole('heading', { level: 1, name: 'Periksa email Anda' })).toBeVisible()
})

test('P4 L1: /masuk memakai tata letak login dua panel, UiButton, dan meta mono tanpa kelas Tailwind lama', async ({ page }) => {
  await mockBase(page)
  await page.goto('/masuk#token=abcdefghijklmnopqrstuvwxyz0123')
  await expect(page.getByRole('complementary', { name: 'Tentang ELGOS' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Masuk ke ELGOS' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lanjutkan masuk' })).toHaveClass(/el-btn--filled/)
  await expect(page.getByRole('link', { name: 'Ke halaman login' })).toHaveClass(/el-btn--text/)
  await expect(page.locator('.el-audit')).toHaveText('Sesi dienkripsi · percobaan masuk dicatat di log audit tenant')
  await expect(page.locator('[class*="slate"], [class*="bg-white"], [class*="blue-700"]')).toHaveCount(0)
})

test('P4 L1: /masuk tanpa token menampilkan ringkasan galat dan tautan ke login, tanpa tombol lanjut', async ({ page }) => {
  await mockBase(page)
  await page.goto('/masuk')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Ada masalah')
  await expect(alert).toContainText('Link tidak lengkap. Minta link masuk baru di halaman login.')
  await expect(page.getByRole('button', { name: 'Lanjutkan masuk' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Ke halaman login' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('P4 L1: token ditolak server, pesan tampil di ringkasan galat', async ({ page }) => {
  await mockBase(page)
  await page.route('**/api/auth/email-link/verify', (r) => r.fulfill({ status: 401, json: { error: { code: 'LINK_INVALID', message: 'Link masuk tidak valid atau sudah dipakai' } } }))
  await page.goto('/masuk#token=abcdefghijklmnopqrstuvwxyz0123')
  await page.getByRole('button', { name: 'Lanjutkan masuk' }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Ada masalah')
  await expect(alert).toContainText('Link masuk tidak valid atau sudah dipakai')
})

test('P4 L3-L6: token judul, logo, meta, dan ukuran panel mengikuti mockup', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mockBase(page)
  await page.goto('/login')
  const h1 = page.getByRole('heading', { level: 1, name: 'Masuk ke ELGOS' })
  await expect(h1).toHaveCSS('font-size', '24px')
  await expect(h1).toHaveCSS('line-height', '32px')
  await expect(h1).toHaveCSS('font-weight', '400')
  const kiri = page.getByRole('complementary', { name: 'Tentang ELGOS' })
  const logo = kiri.getByText('EG', { exact: true })
  await expect(logo).toHaveCSS('border-radius', '12px')
  await expect(logo).toHaveCSS('font-weight', '700')
  await expect(logo).toHaveCSS('font-size', '15px')
  await expect(kiri.locator('svg').first()).toHaveAttribute('width', '22')
  const meta = page.locator('.el-audit')
  await expect(meta).toHaveCSS('font-size', '11px')
  await expect(meta).toHaveCSS('font-family', /Roboto Mono/)
  await expect(meta).toHaveCSS('margin-top', '28px')
  await expect(page.locator('.lg-c')).toHaveCSS('max-width', '420px')
  const bKiri = await kiri.boundingBox()
  const bKanan = await page.locator('#isi-login').boundingBox()
  expect(bKiri && bKanan && Math.abs(bKiri.y - bKanan.y) < 1 && bKanan.x >= bKiri.x + bKiri.width - 1).toBeTruthy()
})

test('P4 L7: layar sempit, panel kiri di atas dengan semua teks, tanpa gulir horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 })
  await mockBase(page)
  await page.goto('/login')
  await expect(page.getByText('Kebutuhan belajar yang terukur, keputusan talenta yang berbukti.')).toBeVisible()
  await expect(page.getByText(/Platform analisis dan pengembangan kompetensi/)).toBeVisible()
  await expect(page.getByText(/Workforce intelligence berbasis AI/)).toBeVisible()
  const bKiri = await page.getByRole('complementary', { name: 'Tentang ELGOS' }).boundingBox()
  const bKanan = await page.locator('#isi-login').boundingBox()
  expect(bKiri && bKanan && bKanan.y >= bKiri.y + bKiri.height - 1).toBeTruthy()
  const melebar = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(melebar).toBe(false)
})
