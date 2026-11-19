import { test, expect, type Page } from '@playwright/test'

// B4 Developmental Needs (spek: docs/designs/b4-developmental-needs.md). API di-mock.
const ACCESS = { submodules: ['cca', 'dna', 'tna', 'ina'], flags: { 'module.dna': true, 'module.tna': true, 'dna.development': true } as Record<string, boolean> }

async function loginAs(page: Page, role: string, access = ACCESS) {
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

const status = (o = {}) => ({ status: 'available', tool1: true, tool2: true, tool3: true, competencyCount: 3, approvedCount: 1, approved: false, assessedCompetencyCount: 2, ...o })
const OVERVIEW = {
  jobs: [
    { id: 'jr1', name: 'Engineer Service Delivery', division: 'IT', dictionary: 'available', competencyCount: 3 },
    { id: 'jr2', name: 'Solution Architect', division: 'IT', dictionary: 'none', competencyCount: 0 },
  ],
  selectedJobRoleId: 'jr1',
  kpi: { employees: 2, jobFunctions: 1, competencies: 3, jobsWithDictionary: 1, jobsTotal: 2 },
  stageDistribution: [
    { stage: 'basic', count: 1, percent: 50 }, { stage: 'intermediate', count: 0, percent: 0 }, { stage: 'advanced', count: 0, percent: 0 },
    { stage: 'done', count: 1, percent: 50 }, { stage: 'not_assessed', count: 0, percent: 0 },
  ],
  dictionary: status(),
}
const COMPS = [
  { id: 'c1', code: 'ST-B1', name: 'Fondasi layanan', stream: 'Specific Technical', programTier: 'basic', requiredScore: 3, approvedAt: null, jobFunctionIds: ['jf1'] },
  { id: 'c2', code: 'TC-I1', name: 'Automation', stream: 'Technical', programTier: 'intermediate', requiredScore: 3, approvedAt: null, jobFunctionIds: [] },
]

async function mockDna(page: Page) {
  const calls: string[] = []
  let approved = false
  await page.route('**/api/dna/development/overview*', (r) => r.fulfill({ json: { data: { ...OVERVIEW, dictionary: status(approved ? { approvedCount: 3, approved: true } : {}) } } }))
  await page.route('**/api/dna/job-roles/jr1/dictionary?*', (r) => {
    const url = new URL(r.request().url()); calls.push(url.search)
    const tier = url.searchParams.get('tier'); const jf = url.searchParams.get('jobFunctionId')
    const rows = COMPS.filter((c) => (!tier || c.programTier === tier) && (!jf || c.jobFunctionIds.includes(jf)))
    return r.fulfill({ json: { data: { jobRole: { id: 'jr1', name: 'Engineer Service Delivery' }, jobFunctions: [{ id: 'jf1', order: 1, name: 'Penanganan insiden', competencyCount: 1 }], competencies: rows, dictionary: status(approved ? { approvedCount: 3, approved: true } : {}) } } })
  })
  await page.route('**/api/dna/job-roles/jr1/dictionary', (r) => r.fulfill({ json: { data: { jobRole: { id: 'jr1', name: 'Engineer Service Delivery' }, jobFunctions: [{ id: 'jf1', order: 1, name: 'Penanganan insiden', competencyCount: 1 }], competencies: COMPS, dictionary: status(approved ? { approvedCount: 3, approved: true } : {}) } } }))
  await page.route('**/api/dna/job-roles/jr1/dictionary/approve', (r) => { approved = true; return r.fulfill({ json: { data: { approved: 2 } } }) })
  await page.route('**/api/dna/job-roles/jr1/curriculum', (r) => r.fulfill({ json: { data: { jobRole: { id: 'jr1', name: 'Engineer Service Delivery' }, untiered: 1, tiers: [
    { tier: 'basic', count: 1, modules: [{ id: 'c1', code: 'ST-B1', name: 'Fondasi layanan', stream: 'Specific Technical' }] },
    { tier: 'intermediate', count: 1, modules: [{ id: 'c2', code: 'TC-I1', name: 'Automation', stream: 'Technical' }] },
    { tier: 'advanced', count: 0, modules: [] },
  ] } } }))
  await page.route('**/api/dna/development/employees*', (r) => r.fulfill({ json: { data: [
    { id: 'e1', name: 'Ani', stage: 'basic', met: 0, assessed: 1, total: 2, focus: ['ST-B1'] },
    { id: 'e2', name: 'Budi', stage: 'done', met: 2, assessed: 2, total: 2, focus: [] },
  ] } }))
  for (const [id, name, stage, score] of [['e1', 'Ani', 'basic', 1], ['e2', 'Budi', 'done', 3]] as const) {
    await page.route(`**/api/dna/employees/${id}/development-plan`, (r) => r.fulfill({ json: { data: {
      person: { id, name, jobRoleId: 'jr1', jobRoleName: 'Engineer Service Delivery' }, stage, met: stage === 'done' ? 2 : 0, assessed: stage === 'done' ? 2 : 1, total: 2, untiered: 1,
      focus: stage === 'done' ? [] : ['ST-B1'], advice: stage === 'done' ? 'Semua modul yang dinilai tercapai.' : 'Fokus pada modul Basic yang belum tercapai: ST-B1.',
      tiers: [
        { tier: 'basic', modules: [{ competencyId: 'c1', code: 'ST-B1', name: 'Fondasi layanan', stream: null, score, target: 3, status: score >= 3 ? 'met' : 'develop', mastery: score >= 3 ? 'mastered' : 'not_yet' }] },
        { tier: 'intermediate', modules: [{ competencyId: 'c2', code: 'TC-I1', name: 'Automation', stream: null, score: stage === 'done' ? 3 : null, target: 3, status: stage === 'done' ? 'met' : 'not_assessed', mastery: null }] },
        { tier: 'advanced', modules: [] },
      ],
    } } }))
  }
  return { calls }
}

test('HR: ringkasan, kamus dengan filter dan pengesahan, kurikulum, dan rencana pegawai', async ({ page }) => {
  const { calls } = await mockDna(page)
  await loginAs(page, 'hr_admin')
  await page.goto('/dna')
  await expect(page.getByRole('heading', { level: 1, name: 'Developmental Needs' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Solution Architect/ })).toBeDisabled()
  const dash = page.getByTestId('dn-dash')
  await expect(dash).toContainText('1 / 2')
  await expect(dash).toContainText('Tuntas')
  await expect(page.getByTestId('dn-status')).toContainText('Menunggu pengesahan HR: 1 dari 3')
  await expect(page.getByTestId('dn-status')).toContainText('2 dari 3 modul sudah memiliki data asesmen')

  await page.getByRole('tab', { name: 'Kamus kompetensi' }).click()
  const kamus = page.getByTestId('dn-kamus')
  await expect(kamus.getByRole('row')).toHaveCount(3)
  await kamus.getByRole('button', { name: /JF1/ }).click()
  await expect(page.getByTestId('dn-kamus-note')).toContainText('1 kompetensi untuk JF1 · Penanganan insiden')
  await expect(kamus.getByRole('row')).toHaveCount(2)
  await kamus.getByRole('button', { name: /JF1/ }).click()
  await page.getByRole('group', { name: 'Level program' }).getByRole('button', { name: 'Intermediate' }).click()
  await expect(kamus).toContainText('TC-I1')
  await expect(kamus).not.toContainText('ST-B1')
  expect(calls).toContain('?tier=intermediate')
  await kamus.getByRole('button', { name: 'Sahkan kamus' }).click()
  await expect(kamus.getByRole('status')).toHaveText('2 kompetensi disahkan.')
  await expect(kamus.getByRole('button', { name: 'Sahkan kamus' })).toHaveCount(0)

  await page.getByRole('tab', { name: 'Kurikulum BIA' }).click()
  await expect(page.getByTestId('dn-kur')).toContainText('1 kompetensi belum punya level program')
  await expect(page.getByTestId('dn-kur')).toContainText('Automation')

  await page.getByRole('tab', { name: 'Kebutuhan pegawai' }).click()
  // A4: cakupan tampil di tabel bila belum semua modul dinilai
  await expect(page.getByRole('row', { name: /Ani/ })).toContainText('dinilai 1 dari 2')
  await expect(page.getByRole('row', { name: /Budi/ })).not.toContainText('dinilai 2 dari')
  await expect(page.getByTestId('dn-plan')).toContainText('Rencana pengembangan: Ani')
  await expect(page.getByTestId('dn-plan')).toContainText('Perlu dikembangkan')
  await expect(page.getByTestId('dn-plan')).toContainText('Baru 1 dari 2 modul yang dinilai')
  await page.getByRole('button', { name: 'Rencana Budi' }).click()
  await expect(page.getByTestId('dn-plan')).toContainText('Tahap Tuntas')
})

test('Atasan tidak melihat tombol pengesahan; tanpa jabatan berkamus tampil petunjuk', async ({ page }) => {
  await mockDna(page)
  await loginAs(page, 'supervisor')
  await page.goto('/dna')
  await page.getByRole('tab', { name: 'Kamus kompetensi' }).click()
  await expect(page.getByTestId('dn-kamus')).toContainText('Fondasi layanan')
  await expect(page.getByRole('button', { name: 'Sahkan kamus' })).toHaveCount(0)

  await page.unroute('**/api/dna/development/overview*')
  await page.route('**/api/dna/development/overview*', (r) => r.fulfill({ json: { data: { ...OVERVIEW, jobs: [OVERVIEW.jobs[1]], selectedJobRoleId: null } } }))
  await page.reload()
  await expect(page.getByTestId('dn-empty')).toContainText('Belum ada jabatan yang punya kamus kompetensi')
})

test('flag dna.development mati, atau akun karyawan: /dna diarahkan ke halaman POC /m/dna', async ({ page }) => {
  await mockDna(page)
  await page.route('**/api/dna/**', (r) => (r.request().url().includes('/development/') ? r.fallback() : r.fulfill({ json: { data: [] } })))
  await loginAs(page, 'hr_admin', { ...ACCESS, flags: { ...ACCESS.flags, 'dna.development': false } })
  await page.goto('/dna')
  await expect(page).toHaveURL(/\/m\/dna$/)
  await expect(page.getByTestId('dn-jobs')).toHaveCount(0)
})

test('karyawan membuka menu Developmental Needs: diarahkan ke halaman POC, bukan layar B4', async ({ page }) => {
  await mockDna(page)
  await page.route('**/api/dna/**', (r) => (r.request().url().includes('/development/') ? r.fallback() : r.fulfill({ json: { data: [] } })))
  await loginAs(page, 'learner')
  await page.goto('/dna')
  await expect(page).toHaveURL(/\/m\/dna$/)
})
