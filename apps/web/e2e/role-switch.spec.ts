import { test, expect, type Page, type Route } from '@playwright/test'

// B2: ganti tampilan memakai peran aktif di API (POST /auth/switch-role). Spek: docs/designs/b2-peran.md.
// Rute uji didaftarkan lewat localStorage (build VITE_UI_KIT=1), seperti e2e shell B0.
const ROLES = [
  { role: 'hr_admin', view: 'hr', label: 'HR / L&D' },
  { role: 'learner', view: 'karyawan', label: 'Karyawan (saya)' },
]
const ROUTES = [{ name: 'my', views: ['karyawan'] }, { name: 'dash', views: ['hr', 'atasan'] }]
const base = { id: 'u-1', tenantId: 't-1', email: 'hr@demo.test', roles: ['hr_admin', 'learner'], tenantName: 'Demo Organisasi' }

const bearer = (r: Route) => r.request().headers()['authorization'] ?? ''

async function setup(page: Page, { switchStatus = 200 }: { switchStatus?: number } = {}) {
  const calls: unknown[] = []
  await page.addInitScript((r) => localStorage.setItem('elgos.test-routes', JSON.stringify(r)), ROUTES)
  await page.route('**/api/auth/tenants', (r) => r.fulfill({ json: { data: [] } }))
  await page.route(/\/api\/auth\/methods(\?.*)?$/, (r) => r.fulfill({ json: { password: true, emailLink: true } }))
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token: 'tok-hr', user: { ...base, role: 'hr_admin' } } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user: { ...base, role: bearer(r).includes('tok-karyawan') ? 'learner' : 'hr_admin' } } }))
  await page.route('**/api/me/access', (r) => {
    const asEmployee = bearer(r).includes('tok-karyawan')
    return r.fulfill({ json: { submodules: [], flags: {}, roles: ROLES, role: asEmployee ? 'learner' : 'hr_admin', view: asEmployee ? 'karyawan' : 'hr' } })
  })
  await page.route('**/api/auth/switch-role', async (r) => {
    calls.push({ body: r.request().postDataJSON(), auth: bearer(r) })
    if (switchStatus !== 200) return r.fulfill({ status: switchStatus, json: { error: { code: 'ROLE_VIEW_CHANGED', message: 'Tampilan sudah berganti di tab lain. Muat ulang halaman.' } } })
    return r.fulfill({ json: { token: 'tok-karyawan', user: { ...base, role: 'learner', view: 'karyawan' } } })
  })
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill('hr@demo.test')
  await page.getByLabel('Kata sandi').fill('x')
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
  return calls
}

test('pemilih tampilan memanggil ganti peran di API; token baru dipakai; tampilan mengikuti peran aktif', async ({ page }) => {
  const calls = await setup(page)
  const views = page.getByRole('group', { name: 'Tampilan' })
  await expect(views.getByRole('button')).toHaveText(['HR / L&D', 'Karyawan (saya)'])
  await expect(views.getByRole('button', { name: 'HR / L&D' })).toHaveAttribute('aria-pressed', 'true')

  await views.getByRole('button', { name: 'Karyawan (saya)' }).click()
  await expect(page).toHaveURL(/\/uji\/my$/)
  await expect(page.getByTestId('identitas')).toContainText('Karyawan')
  expect(calls).toEqual([{ body: { role: 'learner' }, auth: 'Bearer tok-hr' }])

  // Muat ulang: tampilan aktif dibaca dari API (token karyawan), bukan dari pilihan di browser
  await page.reload()
  await expect(views.getByRole('button', { name: 'Karyawan (saya)' })).toHaveAttribute('aria-pressed', 'true')
})

test('tautan langsung ke layar HR dari tampilan karyawan mengganti peran aktif lewat API', async ({ page }) => {
  const calls = await setup(page)
  await page.getByRole('group', { name: 'Tampilan' }).getByRole('button', { name: 'Karyawan (saya)' }).click()
  await expect(page).toHaveURL(/\/uji\/my$/)
  await page.route('**/api/auth/switch-role', (r) => {
    calls.push({ body: r.request().postDataJSON(), auth: bearer(r) })
    return r.fulfill({ json: { token: 'tok-hr', user: { ...base, role: 'hr_admin', view: 'hr' } } })
  })
  await page.goto('/uji/dash')
  await expect(page.getByRole('group', { name: 'Tampilan' }).getByRole('button', { name: 'HR / L&D' })).toHaveAttribute('aria-pressed', 'true')
  expect(calls.at(-1)).toEqual({ body: { role: 'hr_admin' }, auth: 'Bearer tok-karyawan' })
})

test('ganti peran ditolak API: tampilan tidak berubah', async ({ page }) => {
  await setup(page, { switchStatus: 409 })
  const views = page.getByRole('group', { name: 'Tampilan' })
  await views.getByRole('button', { name: 'Karyawan (saya)' }).click()
  await expect(views.getByRole('button', { name: 'HR / L&D' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/\/uji\/dash$/)
})
