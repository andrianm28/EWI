import { test, expect, type Page } from '@playwright/test'

// B16 Career & Promotion (spek: docs/designs/b16-career-promotion.md). API di-mock.
async function loginAs(page: Page, role: string, flags: Record<string, boolean> = { 'promotion.recommendation': true }) {
  const access = { submodules: ['cca', 'dna', 'tna', 'ina'], flags: { 'module.dna': true, 'module.tna': true, ...flags } }
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token: 't', user: { id: 'u-1', tenantId: 't-1', email: `${role}@demo.test`, role } } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: access }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user: { id: 'u-1', tenantId: 't-1', email: `${role}@demo.test`, role } } }))
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill(`${role}@demo.test`)
  await page.getByLabel('Password').fill(`pw-${Date.now()}`)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByTestId('card-dna')).toBeVisible()
}

const progs = (n: number) => ['basic', 'intermediate', 'advanced'].map((tier, i) => ({ tier, passed: i < n }))
const MAP = {
  okrMin: 80, kpi: { employees: 3, divisions: 2, eligible: 1, awaitingDecision: 1, belowCurrent: 1 }, divisions: ['IT', 'Sales'],
  employees: [
    { id: 'e1', name: 'Ani', division: 'IT', jobRoleId: 'jr1', jobRoleName: 'Engineer', level: { id: 'l1', name: 'Junior' }, programs: progs(2), okr: { achievement: 92.5, period: '2026-11', count: 2 }, status: 'eligible', nextLevel: { id: 'l2', name: 'Senior', requiredProgramTier: 'intermediate' }, decisionState: 'none' },
    { id: 'e2', name: 'Budi', division: 'IT', jobRoleId: 'jr1', jobRoleName: 'Engineer', level: { id: 'l1', name: 'Junior' }, programs: progs(0), okr: null, status: 'below_current', nextLevel: { id: 'l2', name: 'Senior', requiredProgramTier: 'intermediate' }, decisionState: 'none' },
    { id: 'e3', name: 'Cici', division: 'Sales', jobRoleId: 'jr2', jobRoleName: 'Account', level: { id: 'l9', name: 'Staf' }, programs: progs(2), okr: { achievement: 70, period: '2026-11', count: 1 }, status: 'program_passed_okr_low', nextLevel: { id: 'l10', name: 'Senior' }, decisionState: 'none' },
  ],
}
const decision = (o: Record<string, unknown> = {}) => ({
  employee: { id: 'e1', name: 'Ani', division: 'IT', jobRoleName: 'Engineer' }, fromLevel: { id: 'l1', name: 'Junior' }, toLevel: { id: 'l2', name: 'Senior' },
  requirement: { programPassed: true, okr: { achievement: 92.5, min: 80, met: true } }, eligible: true, supervisor: null, hr: null, actions: [], blockedReason: 'waiting_supervisor', ...o,
})

async function mockCp(page: Page, decisions: unknown[]) {
  const posts: { url: string; body: unknown }[] = []
  let rows = decisions
  await page.route('**/api/dna/career/map', (r) => r.fulfill({ json: { data: MAP } }))
  await page.route('**/api/dna/career/employees/*/evidence', (r) => {
    const id = r.request().url().split('/').at(-2)
    const p = MAP.employees.find((e) => e.id === id)!
    return r.fulfill({ json: { data: { person: { id, name: p.name, division: p.division, jobRoleName: p.jobRoleName, level: p.level }, status: p.status, nextLevel: p.nextLevel,
      programsPassed: p.programs.filter((x) => x.passed).map((x) => x.tier), okr: p.okr ? { ...p.okr, min: 80, met: p.okr.achievement >= 80 } : null, reinterview: null, supervisorRecommendation: null } } })
  })
  await page.route('**/api/dna/career/paths', (r) => r.fulfill({ json: { data: { jobRole: { id: 'jr1', name: 'Engineer' }, okrMin: 80, levels: [
    { id: 'l1', order: 0, name: 'Junior', requiredProgramTier: 'basic', moduleCount: 4, employees: 2, readyForNext: 1 },
    { id: 'l2', order: 1, name: 'Senior', requiredProgramTier: 'intermediate', moduleCount: 6, employees: 0, readyForNext: 0 },
  ] } } }))
  await page.route('**/api/dna/career/decisions', (r) => r.fulfill({ json: { data: rows } }))
  await page.route('**/api/dna/career/decisions/*/*', (r) => {
    posts.push({ url: r.request().url(), body: r.request().postDataJSON() })
    rows = [decision({ supervisor: { decision: 'recommend', byName: 'Sari', at: '2026-11-19T09:00:00Z', note: 'Siap' }, actions: [], blockedReason: 'waiting_hr' })]
    return r.fulfill({ json: { data: rows[0] } })
  })
  return posts
}

