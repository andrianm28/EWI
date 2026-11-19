import { test, expect, type Page } from '@playwright/test'

async function mockApi(page: Page, access: { submodules: string[]; flags: Record<string, boolean> }) {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ json: { token: 't', user: { id: 'u', tenantId: 't-1', email: 'hr@demo.test', role: 'hr_admin' } } }),
  )
  await page.route('**/api/me/access', (route) => route.fulfill({ json: access }))
  await page.route(/\/api\/(dna|tna)\//, (route) => route.fulfill({ json: { data: [] } }))
}

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill('hr@demo.test')
  await page.getByLabel('Password').fill(`pw-${Date.now()}`) // API di-mock, nilai bebas
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
  await expect(page.getByRole('heading', { level: 1, name: 'Training Needs' })).toBeVisible() // B5: judul mengikuti mockup

  await page.goto('/m/ina')
  await expect(page).toHaveURL(/\/$/)
})

test('login gagal menampilkan pesan', async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Email atau password salah' } } }),
  )
  await login(page)
  await expect(page.getByRole('alert')).toHaveText('Email atau password salah')
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
  await page.goto('/login')
  await page.getByLabel('Organisasi').selectOption({ label: 'Demo Organisasi' })
  await page.getByLabel('Email').fill('hr@demo.test')
  await page.getByLabel('Password').fill(`pw-${Date.now()}`)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(sent).toMatchObject({ tenant: 'demo' })
})
