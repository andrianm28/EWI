import { test, expect, type Page } from '@playwright/test'

// B3 Dashboard utama (HR) dan Dashboard tim (atasan). Spek: docs/designs/b3-dashboard.md.
// Seam yang diuji: layar /dashboard lewat browser, dengan GET /api/dashboard di-mock.
const SUBMODULES = ['cca', 'dna', 'tna', 'ina']
const BASE_FLAGS: Record<string, boolean> = { 'module.dna': true, 'module.tna': true, 'dashboard.main': true }

const HR_DATA = {
  scope: 'all',
  people: 42,
  kpis: {
    employeesAnalyzed: 30,
    competencyGaps: 12,
    okrGaps: 7,
    aiHrAgreement: { percent: 88, approved: 22, reviewed: 25, targetPercent: 85 },
    analysisDays: { median: 9, sessions: 14, targetDays: 14 },
  },
  modules: [
    { no: 1, key: 'lna', active: true, parts: [{ key: 'cca', active: false }, { key: 'dna', active: true }, { key: 'tna', active: true }, { key: 'ina', active: false }] },
    { no: 2, key: 'li', active: false },
    { no: 3, key: 'ld', active: false },
    { no: 4, key: 'lim', active: false },
    { no: 5, key: 'cp', active: true },
  ],
  pareto: {
    rows: [
      { key: 'c1', label: 'Root Cause Analysis', people: 9, score: 12, share: 0.5, cumulativeShare: 0.5, hot: true },
      { key: 'c2', label: 'Ticket Life Cycle', people: 6, score: 7, share: 0.29, cumulativeShare: 0.79, hot: true },
      { key: 'c3', label: 'Komunikasi pelanggan', people: 3, score: 5, share: 0.21, cumulativeShare: 1, hot: false },
    ],
    total: 3,
    hotCount: 2,
  },
  actions: [
    { key: 'review_pending', count: 4 },
    { key: 'interviews_open', count: 2 },
    { key: 'plan_needs_module', count: 1 },
    { key: 'competencies_unapproved', count: 3 },
  ],
}

interface Opts { role?: string; flags?: Record<string, boolean>; dashboard?: unknown; status?: number }

async function loginAs(page: Page, o: Opts = {}) {
  const role = o.role ?? 'hr_admin'
  const user = { id: 'u-1', tenantId: 't-1', email: `${role}@demo.test`, role }
  await page.route('**/api/auth/tenants', (r) => r.fulfill({ json: { data: [] } }))
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token: 't', user } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: SUBMODULES, flags: { ...BASE_FLAGS, ...o.flags } } }))
  await page.route(/\/api\/(dna|tna)\//, (r) => r.fulfill({ json: { data: [] } }))
  await page.route('**/api/dashboard', (r) => (o.status
    ? r.fulfill({ status: o.status, json: { error: { code: 'X', message: 'Layanan sedang gangguan' } } })
    : r.fulfill({ json: { data: o.dashboard ?? HR_DATA } })))
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(`pw-${Date.now()}`)
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

test('Pareto kosong dan TNA tertutup', async ({ page }) => {
  await loginAs(page, { dashboard: { ...HR_DATA, pareto: { rows: [], total: 0, hotCount: 0 } } })
  await expect(page.getByTestId('pareto')).toContainText('Belum ada temuan pelatihan yang disetujui HR.')
})
