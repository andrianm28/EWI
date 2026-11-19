import { test, expect, type Page } from '@playwright/test'

// Shell ELGOS (B0): menu per tampilan, accordion, ganti tampilan, tema, drawer layar sempit.
// Spek: docs/designs/b0-fondasi-ui.md. API di-mock; rute uji didaftarkan lewat localStorage (build VITE_UI_KIT=1).
const SUBMODULES = ['cca', 'dna', 'tna', 'ina']
const FLAGS: Record<string, boolean> = { 'module.dna': true, 'module.tna': true, 'module.cca': false, 'module.ina': false }

interface TestRoute { name: string; views?: string[]; flag?: string; submodule?: string; menuKey?: string; roles?: string[] }
interface Opts { role?: string; roles?: string[]; flags?: Record<string, boolean>; routes?: TestRoute[]; tenantName?: string }

async function loginAs(page: Page, o: Opts = {}) {
  const role = o.role ?? 'hr_admin'
  const user = { id: 'u-1', tenantId: 't-1', email: `${role}@demo.test`, role, ...(o.roles ? { roles: o.roles } : {}), ...(o.tenantName ? { tenantName: o.tenantName } : {}) }
  if (o.routes) await page.addInitScript((r) => localStorage.setItem('elgos.test-routes', JSON.stringify(r)), o.routes)
  await page.route('**/api/auth/tenants', (r) => r.fulfill({ json: { data: [] } }))
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token: 't', user } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: SUBMODULES, flags: { ...FLAGS, ...o.flags } } }))
  await page.route(/\/api\/(dna|tna)\//, (r) => r.fulfill({ json: { data: [] } }))
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(`pw-${Date.now()}`)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigasi utama' })

test('HR: menu berisi Beranda dan grup Learning Needs Analysis; modul yang flag-nya mati tidak tampil', async ({ page }) => {
  await loginAs(page, { routes: [{ name: 'ina', submodule: 'ina' }, { name: 'lim', flag: 'module.lim' }] })
  await expect(nav(page).getByRole('link')).toHaveText(['Beranda', 'Developmental Needs', 'Training Needs'])
  await expect(nav(page).getByRole('button', { name: 'Learning Needs Analysis' })).toHaveAttribute('aria-expanded', 'true')
  await expect(nav(page).getByRole('link', { name: 'Beranda' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('judul-layar')).toHaveText('Beranda')
  await expect(page.getByTestId('identitas')).toHaveText('HR / L&D · hr_admin@demo.test')
  await expect(page.getByText('Log audit aktif')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Tampilan' })).toHaveCount(0)
})

test('HR: butir muncul begitu rutenya terdaftar dan flag-nya menyala', async ({ page }) => {
  await loginAs(page, {
    flags: { 'module.ina': true, 'module.lim': true },
    routes: [{ name: 'ina', submodule: 'ina' }, { name: 'lim', flag: 'module.lim' }, { name: 'cp', flag: 'promotion.recommendation' }],
  })
  await expect(nav(page).getByRole('link')).toHaveText(['Beranda', 'Developmental Needs', 'Training Needs', 'Improvement Needs', 'Learning Impact Measurement'])
  await nav(page).getByRole('link', { name: 'Improvement Needs' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Layar uji: ina' })).toBeVisible()
  await expect(page.getByTestId('judul-layar')).toHaveText('Improvement Needs')
  await expect(page).toHaveTitle('Improvement Needs · ELGOS')
  // Rute dengan flag mati tidak bisa dibuka lewat alamat langsung
  await page.goto('/uji/cp')
  await expect(page).toHaveURL(/\/$/)
})

test('accordion: grup menutup dan membuka, dan tetap tertutup setelah pindah halaman', async ({ page }) => {
  await loginAs(page)
  const group = nav(page).getByRole('button', { name: 'Learning Needs Analysis' })
  await nav(page).getByRole('link', { name: 'Training Needs' }).click()
  await expect(nav(page).getByRole('link', { name: 'Training Needs' })).toHaveAttribute('aria-current', 'page')
  await group.click()
  await expect(group).toHaveAttribute('aria-expanded', 'false')
  await expect(nav(page).getByRole('link', { name: 'Training Needs' })).toBeHidden()
  await nav(page).getByRole('link', { name: 'Beranda' }).click()
  await expect(page.getByTestId('card-dna')).toBeVisible()
  await expect(group).toHaveAttribute('aria-expanded', 'false')
  await group.click()
  await expect(nav(page).getByRole('link', { name: 'Training Needs' })).toBeVisible()
})

test('layar anak menyalakan butir induknya lewat meta.menuKey', async ({ page }) => {
  await loginAs(page, { routes: [{ name: 'gap', menuKey: 'tna' }] })
  await page.goto('/uji/gap')
  await expect(nav(page).getByRole('link', { name: 'Training Needs' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('judul-layar')).toHaveText('Training Needs')
})

test('karyawan: menu peralihan tanpa grup dan tanpa pemilih tampilan', async ({ page }) => {
  await loginAs(page, { role: 'learner' })
  await expect(nav(page).getByRole('link')).toHaveText(['Beranda', 'Developmental Needs', 'Training Needs'])
  await expect(nav(page).getByRole('button')).toHaveCount(0)
  await expect(page.getByTestId('identitas')).toContainText('Karyawan')
  await expect(page.getByRole('group', { name: 'Tampilan' })).toHaveCount(0)
})

test('atasan: beranda tampilan, label, dan menu sesuai tampilan', async ({ page }) => {
  await loginAs(page, { role: 'supervisor', routes: [{ name: 'dash', views: ['hr', 'atasan'] }] })
  await expect(page).toHaveURL(/\/uji\/dash$/)
  await expect(nav(page).getByRole('link')).toHaveText(['Dashboard tim', 'Developmental Needs', 'Training Needs'])
  await expect(page.getByTestId('identitas')).toContainText('Atasan')
})

test('Admin ETA: tampilan Super Admin dengan baris konsol platform', async ({ page }) => {
  await loginAs(page, { role: 'eta_admin' })
  await expect(nav(page).getByRole('link')).toHaveText(['Beranda', 'Developmental Needs', 'Training Needs'])
  await expect(page.getByTestId('identitas')).toContainText('Super Admin')
  await expect(page.getByText('Konsol platform ELGOS · semua tenant')).toBeVisible()
})

test('ganti tampilan: HR pindah ke Karyawan (saya), menu berganti, pilihan bertahan setelah muat ulang', async ({ page }) => {
  await loginAs(page, { roles: ['hr_admin'], tenantName: 'Demo Organisasi', routes: [{ name: 'my', views: ['karyawan'] }, { name: 'dash', views: ['hr', 'atasan'] }] })
  await expect(page).toHaveURL(/\/uji\/dash$/)
  await expect(page.getByText('Demo Organisasi')).toBeVisible()
  const views = page.getByRole('group', { name: 'Tampilan' })
  await expect(views.getByRole('button')).toHaveText(['HR / L&D', 'Karyawan (saya)'])
  await expect(views.getByRole('button', { name: 'HR / L&D' })).toHaveAttribute('aria-pressed', 'true')
  await expect(nav(page).getByRole('link').first()).toHaveText('Dashboard utama')

  await views.getByRole('button', { name: 'Karyawan (saya)' }).click()
  await expect(page).toHaveURL(/\/uji\/my$/)
  await expect(nav(page).getByRole('link')).toHaveText(['Hasil saya'])
  await expect(page.getByTestId('identitas')).toContainText('Karyawan')

  await page.reload()
  await expect(nav(page).getByRole('link')).toHaveText(['Hasil saya'])
  await expect(views.getByRole('button', { name: 'Karyawan (saya)' })).toHaveAttribute('aria-pressed', 'true')

  // Tautan langsung ke layar HR memindahkan tampilan kembali
  await page.goto('/uji/dash')
  await expect(views.getByRole('button', { name: 'HR / L&D' })).toHaveAttribute('aria-pressed', 'true')
})

test('layar beranda di balik flag mati: tetap Beranda lama, butir peralihan bertahan, tampilan tambahan tidak ditawarkan', async ({ page }) => {
  // Paket beranda (B3, B8) mendaftarkan rutenya di balik flag default mati. Selama flag mati, menu dan
  // pemilih tampilan harus sama seperti sebelum rute itu ada.
  await loginAs(page, {
    roles: ['hr_admin'],
    routes: [{ name: 'dash', views: ['hr', 'atasan'], flag: 'dashboard.main' }, { name: 'my', views: ['karyawan'], flag: 'my.results' }],
  })
  await expect(page).toHaveURL(/\/$/)
  await expect(nav(page).getByRole('link')).toHaveText(['Beranda', 'Developmental Needs', 'Training Needs'])
  await expect(page.getByRole('group', { name: 'Tampilan' })).toHaveCount(0)
  await page.goto('/uji/dash')
  await expect(page).toHaveURL(/\/$/)
})

test('layar beranda di balik flag menyala: menjadi beranda dan Beranda lama hilang dari menu', async ({ page }) => {
  await loginAs(page, { flags: { 'dashboard.main': true }, routes: [{ name: 'dash', views: ['hr', 'atasan'], flag: 'dashboard.main' }] })
  await expect(page).toHaveURL(/\/uji\/dash$/)
  await expect(nav(page).getByRole('link')).toHaveText(['Dashboard utama', 'Developmental Needs', 'Training Needs'])
})

test('meta.roles: peran asli di luar daftar tidak mendapat butir menu dan tidak bisa membuka rutenya', async ({ page }) => {
  // pimpinan memakai tampilan Atasan, tetapi rute ini hanya untuk supervisor dan HR
  await loginAs(page, { role: 'pimpinan', routes: [{ name: 'dash', views: ['hr', 'atasan'], roles: ['hr_admin', 'supervisor'] }] })
  await expect(page).toHaveURL(/\/$/)
  await expect(nav(page).getByRole('link')).toHaveText(['Beranda', 'Developmental Needs', 'Training Needs'])
  await page.goto('/uji/dash')
  await expect(page).toHaveURL(/\/$/)
})

test('tinjauan hasil AI lama: HR bisa membuka, atasan dikembalikan ke beranda', async ({ page }) => {
  await loginAs(page, { role: 'supervisor' })
  await page.goto('/m/tna/review')
  await expect(page).toHaveURL(/\/$/)
})

test('tampilan tersimpan yang tidak valid diabaikan', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('ewi.view', 'super'))
  await loginAs(page, { role: 'learner' })
  await expect(page.getByTestId('identitas')).toContainText('Karyawan')
})

test('rute tampilan lain yang tidak dimiliki akun mengarah ke beranda', async ({ page }) => {
  await loginAs(page, { role: 'learner', routes: [{ name: 'tenants', views: ['super'] }] })
  await page.goto('/uji/tenants')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByTestId('card-dna')).toBeVisible()
})

test('lewati ke konten: muncul pada Tab pertama dan memindahkan fokus ke konten', async ({ page }) => {
  await loginAs(page)
  await page.reload()
  await expect(nav(page)).toBeVisible()
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Lewati ke konten utama' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()
  await page.keyboard.press('Enter')
  await expect(page.locator('#isi')).toBeFocused()
})

test('tema: tombol mengubah data-theme dan pilihan bertahan setelah muat ulang', async ({ page }) => {
  await loginAs(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(248, 249, 252)')
  await page.getByRole('button', { name: 'Mode gelap' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 20, 24)')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: 'Mode gelap' })).toHaveAttribute('aria-pressed', 'true')
})

test.describe('tema sistem gelap', () => {
  test.use({ colorScheme: 'dark' })
  test('tanpa pilihan pengguna mengikuti prefers-color-scheme', async ({ page }) => {
    await page.goto('/ui-kit')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })
})

test.describe('layar sempit', () => {
  test.use({ viewport: { width: 600, height: 800 } })
  test('drawer tersembunyi, dibuka lewat tombol menu, ditutup dengan Esc', async ({ page }) => {
    await loginAs(page)
    await expect(page.getByRole('link', { name: 'Training Needs' })).toBeHidden()
    const menu = page.getByRole('button', { name: 'Menu' })
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
    await menu.click()
    await expect(menu).toHaveAttribute('aria-expanded', 'true')
    await expect(nav(page).getByRole('link', { name: 'Beranda' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('link', { name: 'Training Needs' })).toBeHidden()
    await expect(menu).toBeFocused()
    await menu.click()
    await nav(page).getByRole('link', { name: 'Training Needs' }).click()
    await expect(page).toHaveURL(/\/m\/tna$/)
    await expect(page.getByRole('link', { name: 'Beranda' })).toBeHidden()
  })

  test('drawer menutup saat pindah antar layar yang memakai komponen sama, dan lewat klik scrim', async ({ page }) => {
    // Dua rute uji memakai komponen yang sama, jadi kerangka tidak dipasang ulang: yang menutup adalah kodenya
    await loginAs(page, { flags: { 'module.ina': true, 'module.lim': true }, routes: [{ name: 'ina', submodule: 'ina' }, { name: 'lim', flag: 'module.lim' }] })
    const menu = page.getByRole('button', { name: 'Menu' })
    await page.goto('/uji/ina')
    await menu.click()
    await nav(page).getByRole('link', { name: 'Learning Impact Measurement' }).click()
    await expect(page).toHaveURL(/\/uji\/lim$/)
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
    await expect(nav(page).getByRole('link', { name: 'Beranda' })).toBeHidden()

    await menu.click()
    // Isi di belakang scrim tidak bisa difokus selama drawer terbuka
    expect(await page.evaluate("document.querySelector('.el-app__main').inert")).toBe(true)
    await page.getByTestId('scrim').click({ position: { x: 550, y: 400 } })
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
    expect(await page.evaluate("document.querySelector('.el-app__main').inert")).toBe(false)
  })
})

test('keluar kembali ke login dan menghapus tampilan tersimpan', async ({ page }) => {
  await loginAs(page, { roles: ['hr_admin'], routes: [{ name: 'my', views: ['karyawan'] }] })
  await page.getByRole('group', { name: 'Tampilan' }).getByRole('button', { name: 'Karyawan (saya)' }).click()
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('ewi.view'))).toBe('karyawan')
  await page.getByRole('button', { name: 'Keluar' }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(() => [sessionStorage.getItem('ewi.view'), sessionStorage.getItem('ewi.token')])).toEqual([null, null])
})

test('shell + Beranda: snapshot visual', async ({ page }) => {
  await loginAs(page, { tenantName: 'Demo Organisasi' })
  await expect(page.getByTestId('card-dna')).toBeVisible()
  await page.evaluate('document.fonts.ready.then(() => true)')
  await expect(page).toHaveScreenshot('shell-beranda-terang.png', { fullPage: true })
  await page.getByRole('button', { name: 'Mode gelap' }).click()
  await expect(page).toHaveScreenshot('shell-beranda-gelap.png', { fullPage: true })
})
