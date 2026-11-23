import { test, expect, type Page } from '@playwright/test'
import { DASHBOARD_HR as HR_DATA } from './support/dashboard'

// B3 Dashboard utama (HR) dan Dashboard tim (atasan). Spek: docs/designs/b3-dashboard.md.
// Seam yang diuji: layar /dashboard lewat browser, dengan GET /api/dashboard di-mock.
const SUBMODULES = ['cca', 'dna', 'tna', 'ina']
const BASE_FLAGS: Record<string, boolean> = { 'module.dna': true, 'module.tna': true, 'dashboard.main': true }

interface Opts { role?: string; roles?: string[]; flags?: Record<string, boolean>; dashboard?: unknown; status?: number }

async function loginAs(page: Page, o: Opts = {}) {
  const role = o.role ?? 'hr_admin'
  const user = { id: 'u-1', tenantId: 't-1', email: `${role}@demo.test`, role, ...(o.roles ? { roles: o.roles } : {}) }
  await page.route('**/api/auth/tenants', (r) => r.fulfill({ json: { data: [] } }))
  // PK-16: form kata sandi hanya tampil bila API mengizinkan (dev/staging)
  await page.route('**/api/auth/methods', (r) => r.fulfill({ json: { password: true, emailLink: true } }))
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token: 't', user } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: SUBMODULES, products: ['dna', 'tna'], flags: { ...BASE_FLAGS, ...o.flags } } }))
  await page.route(/\/api\/(dna|tna)\//, (r) => r.fulfill({ json: { data: [] } }))
  await page.route('**/api/dashboard', (r) => (o.status
    ? r.fulfill({ status: o.status, json: { error: { code: 'X', message: 'Layanan sedang gangguan' } } })
    : r.fulfill({ json: { data: o.dashboard ?? HR_DATA } })))
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Kata sandi').fill(`pw-${Date.now()}`)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigasi utama' })

