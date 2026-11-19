import { test, expect, type Page, type Route } from '@playwright/test'

// B13 Learning Intervention: Library, Program & Course, Permintaan & pengembangan, Draf modul. API di-mock.
// Spek: docs/designs/b13-learning-intervention.md.
const VENDOR = 'Mahaka Institute'
const job = { id: 'jr-1', name: 'Engineer Service Delivery' }
const mod = (o: Record<string, unknown>) => ({
  level: 'advanced', stream: 'Specific Technical', catalogItemId: null, jobRoles: [job], counts: { K: 1, S: 1, A: 1 },
  status: { key: 'none', via: null }, priority: null, recommendation: 'vendor', request: null, draft: null, ...o,
})
const RCA = mod({ id: 'm-1', code: 'ST-A2', name: 'Root Cause Analysis', recommendation: 'dev', priority: { rank: 1, cumulativeShare: 0.6, label: 'Root Cause Analysis' } })
const ITIL = mod({ id: 'm-2', code: 'TC-B1', name: 'ITIL Foundation', level: 'basic', stream: 'Technical Competencies' })
const DRAFT = {
  id: 'd-1', moduleId: 'm-1', moduleCode: 'ST-A2', moduleName: 'Root Cause Analysis', moduleLevel: 'advanced', moduleStream: 'Specific Technical',
  moduleObjective: 'Mampu menemukan akar masalah', status: 'draft', generatedBy: 'template', reviewerName: null, reviewNote: null,
  objectives: [{ kind: 'K', item: 'Konsep 5 Whys', text: 'Menjelaskan konsep 5 Whys pada tes tertulis (skor ≥ 80%)', assessment: 'Tes tertulis' }],
  sessions: [{ order: 1, title: 'Pembuka', detail: 'Relevansi', covers: 'Semua tujuan' }],
  assessments: [{ kind: 'K', title: 'Knowledge', detail: 'Tes tertulis, lulus bila skor ≥ 80%.', objectives: 1 }],
}

