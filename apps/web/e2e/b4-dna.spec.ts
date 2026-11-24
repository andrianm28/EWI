import { test, expect, type Page } from '@playwright/test'
import { loginSebagai } from './support/sesi'
import { mockApi, cocok } from './support/api'

// B4 Developmental Needs (spek: docs/designs/b4-developmental-needs.md). API di-mock lewat support/ (B18 4.2);
// alur yang sama terhadap API sungguhan: apps/api/tests/integration/alur-dna-pengembangan.test.js.
const B4 = { flags: { 'dna.development': true } }

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

const JABATAN = { id: 'jr1', name: 'Engineer Service Delivery' }
const JOB_FUNCTIONS = [{ id: 'jf1', order: 1, name: 'Penanganan insiden', competencyCount: 1 }]
const CURRICULUM = { jobRole: JABATAN, untiered: 1, tiers: [
  { tier: 'basic', count: 1, modules: [{ id: 'c1', code: 'ST-B1', name: 'Fondasi layanan', stream: 'Specific Technical' }] },
  { tier: 'intermediate', count: 1, modules: [{ id: 'c2', code: 'TC-I1', name: 'Automation', stream: 'Technical' }] },
  { tier: 'advanced', count: 0, modules: [] },
] }
const EMPLOYEES = [
  { id: 'e1', name: 'Ani', stage: 'basic', met: 0, assessed: 1, total: 2, focus: ['ST-B1'] },
  { id: 'e2', name: 'Budi', stage: 'done', met: 2, assessed: 2, total: 2, focus: [] },
]
function plan(id: string, name: string, stage: 'basic' | 'done', score: number) {
  return {
    person: { id, name, jobRoleId: 'jr1', jobRoleName: JABATAN.name }, stage, met: stage === 'done' ? 2 : 0, assessed: stage === 'done' ? 2 : 1, total: 2, untiered: 1,
    focus: stage === 'done' ? [] : ['ST-B1'], advice: stage === 'done' ? 'Semua modul yang dinilai tercapai.' : 'Fokus pada modul Basic yang belum tercapai: ST-B1.',
    tiers: [
      { tier: 'basic', modules: [{ competencyId: 'c1', code: 'ST-B1', name: 'Fondasi layanan', stream: null, score, target: 3, status: score >= 3 ? 'met' : 'develop', mastery: score >= 3 ? 'mastered' : 'not_yet' }] },
      { tier: 'intermediate', modules: [{ competencyId: 'c2', code: 'TC-I1', name: 'Automation', stream: null, score: stage === 'done' ? 3 : null, target: 3, status: stage === 'done' ? 'met' : 'not_assessed', mastery: null }] },
      { tier: 'advanced', modules: [] },
    ],
  }
}
const PLANS: Record<string, unknown> = { e1: plan('e1', 'Ani', 'basic', 1), e2: plan('e2', 'Budi', 'done', 3) }

/** Mock API B4 lewat support/ (B18). `state.overview` boleh diganti test; `calls` mencatat query kamus. */
async function mockDna(page: Page) {
  const state = { calls: [] as string[], approved: false, overview: OVERVIEW as Record<string, unknown> }
  const dictStatus = () => status(state.approved ? { approvedCount: 3, approved: true } : {})
  await mockApi(page, (req) => {
    const data = (d: unknown) => ({ json: { data: d } })
    if (cocok(req, 'GET /dna/development/overview')) return data({ ...state.overview, dictionary: dictStatus() })
    if (cocok(req, 'GET /dna/job-roles/jr1/dictionary')) {
      if (req.query.toString()) state.calls.push(`?${req.query.toString()}`)
      const tier = req.query.get('tier'); const jf = req.query.get('jobFunctionId')
      const rows = COMPS.filter((c) => (!tier || c.programTier === tier) && (!jf || c.jobFunctionIds.includes(jf)))
      return data({ jobRole: JABATAN, jobFunctions: JOB_FUNCTIONS, competencies: rows, dictionary: dictStatus() })
    }
    if (cocok(req, 'POST /dna/job-roles/jr1/dictionary/approve')) { state.approved = true; return data({ approved: 2 }) }
    if (cocok(req, 'GET /dna/job-roles/jr1/curriculum')) return data(CURRICULUM)
    if (cocok(req, 'GET /dna/development/employees')) return data(EMPLOYEES)
    const p = cocok(req, 'GET /dna/employees/:id/development-plan')
    if (p && PLANS[p.id]) return data(PLANS[p.id])
    return undefined
  })
  return state
}

/** Halaman POC /m/dna memanggil endpoint DNA lama; isinya tidak diuji di sini. */
const mockPocDna = (page: Page) => mockApi(page, (req) => (req.method === 'GET' && req.path.startsWith('/dna/') && !req.path.startsWith('/dna/development/') ? { json: { data: [] } } : undefined))

