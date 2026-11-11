import { test, expect, type Page } from '@playwright/test'

// Alur POC DNA + TNA dengan API di-mock (tanpa backend/LLM).
const ACCESS = { submodules: ['cca', 'dna', 'tna', 'ina'], flags: { 'module.dna': true, 'module.tna': true, 'module.cca': false, 'module.ina': false } }

async function loginAs(page: Page, role: string, id = 'u-1') {
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token: 't', user: { id, tenantId: 't-1', email: `${role}@demo.test`, role } } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: ACCESS }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user: { id, tenantId: 't-1', email: `${role}@demo.test`, role } } }))
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill(`${role}@demo.test`)
  await page.getByLabel('Password').fill(`pw-${Date.now()}`)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByTestId('card-dna')).toBeVisible()
}

const career = (o: Record<string, unknown> = {}) => ({
  currentLevel: { id: 'l1', name: 'Junior', requiredProgramTier: 'basic' }, nextLevel: { id: 'l2', name: 'Senior', requiredProgramTier: 'intermediate' },
  currentTierPassed: true, nextTierPassed: false, behindCurrentLevel: false, ...o,
})

test('HR: dashboard DNA menampilkan kandidat promosi dan gap', async ({ page }) => {
  await page.route('**/api/dna/sessions', (r) => r.fulfill({ json: { data: [] } }))
  await page.route('**/api/dna/employees', (r) => r.fulfill({ json: { data: [
    { id: 'a', name: 'Rina', email: 'rina@demo.test', role: 'learner', jobRoleName: 'Service Delivery L1', gap: { total: 4, assessed: 4, met: 4, gaps: 0, readiness: 100 }, career: career({ nextTierPassed: true, promotionCandidate: true }) },
    { id: 'b', name: 'Budi', email: 'budi@demo.test', role: 'learner', jobRoleName: 'Service Delivery L1', gap: { total: 4, assessed: 0, met: 0, gaps: 0, readiness: null }, career: career({ currentTierPassed: false, behindCurrentLevel: true, promotionCandidate: false }) },
  ] } }))
  await page.route('**/api/dna/employees/b', (r) => r.fulfill({ json: { data: {
    person: { id: 'b', name: 'Budi', email: 'budi@demo.test' }, career: career(), completions: [],
    gap: { summary: { total: 1, assessed: 1, met: 0, gaps: 1, readiness: 0 }, items: [{ competencyId: 'c1', name: 'Memahami kontrak proyek', kind: 'job', required: 3, score: 1, gap: 2, status: 'gap' }] },
  } } }))
  await loginAs(page, 'hr_admin')
  await page.getByTestId('card-dna').getByRole('link', { name: 'Buka' }).click()
  await expect(page.getByTestId('dna-candidates')).toContainText('1')
  await expect(page.getByTestId('dna-table')).toContainText('Kandidat Senior')
  await expect(page.getByTestId('dna-table')).toContainText('Belum lulus Basic')
  await page.getByRole('row', { name: /Budi/ }).getByRole('button', { name: 'Detail' }).click()
  await expect(page.getByTestId('dna-detail')).toContainText('1/3 · perlu dikembangkan')
})

test('atasan: tidak melihat kartu kandidat promosi', async ({ page }) => {
  await page.route('**/api/dna/sessions', (r) => r.fulfill({ json: { data: [] } }))
  await page.route('**/api/dna/employees', (r) => r.fulfill({ json: { data: [
    { id: 'a', name: 'Rina', email: 'rina@demo.test', role: 'learner', jobRoleName: 'L1', gap: { total: 1, assessed: 0, met: 0, gaps: 0, readiness: null }, career: career() },
    { id: 'c', name: 'Dimas', email: 'dimas@demo.test', role: 'learner', jobRoleName: 'L1', gap: { total: 1, assessed: 0, met: 0, gaps: 0, readiness: null }, career: career() },
  ] } }))
  await loginAs(page, 'supervisor')
  await page.goto('/m/dna')
  await expect(page.getByTestId('dna-table')).toContainText('Dimas')
  await expect(page.getByTestId('dna-candidates')).toHaveCount(0)
})