async function setup(page: Page, calls: { method: string; url: string; body: unknown }[] = []) {
  const user = { id: 'u-1', tenantId: 't-1', email: 'hr@demo.test', role: 'hr_admin' }
  await page.route('**/api/auth/tenants', (r) => r.fulfill({ json: { data: [] } }))
  // PK-16: form kata sandi hanya tampil bila API mengizinkan (dev/staging)
  await page.route('**/api/auth/methods', (r) => r.fulfill({ json: { password: true, emailLink: true } }))
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token: 't', user } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: ['dna', 'tna'], flags: { 'module.dna': true, 'module.tna': true, 'module.li': true } } }))
  await page.route(/\/api\/(dna|tna)\//, (r) => r.fulfill({ json: { data: [] } }))
  let draft = { ...DRAFT }
  await page.route(/\/api\/li\//, async (r: Route) => {
    const req = r.request(); const url = new URL(req.url()); const path = url.pathname.replace(/^.*\/api\/li/, '')
    const body = req.postData() ? JSON.parse(req.postData()!) : null
    calls.push({ method: req.method(), url: `${path}${url.search}`, body })
    if (path === '/modules' && req.method() === 'GET') {
      const prio = url.searchParams.get('priority') === 'pareto'
      return r.fulfill({ json: {
        data: prio ? [RCA] : [RCA, ITIL], vendorName: VENDOR,
        kpis: { modules: 2, knowledge: 2, skill: 2, attitude: 2, streams: 2 },
        pareto: { available: true, count: 1, codes: ['ST-A2'], cumulativeShare: 0.6, withoutGapData: 1, unlinkedFindings: 0 },
        filters: { jobRoles: [job], streams: ['Specific Technical', 'Technical Competencies'] },
      } })
    }
    const m = path.match(/^\/modules\/(m-\d)$/)
    if (m && req.method() === 'GET') {
      const row = m[1] === 'm-1' ? RCA : ITIL
      return r.fulfill({ json: { data: { ...row, objective: 'Tujuan modul', vendorName: VENDOR, items: [{ kind: 'K', text: 'Konsep dasar' }, { kind: 'S', text: 'Praktik' }, { kind: 'A', text: 'Teliti' }] } } })
    }
    if (path === '/modules/m-2/request') return r.fulfill({ status: 201, json: { data: { id: 'rq-1' } } })
    if (path === '/requests/bulk') return r.fulfill({ status: 201, json: { data: { created: 1, skipped: 0 } } })
    if (path === '/modules/m-1/draft') return r.fulfill({ status: 201, json: { data: draft } })
    if (path === '/requests' && req.method() === 'GET') {
      return r.fulfill({ json: { vendorName: VENDOR, data: {
        vendor: [{ id: 'rq-1', moduleId: 'm-2', moduleCode: 'TC-B1', moduleName: 'ITIL Foundation', vendorName: VENDOR, status: 'requested', requestedAt: '2026-11-19' }],
        drafts: [{ id: 'd-1', moduleId: 'm-1', moduleCode: 'ST-A2', moduleName: 'Root Cause Analysis', status: draft.status, reviewerName: null, reviewNote: null }],
        candidates: [],
      } } })
    }
    if (path === '/catalog') return r.fulfill({ json: { data: [{ id: 'c-1', title: 'Course RCA di LMS', source: 'moodle', externalRef: 'C-1' }] } })
    if (path === '/modules/m-1' && req.method() === 'PATCH') return r.fulfill({ json: { data: RCA } })
    if (path === '/drafts/d-1' && req.method() === 'DELETE') return r.fulfill({ status: 204, body: '' })
    if (path === '/requests/rq-1') return r.fulfill({ json: { data: { id: 'rq-1', status: body.status } } })
    if (path === '/programs') {
      return r.fulfill({ json: { vendorName: VENDOR, data: {
        jobRoles: [{ ...job, hasDictionary: true }, { id: 'jr-2', name: 'Project Manager', hasDictionary: false }], jobRoleId: url.searchParams.get('jobRoleId') ?? 'jr-1',
        level: url.searchParams.get('level') ?? 'basic', levels: [{ level: 'basic', count: 1 }, { level: 'intermediate', count: 0 }, { level: 'advanced', count: 1 }],
        kpis: { courses: 1, available: 0, inProgress: 0, noSource: 1 }, groups: [{ stream: 'Technical Competencies', modules: [ITIL] }], pareto: { available: true, codes: [] },
      } } })
    }
    if (path === '/drafts/d-1' && req.method() === 'GET') return r.fulfill({ json: { data: draft } })
    if (path === '/drafts/d-1' && req.method() === 'PUT') { draft = { ...draft, ...body }; return r.fulfill({ json: { data: draft } }) }
    if (path === '/drafts/d-1/submit') { draft = { ...draft, status: 'sme_review' }; return r.fulfill({ json: { data: draft } }) }
    if (path === '/drafts/d-1/review') { draft = { ...draft, status: body.decision, reviewerName: body.reviewerName }; return r.fulfill({ json: { data: draft } }) }
    return r.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: `mock tidak ada: ${path}` } } })
  })
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Kata sandi').fill(`pw-${Date.now()}`)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
}
const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigasi utama' })

test('menu Learning Intervention muncul saat flag module.li menyala; Library menampilkan KPI, Pareto, dan detail', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, calls)
  await expect(nav(page).getByRole('button', { name: 'Learning Intervention' })).toBeVisible()
  await nav(page).getByRole('link', { name: 'Library' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible()
  await expect(page.getByText('1 modul menutup 60% gap training')).toBeVisible()
  await expect(page.getByTestId('jumlah-modul')).toHaveText('2 modul')
  await expect(page.getByTestId('detail-modul')).toContainText('Root Cause Analysis')
  await expect(page.getByTestId('detail-modul')).toContainText('Sumber yang disarankan: dikembangkan bersama ELGOS')
  await expect(page.getByText(`ELGOS tidak mengirim apa pun ke ${VENDOR}`)).toBeVisible()

  await page.getByLabel('Prioritas').selectOption('pareto')
  await expect(page.getByTestId('jumlah-modul')).toHaveText('1 modul')
  expect(calls.some((c) => c.url.includes('priority=pareto'))).toBe(true)

  await page.getByLabel('Prioritas').selectOption('')
  await page.getByRole('button', { name: /ITIL Foundation/ }).click()
  await page.getByRole('button', { name: `Minta ke ${VENDOR}` }).click()
  await expect(page.getByTestId('info')).toContainText('Permintaan TC-B1 dicatat')
  expect(calls.find((c) => c.url === '/modules/m-2/request')?.method).toBe('POST')
})