test('HR: mendarat di Dashboard utama dengan empat KPI', async ({ page }) => {
  await loginAs(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard utama' })).toBeVisible()
  await expect(nav(page).getByRole('link').first()).toHaveText('Dashboard utama')
  const kpi = page.getByTestId('kpi')
  await expect(kpi).toHaveCount(4)
  await expect(kpi.nth(0)).toContainText('Pegawai dianalisis')
  await expect(kpi.nth(0)).toContainText('30')
  await expect(kpi.nth(0)).toContainText('dari 42 pegawai')
  await expect(kpi.nth(1)).toContainText('12')
  await expect(kpi.nth(1)).toContainText('dan 7 target KPI/OKR meleset')
  await expect(kpi.nth(2)).toContainText('88%')
  await expect(kpi.nth(2)).toContainText('target pilot ≥ 85%')
  await expect(kpi.nth(3)).toContainText('9 hari')
  await expect(kpi.nth(3)).toContainText('median 14 sesi · target ≤ 14 hari')
})

const TEAM_DATA = {
  scope: 'team',
  people: 5,
  kpis: { employeesAnalyzed: 3, competencyGaps: 2, okrGaps: 1, aiHrAgreement: null, analysisDays: null },
  modules: [
    { no: 1, key: 'lna', active: true, parts: [{ key: 'cca', active: false }, { key: 'dna', active: true }, { key: 'tna', active: true }, { key: 'ina', active: false }] },
    { no: 4, key: 'lim', active: false },
    { no: 5, key: 'cp', active: false },
  ],
  pareto: { rows: [{ key: 'c1', label: 'Root Cause Analysis', people: 2, score: 3, share: 1, cumulativeShare: 1, hot: true }], total: 1, hotCount: 1 },
  actions: [{ key: 'interviews_open', count: 1 }],
}

test('atasan: Dashboard tim tanpa angka khusus HR', async ({ page }) => {
  await loginAs(page, { role: 'supervisor', dashboard: TEAM_DATA })
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard tim' })).toBeVisible()
  await expect(page.getByText('Ringkasan tim Anda. Hanya bawahan langsung yang dihitung.')).toBeVisible()
  const kpi = page.getByTestId('kpi')
  await expect(kpi).toHaveCount(2)
  await expect(kpi.nth(0)).toContainText('dari 5 pegawai')
  await expect(page.getByText('Kesepakatan AI–HR')).toHaveCount(0)
})

test('multi-peran di tampilan Atasan: label ikut cakupan data dari API, bukan tampilan aktif', async ({ page }) => {
  // API menghitung dengan peran utama (hr_admin) sehingga mengirim scope 'all'; layar tidak boleh menyebutnya "tim"
  await page.addInitScript(() => { try { sessionStorage.setItem('elgos.view', 'atasan') } catch { /* abaikan */ } })
  await loginAs(page, { role: 'hr_admin', roles: ['hr_admin', 'supervisor'] })
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard utama' })).toBeVisible()
  await expect(page.getByTestId('kpi')).toHaveCount(4)
})

test('angka kosong: tanda – dengan alasannya', async ({ page }) => {
  await loginAs(page, {
    dashboard: {
      ...HR_DATA,
      kpis: { employeesAnalyzed: null, competencyGaps: null, okrGaps: 4, aiHrAgreement: { percent: null, approved: 0, reviewed: 0, targetPercent: 85 }, analysisDays: null },
    },
  })
  const kpi = page.getByTestId('kpi')
  await expect(kpi.nth(0)).toContainText('–')
  await expect(kpi.nth(0)).toContainText('Modul belum aktif')
  await expect(kpi.nth(1)).toContainText('–')
  await expect(kpi.nth(1)).toContainText('4 target KPI/OKR meleset')
  await expect(kpi.nth(2)).toContainText('–')
  await expect(kpi.nth(2)).toContainText('Belum ada temuan yang ditinjau HR')
  await expect(kpi.nth(3)).toContainText('–')
  await expect(kpi.nth(3)).toContainText('Belum ada sesi yang selesai ditinjau')
})

test('status modul: lima modul, status tertulis, Buka hanya ke layar yang bisa dibuka', async ({ page }) => {
  await loginAs(page)
  const mod = page.getByTestId('modul')
  await expect(mod).toHaveCount(5)
  await expect(mod.nth(0)).toContainText('Modul 1')
  await expect(mod.nth(0)).toContainText('Learning Needs Analysis')
  await expect(mod.nth(0)).toContainText('Aktif')
  await expect(mod.nth(0)).toContainText('DNA · TNA')
  // Keterangan modul sama dengan mockup final (Main.dc.html, daftar modules); nama vendor tidak di-hardcode (K4)
  await expect(mod.nth(0)).toContainText('Core Competencies, Developmental, Training, dan Improvement Needs')
  await expect(mod.nth(1)).toContainText('Library modul, program, dan permintaan modul baru')
  await expect(mod.nth(2)).toContainText('Pelaksanaan lewat EliteMentor/LMS')
  await expect(mod.nth(3)).toContainText('Penutupan gap dan OKR')
  await expect(mod.nth(4)).toContainText('Kesiapan berbasis bukti')
  await expect(mod.nth(1)).toContainText('Learning Intervention')
  await expect(mod.nth(1)).toContainText('Belum aktif')
  await expect(mod.nth(1).getByRole('link', { name: /Buka/ })).toHaveCount(0)
  // Career & Promotion aktif di data, tetapi layarnya (B16) belum ada: tidak ada tombol Buka
  await expect(mod.nth(4)).toContainText('Aktif')
  await expect(mod.nth(4).getByRole('link', { name: /Buka/ })).toHaveCount(0)
  await mod.nth(0).getByRole('link', { name: 'Buka Learning Needs Analysis' }).click()
  await expect(page).toHaveURL(/\/m\/dna$/)
})

test('atasan: status modul hanya modul di menunya', async ({ page }) => {
  await loginAs(page, { role: 'supervisor', dashboard: TEAM_DATA })
  await expect(page.getByTestId('modul')).toHaveCount(3)
  await expect(page.getByTestId('modul').nth(1)).toContainText('Learning Impact Measurement')
})

test('Pareto: baris prioritas ditandai teks, bukan warna saja; kosong punya pesan', async ({ page }) => {
  await loginAs(page)
  const card = page.getByTestId('pareto')
  await expect(card.getByRole('heading', { name: 'Pareto 20/80: gap yang perlu diprioritaskan' })).toBeVisible()
  await expect(card).toContainText('2 dari 3 kebutuhan menyumbang sekitar 80% total. Mulai dari yang ditandai Prioritas.')
  const rows = card.getByTestId('pareto-baris')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('Root Cause Analysis')
  await expect(rows.nth(0)).toContainText('9 orang · kum. 50%')
  await expect(rows.nth(0)).toContainText('Prioritas')
  await expect(rows.nth(2)).not.toContainText('Prioritas')
  await expect(rows.nth(0).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
})

test('P3 D1: baris Pareto kompetensi menaut ke Detail gap bila papan gap terbuka', async ({ page }) => {
  await loginAs(page, { flags: { 'tna.gap_board': true } })
  const rows = page.getByTestId('pareto').getByTestId('pareto-baris')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toHaveAttribute('href', '/tna/gap?kind=competency&competencyId=c1')
  // temuan tanpa kompetensi tidak punya detail gap
  await expect(rows.nth(2)).not.toHaveAttribute('href', /.*/)
  await rows.nth(1).focus()
  await expect(rows.nth(1)).toBeFocused()
})

test('P3 D1: tanpa flag papan gap baris Pareto bukan tautan', async ({ page }) => {
  await loginAs(page)
  await expect(page.getByTestId('pareto').getByRole('link')).toHaveCount(0)
})

test('Pareto kosong dan TNA tertutup', async ({ page }) => {
  await loginAs(page, { dashboard: { ...HR_DATA, pareto: { rows: [], total: 0, hotCount: 0 } } })
  await expect(page.getByTestId('pareto')).toContainText('Belum ada temuan pelatihan yang disetujui HR.')
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await loginAs(page, { dashboard: { ...HR_DATA, pareto: null } })
  await page.goto('/dashboard')
  await expect(page.getByTestId('pareto')).toContainText('Modul Training Needs belum aktif.')
})

test('kunci modul yang belum dikenal layar dilewati, halaman tetap tampil', async ({ page }) => {
  await loginAs(page, { dashboard: { ...HR_DATA, modules: [...HR_DATA.modules, { no: 6, key: 'baru', active: true }] } })
  await expect(page.getByTestId('modul')).toHaveCount(5)
  await expect(page.getByTestId('kpi')).toHaveCount(4)
})

test('Perlu tindakan: satu baris per butir, tombol hanya ke layar yang bisa dibuka', async ({ page }) => {
  await loginAs(page, { dashboard: { ...HR_DATA, actions: [...HR_DATA.actions.slice(0, 3), { key: 'non_training_findings', count: 2 }, HR_DATA.actions[3]] } })
  const card = page.getByTestId('tindakan')
  const rows = card.getByTestId('tindakan-baris')
  await expect(rows).toHaveCount(5)
  // Urutan mengikuti API (satu sumber, spek 3.5); antrean tinjauan memuat semua draf, bukan hanya hasil AI
  await expect(rows.nth(0)).toContainText('4 temuan menunggu tinjauan HR')
  await expect(rows.nth(1)).toContainText('2 wawancara akar masalah belum selesai')
  await expect(rows.nth(2)).toContainText('1 rencana belajar butuh modul baru')
  await expect(rows.nth(3)).toContainText('2 temuan Improvement Needs (di luar pelatihan)')
  await expect(rows.nth(4)).toContainText('3 kompetensi di kamus belum disetujui')
  await rows.nth(0).getByRole('link', { name: 'Tinjau' }).click()
  await expect(page).toHaveURL(/\/m\/tna\/review$/)
})

test('Perlu tindakan kosong', async ({ page }) => {
  await loginAs(page, { dashboard: { ...HR_DATA, actions: [] } })
  await expect(page.getByTestId('tindakan')).toContainText('Tidak ada yang menunggu tindakan.')
})

test('galat API tampil di halaman dengan pesannya', async ({ page }) => {
  await loginAs(page, { status: 503 })
  await expect(page.getByTestId('dash-galat')).toContainText('Dashboard tidak bisa dimuat. Layanan sedang gangguan')
  await expect(page.getByTestId('kpi')).toHaveCount(0)
})

test('flag dashboard.main mati: tetap Beranda lama dan /dashboard tidak bisa dibuka', async ({ page }) => {
  await loginAs(page, { flags: { 'dashboard.main': false } })
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByTestId('card-dna')).toBeVisible()
  await expect(nav(page).getByRole('link').first()).toHaveText('Beranda')
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/$/)
})

test('pimpinan (tampilan Atasan, ditolak API) tetap di Beranda', async ({ page }) => {
  await loginAs(page, { role: 'pimpinan' })
  await expect(page).toHaveURL(/\/$/)
  await expect(nav(page).getByRole('link').first()).toHaveText('Beranda')
})

test('snapshot visual: Dashboard utama terang dan gelap', async ({ page }) => {
  await loginAs(page)
  await expect(page.getByTestId('tindakan-baris')).toHaveCount(4)
  await page.evaluate('document.fonts.ready.then(() => true)')
  await expect(page).toHaveScreenshot('dashboard-hr-terang.png', { fullPage: true })
  await page.getByRole('button', { name: 'Mode gelap' }).click()
  await expect(page).toHaveScreenshot('dashboard-hr-gelap.png', { fullPage: true })
})