test('HR: penjadwalan TNA wajib memilih siapa yang diwawancarai', async ({ page }) => {
  let scheduledWith: unknown = null
  await page.route('**/api/tna/dashboard', (r) => r.fulfill({ json: { data: { role: 'hr_admin', people: null, redTargets: 2, sessions: { completed: 1 }, trainingFindings: 1, planItems: {} } } }))
  await page.route('**/api/tna/findings', (r) => r.fulfill({ json: { data: [{ id: 'f1', userId: 'd', userName: 'Dimas', title: 'Kesulitan mencapai target SLA', status: 'open', competencyName: 'Memahami kontrak proyek', metricName: 'SLA respons', target: 15, actual: 30 }] } }))
  await page.route('**/api/tna/plan-items', (r) => r.fulfill({ json: { data: [] } }))
  await page.route('**/api/tna/sessions', (r) => r.fulfill({ json: { data: [] } }))
  await page.route('**/api/tna/pareto', (r) => r.fulfill({ json: { data: [{ key: 'c1', label: 'Memahami kontrak proyek', people: 3, avgMiss: 0.5, score: 4.5, share: 0.8, cumulativeShare: 0.8 }] } }))
  await page.route('**/api/projects', (r) => r.fulfill({ json: { data: [{ id: 'p1', name: 'POC Des', status: 'active' }] } }))
  await page.route('**/api/tna/projects/p1/interviews', async (r) => {
    scheduledWith = r.request().postDataJSON()
    await r.fulfill({ status: 201, json: { data: { scheduled: 3, skipped: 0 } } })
  })
  await loginAs(page, 'hr_admin')
  await page.goto('/m/tna')
  await expect(page.getByTestId('tna-pareto')).toContainText('Memahami kontrak proyek')
  await expect(page.getByTestId('tna-findings')).toContainText('SLA respons: target 15, realisasi 30')

  await page.getByLabel('Periode').fill('2026-11')
  await page.getByLabel('Proyek').selectOption('p1')
  await page.getByRole('button', { name: 'Jadwalkan' }).click()
  await expect(page.getByRole('alert')).toHaveText('Pilih dulu siapa yang diwawancarai.')
  expect(scheduledWith).toBeNull()

  await page.getByLabel('Hanya yang punya target merah').check()
  await page.getByRole('button', { name: 'Jadwalkan' }).click()
  await expect(page.getByRole('status')).toHaveText('3 wawancara dijadwalkan.')
  expect(scheduledWith).toEqual({ scope: 'red_only', period: '2026-11' })
})

test('learner: wawancara TNA lalu meminta training', async ({ page }) => {
  let state = 'scheduled'
  const empty = { data: [] }
  await page.route('**/api/tna/dashboard', (r) => r.fulfill({ json: { data: { role: 'learner', people: 1, redTargets: 1, sessions: {}, trainingFindings: 0, planItems: {} } } }))
  await page.route('**/api/tna/findings', (r) => r.fulfill({ json: state === 'completed' ? { data: [{ id: 'f1', userId: 'u-1', userName: 'Dimas', title: 'Kesulitan mencapai target SLA', status: 'open', competencyName: null, metricName: null, target: null, actual: null }] } : empty }))
  await page.route('**/api/tna/plan-items', (r) => r.fulfill({ json: empty }))
  await page.route('**/api/tna/sessions', (r) => r.fulfill({ json: { data: state === 'completed' ? [] : [{ id: 's1', projectId: 'p1', intervieweeId: 'u-1', intervieweeName: 'Dimas', status: state, triggerCount: 1 }] } }))
  await page.route('**/api/tna/sessions/s1', (r) => r.fulfill({ json: { data: { id: 's1', status: state, turns: [] } } }))
  await page.route('**/api/tna/sessions/s1/consent', (r) => { state = 'in_progress'; return r.fulfill({ json: { data: { question: { speaker: 'ai', text: 'Target "SLA respons" belum tercapai. Apa penyebabnya?', at: '' } } } }) })
  await page.route('**/api/tna/sessions/s1/turns', (r) => r.fulfill({ json: { data: { question: null, done: true } } }))
  await page.route('**/api/tna/sessions/s1/complete', (r) => { state = 'completed'; return r.fulfill({ json: { data: { status: 'completed' } } }) })
  let requested = false
  await page.route('**/api/tna/training-requests', (r) => { requested = true; return r.fulfill({ status: 201, json: { data: {} } }) })

  await loginAs(page, 'learner')
  await page.goto('/m/tna')
  await page.getByTestId('tna-my-sessions').getByRole('link', { name: 'Mulai wawancara' }).click()
  await page.getByRole('button', { name: 'Saya setuju, mulai' }).click()
  await expect(page.getByTestId('turn-ai')).toContainText('SLA respons')
  await page.getByLabel('Jawaban').fill('Saya sulit memahami kontrak proyek.')
  await page.getByRole('button', { name: 'Kirim' }).click()
  await page.getByRole('button', { name: 'Selesai dan kirim' }).click()
  await expect(page).toHaveURL(/\/m\/tna$/)
  await expect(page.getByTestId('tna-pareto')).toHaveCount(0)
  await page.getByRole('button', { name: 'Minta training' }).click()
  await expect(page.getByRole('status')).toHaveText('Permintaan training terkirim.')
  expect(requested).toBe(true)
})