test('Kembangkan dengan ELGOS: draf melewati empat tahap, diajukan, lalu keputusan SME dicatat HR', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, calls)
  await page.goto('/lib')
  await page.getByRole('button', { name: 'Kembangkan dengan ELGOS' }).click()
  await expect(page).toHaveURL(/\/req\/draf\/d-1$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Root Cause Analysis' })).toBeVisible()
  await expect(page.getByText('1 dari 1 tujuan terukur.')).toBeVisible()

  // tujuan tanpa angka ditandai, dan tombol ajukan terkunci
  await page.getByLabel('Tujuan terukur 1').fill('Memahami konsep akar masalah')
  await expect(page.getByText('Tambahkan kriteria ukur berupa angka')).toBeVisible()
  await page.getByLabel('Tujuan terukur 1').fill('Menjelaskan 5 Whys dengan benar pada 4 dari 5 soal')
  for (const label of ['Rancangan materi', 'Asesmen', 'Tinjau dan ajukan']) {
    await page.getByRole('button', { name: 'Lanjut' }).click()
    await expect(page.getByRole('heading', { level: 2, name: label })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Kirim ke SME untuk tinjauan' }).click()
  await expect(page.getByTestId('status-draf')).toHaveText('Menunggu tinjauan SME')
  expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ objectives: [{ text: 'Menjelaskan 5 Whys dengan benar pada 4 dari 5 soal' }] })

  await expect(page.getByRole('button', { name: 'Catat: disetujui SME' })).toBeDisabled()
  await page.getByLabel('Nama SME yang meninjau').fill('Budi')
  await page.getByRole('button', { name: 'Catat: disetujui SME' }).click()
  await expect(page.getByTestId('status-draf')).toHaveText('Disetujui SME')
  expect(calls.find((c) => c.url === '/drafts/d-1/review')?.body).toMatchObject({ decision: 'approved', reviewerName: 'Budi' })

  // rancangan disetujui: modul menjadi tersedia setelah course katalog ditautkan
  await page.goto('/lib')
  await page.getByLabel('Pilih course').selectOption('c-1')
  await page.getByRole('button', { name: 'Tautkan course' }).click()
  await expect(page.getByTestId('info')).toHaveText('Course ditautkan. Modul kini tersedia.')
  expect(calls.find((c) => c.method === 'PATCH' && c.url === '/modules/m-1')?.body).toEqual({ catalogItemId: 'c-1' })
})

test('Program & Course dan Permintaan: kamus belum ada, permintaan massal, dan langkah vendor dicatat', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, calls)
  await page.goto('/prog')
  await expect(page.getByRole('heading', { level: 1, name: 'Program & Course' })).toBeVisible()
  await expect(page.getByTestId('course-TC-B1')).toContainText('Belum ada sumber')
  await page.getByRole('button', { name: 'Minta semua modul generik di program ini' }).click()
  await expect(page.getByTestId('info')).toHaveText('1 permintaan dicatat.')
  expect(calls.find((c) => c.url === '/requests/bulk')?.body).toEqual({ scope: 'program', jobRoleId: 'jr-1', level: 'basic' })
  await page.getByRole('button', { name: /Project Manager/ }).click()
  await expect(page.getByText('Kamus kompetensi dan library modul untuk Project Manager belum tersedia')).toBeVisible()

  await nav(page).getByRole('link', { name: 'Permintaan & pengembangan' }).click()
  await expect(page.getByTestId('permintaan-TC-B1')).toContainText('Diminta')
  await expect(page.getByTestId('draf-ST-A2')).toContainText('Draf, belum diajukan')
  await page.getByRole('button', { name: 'Catat: dikonfirmasi vendor' }).click()
  await expect.poll(() => calls.find((c) => c.url === '/requests/rq-1')?.body).toEqual({ status: 'confirmed' })
})

test('Learning Intervention tidak tampil dan tidak bisa dibuka saat flag mati', async ({ page }) => {
  await setup(page)
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: ['dna', 'tna'], flags: { 'module.dna': true, 'module.tna': true } } }))
  await page.reload()
  await expect(nav(page).getByRole('button', { name: 'Learning Intervention' })).toHaveCount(0)
  await page.goto('/lib')
  await expect(page).toHaveURL(/\/$/)
})
