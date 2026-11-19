import { test, expect, type Page } from '@playwright/test'

async function mockApi(page: Page, access: { submodules: string[]; flags: Record<string, boolean> }) {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ json: { token: 't', user: { id: 'u', tenantId: 't-1', email: 'hr@demo.test', role: 'hr_admin' } } }),
  )
  await page.route('**/api/me/access', (route) => route.fulfill({ json: access }))
  await page.route(/\/api\/(dna|tna)\//, (route) => route.fulfill({ json: { data: [] } }))
}

// Dev/staging: API mengizinkan login password (PK-16: produksi hanya link email)
const passwordAllowed = (page: Page) => page.route('**/api/auth/methods', (r) => r.fulfill({ json: { password: true, emailLink: true } }))

async function login(page: Page) {
  await passwordAllowed(page)
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill('hr@demo.test')
  await page.getByLabel('Kata sandi').fill(`pw-${Date.now()}`) // API di-mock, nilai bebas
  await page.getByRole('button', { name: 'Masuk' }).click()
}

test('belum login diarahkan ke halaman login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('POC Desember: DNA dan TNA terbuka, INA belum aktif', async ({ page }) => {
  await mockApi(page, {
    submodules: ['cca', 'dna', 'tna', 'ina'],
    flags: { 'module.dna': true, 'module.tna': true, 'module.cca': false, 'module.ina': false },
  })
  await login(page)
  await expect(page.getByTestId('card-tna').getByRole('link', { name: 'Buka' })).toBeVisible()
  await expect(page.getByTestId('card-dna').getByRole('link', { name: 'Buka' })).toBeVisible()
  await expect(page.getByTestId('card-ina')).toContainText('Belum aktif')

  await page.getByTestId('card-tna').getByRole('link', { name: 'Buka' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /TNA/ })).toBeVisible()

  await page.goto('/m/ina')
  await expect(page).toHaveURL(/\/$/)
})

test('login gagal menampilkan pesan', async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Email atau password salah' } } }),
  )
  await login(page)
  await expect(page.getByRole('alert')).toContainText('Email atau password salah')
})

test('organisasi berupa dropdown bila API menyediakan daftar', async ({ page }) => {
  let sent: { tenant?: string } | null = null
  await page.route('**/api/auth/tenants', (route) =>
    route.fulfill({ json: { data: [{ slug: 'demo', name: 'Demo Organisasi' }, { slug: 'elgos', name: 'ELGOS' }] } }),
  )
  await page.route('**/api/auth/login', async (route) => {
    sent = route.request().postDataJSON()
    await route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Email atau password salah' } } })
  })
  await passwordAllowed(page)
  await page.goto('/login')
  await page.getByLabel('Organisasi').selectOption({ label: 'Demo Organisasi' })
  await page.getByLabel('Email').fill('hr@demo.test')
  await page.getByLabel('Kata sandi').fill(`pw-${Date.now()}`)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(sent).toMatchObject({ tenant: 'demo' })
})

// PK-16 / PD-10 ★B: di produksi API mematikan login password
test('produksi: tanpa kolom password, tombol utama mengirim link email', async ({ page }) => {
  let sent: unknown = null
  await page.route('**/api/auth/methods', (r) => r.fulfill({ json: { password: false, emailLink: true } }))
  await page.route('**/api/auth/email-link', async (r) => {
    sent = r.request().postDataJSON()
    await r.fulfill({ status: 202, json: { message: 'Bila email terdaftar di organisasi ini, link masuk sudah dikirim. Periksa kotak masuk Anda.' } })
  })
  await page.goto('/login')
  await expect(page.getByLabel('Kata sandi')).toHaveCount(0)
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill('hr@demo.test')
  await page.getByLabel('Email').press('Enter')
  await expect(page.getByRole('status')).toContainText('link masuk sudah dikirim')
  expect(sent).toEqual({ tenant: 'demo', email: 'hr@demo.test' })
})

test('API tidak menjawab metode login: anggap link email saja', async ({ page }) => {
  await page.route('**/api/auth/methods', (r) => r.fulfill({ status: 500, json: {} }))
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Kirim link masuk' })).toBeVisible()
  await expect(page.getByLabel('Kata sandi')).toHaveCount(0)
})

test('sesi dicabut di server: kembali ke login dengan pesan, lalu ke halaman semula', async ({ page }) => {
  await mockApi(page, { submodules: ['dna', 'tna'], flags: { 'module.dna': true, 'module.tna': true } })
  await login(page)
  await expect(page.getByTestId('card-tna')).toBeVisible()
  // HR mencabut sesi: panggilan API berikutnya dijawab 401
  await page.route(/\/api\/(dna|tna)\//, (route) => route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Sesi tidak valid atau kedaluwarsa' } } }))
  await page.getByTestId('card-tna').getByRole('link', { name: 'Buka' }).click()
  await expect(page).toHaveURL(/\/login\?alasan=sesi-habis&ke=(%2F|\/)m(%2F|\/)tna$/)
  await expect(page.getByTestId('session-expired')).toHaveText('Sesi Anda sudah berakhir. Silakan masuk lagi.')

  await page.route(/\/api\/(dna|tna)\//, (route) => route.fulfill({ json: { data: [] } }))
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill('hr@demo.test')
  await page.getByLabel('Kata sandi').fill(`pw-${Date.now()}`)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page).toHaveURL(/\/m\/tna$/)
})

test('sesi kedaluwarsa (exp JWT lewat) saat halaman terbuka: diarahkan ke login', async ({ page }) => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const token = `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 2 })}.sig`
  await page.route('**/api/auth/methods', (r) => r.fulfill({ json: { password: true, emailLink: true } }))
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token, user: { id: 'u', tenantId: 't-1', email: 'hr@demo.test', role: 'hr_admin' } } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: ['dna'], flags: { 'module.dna': true } } }))
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill('hr@demo.test')
  await page.getByLabel('Kata sandi').fill(`pw-${Date.now()}`)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByTestId('card-dna')).toBeVisible()
  await expect(page).toHaveURL(/\/login\?alasan=sesi-habis/, { timeout: 8000 })
})

test('Keluar mencabut sesi di server', async ({ page }) => {
  let logoutAuth: string | null = null
  await mockApi(page, { submodules: ['dna'], flags: { 'module.dna': true } })
  await page.route('**/api/auth/logout', async (r) => { logoutAuth = r.request().headers()['authorization'] ?? null; await r.fulfill({ status: 204 }) })
  await login(page)
  await page.getByRole('button', { name: 'Keluar', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(logoutAuth).toBe('Bearer t')
})