test('HR: ringkasan, kamus dengan filter dan pengesahan, kurikulum, dan rencana pegawai', async ({ page }) => {
  const { calls } = await mockDna(page)
  await loginSebagai(page, 'hr', B4)
  await page.goto('/dna')
  await expect(page.getByRole('heading', { level: 1, name: 'Developmental Needs' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Solution Architect/ })).toBeDisabled()
  const dash = page.getByTestId('dn-dash')
  await expect(dash).toContainText('1 / 2')
  await expect(dash).toContainText('Tuntas')
  await expect(page.getByTestId('dn-status')).toContainText('menunggu pengesahan HR')

  await page.getByRole('tab', { name: 'Kamus kompetensi' }).click()
  const kamus = page.getByTestId('dn-kamus')
  await expect(kamus.getByRole('row')).toHaveCount(3)
  await kamus.getByRole('button', { name: /JF1/ }).click()
  await expect(page.getByTestId('dn-kamus-note')).toContainText('JF1: Penanganan insiden')
  await expect(kamus.getByRole('row')).toHaveCount(2)
  await kamus.getByRole('button', { name: /JF1/ }).click()
  await page.getByRole('group', { name: 'Level program' }).getByRole('button', { name: 'Intermediate' }).click()
  await expect(kamus).toContainText('TC-I1')
  await expect(kamus).not.toContainText('ST-B1')
  expect(calls).toContain('?tier=intermediate')
  await kamus.getByRole('button', { name: 'Sahkan kamus' }).click()
  await expect(kamus.getByRole('status')).toHaveText('2 kompetensi disahkan.')
  await expect(kamus.getByRole('button', { name: 'Sahkan kamus' })).toHaveCount(0)

  await page.getByRole('tab', { name: 'Kurikulum Basic · Intermediate · Advanced' }).click()
  await expect(page.getByTestId('dn-kur')).toContainText('1 kompetensi belum punya level program')
  await expect(page.getByTestId('dn-kur')).toContainText('Automation')

  await page.getByRole('tab', { name: 'Kebutuhan pengembangan pegawai' }).click()
  // A4: cakupan tampil di tabel bila belum semua modul dinilai
  await expect(page.getByRole('row', { name: /Ani/ })).toContainText('dinilai 1 dari 2')
  await expect(page.getByRole('row', { name: /Budi/ })).not.toContainText('dinilai 2 dari')
  await expect(page.getByTestId('dn-plan')).toContainText('Rencana pengembangan: Ani')
  await expect(page.getByTestId('dn-plan')).toContainText('Perlu dikembangkan')
  await expect(page.getByTestId('dn-plan')).toContainText('Baru 1 dari 2 modul yang dinilai')
  await page.getByRole('button', { name: 'Budi', exact: true }).click()
  await expect(page.getByTestId('dn-plan')).toContainText('Tahap Tuntas')
})

test('Atasan tidak melihat tombol pengesahan; tanpa jabatan berkamus tampil petunjuk', async ({ page }) => {
  const state = await mockDna(page)
  await loginSebagai(page, 'atasan', B4)
  await page.goto('/dna')
  await page.getByRole('tab', { name: 'Kamus kompetensi' }).click()
  await expect(page.getByTestId('dn-kamus')).toContainText('Fondasi layanan')
  await expect(page.getByRole('button', { name: 'Sahkan kamus' })).toHaveCount(0)

  state.overview = { ...OVERVIEW, jobs: [OVERVIEW.jobs[1]], selectedJobRoleId: null }
  await page.reload()
  await expect(page.getByTestId('dn-empty')).toContainText('Belum ada jabatan yang punya kamus kompetensi')
})

test('flag dna.development mati, atau akun karyawan: /dna diarahkan ke halaman POC /m/dna', async ({ page }) => {
  await mockDna(page)
  await mockPocDna(page)
  await loginSebagai(page, 'hr', { flags: { 'dna.development': false } })
  await page.goto('/dna')
  await expect(page).toHaveURL(/\/m\/dna$/)
  await expect(page.getByTestId('dn-jobs')).toHaveCount(0)
})

test('karyawan membuka menu Developmental Needs: diarahkan ke halaman POC, bukan layar B4', async ({ page }) => {
  await mockDna(page)
  await mockPocDna(page)
  await loginSebagai(page, 'karyawan', B4)
  await page.goto('/dna')
  await expect(page).toHaveURL(/\/m\/dna$/)
})