test('HR: peta per divisi, bukti, jalur jenjang, dan keputusan menunggu atasan', async ({ page }) => {
  await mockCp(page, [decision()])
  await loginAs(page, 'hr_admin')
  await page.goto('/cp')
  await expect(page.getByRole('heading', { level: 1, name: 'Career & Promotion' })).toBeVisible()
  const map = page.getByTestId('cp-map')
  await expect(map).toContainText('Memenuhi syarat Senior')
  await expect(map).toContainText('Belum memenuhi kompetensi jabatan')
  await expect(map).toContainText('Program lulus, OKR belum 80%')
  await expect(page.getByTestId('cp-evidence')).toContainText('Bukti untuk Ani')
  await expect(page.getByTestId('cp-evidence')).toContainText('93% (ambang 80%)')
  await page.getByRole('group', { name: 'Divisi' }).getByRole('button', { name: 'Sales' }).click()
  await expect(map.getByRole('table')).not.toContainText('Ani')
  await page.getByRole('button', { name: 'Bukti Cici' }).click()
  await expect(page.getByTestId('cp-evidence')).toContainText('Bukti untuk Cici')

  await page.getByRole('tab', { name: 'Jalur jenjang' }).click()
  await expect(page.getByTestId('cp-path')).toContainText('lulus program Basic (4 modul)')
  await page.getByRole('tab', { name: 'Keputusan promosi' }).click()
  await expect(page.getByTestId('cp-dec')).toContainText('Junior → Senior')
  await expect(page.getByTestId('cp-dec')).toContainText('Menunggu atasan')
  await expect(page.getByTestId('cp-dec').getByRole('button', { name: /Setujui/ })).toHaveCount(0)
})

test('Atasan merekomendasikan dengan catatan; keputusan tercatat dengan nama', async ({ page }) => {
  const posts = await mockCp(page, [decision({ actions: ['recommend', 'hold'], blockedReason: null })])
  await loginAs(page, 'supervisor')
  await page.goto('/cp')
  await page.getByRole('tab', { name: 'Keputusan promosi' }).click()
  await page.getByLabel('Catatan untuk Ani').fill('Siap')
  await page.getByRole('button', { name: 'Rekomendasikan Ani' }).click()
  await expect(page.getByTestId('cp-dec').getByRole('status')).toHaveText('Rekomendasikan: Ani tercatat.')
  expect(posts).toHaveLength(1)
  expect(posts[0]!.url).toMatch(/\/decisions\/e1\/supervisor$/)
  expect(posts[0]!.body).toEqual({ decision: 'recommend', note: 'Siap' })
  await expect(page.getByTestId('cp-dec')).toContainText('Sari')
  await expect(page.getByTestId('cp-dec')).toContainText('Menunggu HR')
})

test('Menu dan rute tertutup bila flag promotion.recommendation mati', async ({ page }) => {
  await loginAs(page, 'hr_admin', { 'promotion.recommendation': false })
  await page.goto('/cp')
  await expect(page.getByRole('heading', { level: 1, name: 'Career & Promotion' })).toHaveCount(0)
})