// Paritas P3 (docs/designs/paritas-mockup/p3-komponen-bersama.md)
test('P3 DN-1/DN-2: breadcrumb 12px dan kartu Agen AI tanpa tombol (belum ada layar tujuan)', async ({ page }) => {
  await mockDna(page)
  await loginSebagai(page, 'hr', B4)
  await page.goto('/dna')
  const crumb = page.getByRole('navigation', { name: 'Lokasi' })
  await expect(crumb).toHaveText(/Learning Needs Analysis\s*›\s*Developmental Needs/)
  await expect(crumb).toHaveCSS('font-size', '12px')
  const kartu = page.getByTestId('dn-agen')
  await expect(kartu.getByRole('heading', { name: 'Agen AI · Validasi kamus kompetensi' })).toBeVisible()
  await expect(kartu).toContainText('Pilot')
  await expect(kartu).toContainText('AI mewawancarai atasan pemilik jabatan untuk memvalidasi hasil DACUM, lalu karyawan jabatan itu untuk menilai posisi mereka pada tingkat Basic, Intermediate, Advanced.')
  await expect(kartu.getByRole('link')).toHaveCount(0)
})

// Paritas P5 (docs/designs/paritas-mockup/p5-lna.md)
test('P5 DN-3/DN-4/DN-11/DN-13/DN-14: label tab dan copy mockup, judul kurikulum satu baris, chip tahap per tingkat', async ({ page }) => {
  await mockDna(page)
  await loginSebagai(page, 'hr', B4)
  await page.goto('/dna')
  await expect(page.getByRole('tab')).toHaveText(['Ringkasan', 'Kamus kompetensi', 'Kurikulum Basic · Intermediate · Advanced', 'Kebutuhan pengembangan pegawai'])
  await expect(page.getByText('Jabatan lain akan muncul di pilihan di atas setelah kamusnya dibuat lewat DACUM.')).toBeVisible()
  await page.getByRole('tab', { name: 'Kurikulum Basic · Intermediate · Advanced' }).click()
  await expect(page.getByTestId('dn-kur').getByRole('heading', { level: 2 }).first()).toHaveText(/^Basic · \d+ modul$/)
  await page.getByRole('tab', { name: 'Kebutuhan pengembangan pegawai' }).click()
  const ani = page.getByRole('row', { name: /Ani/ })
  await expect(ani.locator('.el-chip').first()).toHaveClass(/el-chip--review/)
  await expect(page.getByRole('row', { name: /Budi/ }).locator('.el-chip').first()).toHaveClass(/el-chip--success/)
  await expect(ani.getByRole('cell').nth(2)).not.toHaveCSS('text-align', 'right')
})

test('paritas DN-5/DN-6/DN-9/DN-12: note KPI kamus, copy status kamus, catatan kamus mockup, baris pegawai bisa diklik dan tersorot', async ({ page }) => {
  await mockDna(page)
  await loginSebagai(page, 'hr', B4)
  await page.goto('/dna')
  const kpi = page.locator('.el-kpi').filter({ hasText: 'Jabatan dengan kamus' })
  await expect(kpi.locator('.el-kpi__note')).toHaveText('1 lainnya belum dibuat')
  await expect(page.getByTestId('dn-status')).toContainText('Kamus disusun dari lokakarya DACUM dan menunggu pengesahan HR sebelum dipakai sebagai target di Training Needs.')
  await expect(page.getByTestId('dn-status')).not.toContainText('1 dari 3')

  await page.getByRole('tab', { name: 'Kamus kompetensi' }).click()
  await expect(page.getByTestId('dn-kamus-note')).toHaveText('Engineer Service Delivery (2 dari 3 modul sudah memiliki data asesmen)')
  await page.getByTestId('dn-kamus').getByRole('button', { name: /JF1/ }).click()
  await expect(page.getByTestId('dn-kamus-note')).toHaveText('Engineer Service Delivery · JF1: Penanganan insiden (2 dari 3 modul sudah memiliki data asesmen)')

  await page.getByRole('tab', { name: 'Kebutuhan pengembangan pegawai' }).click()
  const peg = page.getByTestId('dn-peg')
  await expect(peg).toContainText('Klik baris untuk melihat rencana lengkap.')
  await expect(peg.getByRole('columnheader')).toHaveText(['Pegawai', 'Tahap saat ini', 'Modul tercapai', 'Fokus pengembangan'])
  await expect(page.getByRole('row', { name: /Ani/ })).toHaveClass(/is-selected/)
  await page.getByRole('row', { name: /Budi/ }).getByRole('cell').nth(1).click()
  await expect(page.getByTestId('dn-plan')).toContainText('Rencana pengembangan: Budi')
  await expect(page.getByRole('row', { name: /Budi/ })).toHaveClass(/is-selected/)
  await expect(page.getByRole('row', { name: /Ani/ })).not.toHaveClass(/is-selected/)
})
