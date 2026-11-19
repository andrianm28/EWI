import { test, expect, type Page } from '@playwright/test'

// Alur POC DNA + TNA dengan API di-mock (tanpa backend/LLM).
const ACCESS = { submodules: ['cca', 'dna', 'tna', 'ina'], flags: { 'module.dna': true, 'module.tna': true, 'module.cca': false, 'module.ina': false } as Record<string, boolean> }

// R3-3: daftar template & riwayat impor kosong secara default; test impor menimpanya
const KINDS = {
  dna: [{ key: 'dna_results', label: 'Hasil DNA manual (gap)', description: 'Skor 0-4 per karyawan per kompetensi.', options: [
    { key: 'assessor', label: 'Pewawancara (bila kolom kosong)', type: 'text' }, { key: 'assessedAt', label: 'Tanggal wawancara (bila kolom kosong)', type: 'date' }],
  fields: [
    { key: 'employeeId', header: 'ID Karyawan', required: false, oneOf: 'employee', help: null, example: 'E-1' },
    { key: 'email', header: 'Email', required: false, oneOf: 'employee', help: null, example: null },
    { key: 'competency', header: 'Kompetensi', required: false, oneOf: 'competency', help: null, example: null },
    { key: 'score', header: 'Skor', required: true, oneOf: null, help: 'Bilangan bulat 0-4.', example: 2 },
  ] }],
  tna: [{ key: 'tna_performance', label: 'Kinerja KPI/OKR/SLA', description: 'Target dan realisasi.', options: [{ key: 'period', label: 'Periode (bila kolom kosong)', type: 'text', required: true }], fields: [] }],
}
async function mockImports(page: Page) {
  for (const sm of ['dna', 'tna'] as const) {
    await page.route(`**/api/${sm}/imports/templates`, (r) => r.fulfill({ json: { data: KINDS[sm] } }))
    await page.route(`**/api/${sm}/imports/batches`, (r) => r.fulfill({ json: { data: [] } }))
  }
}

async function loginAs(page: Page, role: string, id = 'u-1', extraFlags: Record<string, boolean> = {}) {
  await mockImports(page)
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token: 't', user: { id, tenantId: 't-1', email: `${role}@demo.test`, role } } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { ...ACCESS, flags: { ...ACCESS.flags, ...extraFlags } } }))
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

test('HR: dashboard DNA menampilkan kandidat promosi (modul promosi aktif) dan gap', async ({ page }) => {
  // Wawancara AI DNA mati di POC (flag dna.ai_interview): daftar sesi tidak diminta
  let sessionsRequested = false
  await page.route('**/api/dna/sessions', (r) => { sessionsRequested = true; return r.fulfill({ json: { data: [] } }) })
  await page.route('**/api/dna/employees', (r) => r.fulfill({ json: { data: [
    { id: 'a', name: 'Rina', email: 'rina@demo.test', role: 'learner', jobRoleName: 'Service Delivery L1', gap: { total: 4, assessed: 4, met: 4, gaps: 0, readiness: 100 }, career: career({ nextTierPassed: true, promotionCandidate: true }) },
    { id: 'b', name: 'Budi', email: 'budi@demo.test', role: 'learner', jobRoleName: 'Service Delivery L1', gap: { total: 4, assessed: 0, met: 0, gaps: 0, readiness: null }, career: career({ currentTierPassed: false, behindCurrentLevel: true, promotionCandidate: false }) },
  ] } }))
  await page.route('**/api/dna/employees/b', (r) => r.fulfill({ json: { data: {
    person: { id: 'b', name: 'Budi', email: 'budi@demo.test' }, career: career(), completions: [],
    gap: { summary: { total: 1, assessed: 1, met: 0, gaps: 1, readiness: 0 }, items: [{ competencyId: 'c1', name: 'Memahami kontrak proyek', kind: 'job', required: 3, score: 1, gap: 2, status: 'gap', source: 'manual_interview' }] },
  } } }))
  await loginAs(page, 'hr_admin', 'u-1', { 'promotion.recommendation': true })
  await page.getByTestId('card-dna').getByRole('link', { name: 'Buka' }).click()
  await expect(page.getByTestId('dna-candidates')).toContainText('1')
  await expect(page.getByTestId('dna-table')).toContainText('Kandidat Senior')
  await expect(page.getByTestId('dna-table')).toContainText('Belum lulus Basic')
  await page.getByRole('row', { name: /Budi/ }).getByRole('button', { name: 'Detail' }).click()
  await expect(page.getByTestId('dna-detail')).toContainText('1/3 · perlu dikembangkan')
  await expect(page.getByTestId('dna-detail')).toContainText('(wawancara manual)')
  expect(sessionsRequested).toBe(false)
})

test('HR: impor hasil DNA manual dari file dengan pemetaan kolom (R3-3)', async ({ page }) => {
  let uploaded = ''; let previewBody: unknown = null; let commitBody: unknown = null; let reloads = 0
  await page.route('**/api/dna/employees', (r) => { reloads += 1; return r.fulfill({ json: { data: [] } }) })
  await loginAs(page, 'hr_admin')
  await page.route(/\/api\/dna\/imports\/dna_results\?filename=/, async (r) => {
    uploaded = new URL(r.request().url()).searchParams.get('filename') ?? ''
    expect(r.request().headers()['content-type']).toBe('application/octet-stream')
    await r.fulfill({ status: 201, json: { data: { id: 'b1', kind: 'dna_results', filename: uploaded, status: 'uploaded', rowCount: 3, headers: ['NIK', 'Nama Kompetensi', 'Nilai'], mapping: { employeeId: 'NIK', email: null, competency: null, score: 'Nilai' }, options: {}, result: null, createdAt: '2026-11-13T10:00:00Z', committedAt: null, createdByName: 'HR' } } })
  })
  await page.route('**/api/dna/imports/batches/b1/preview', async (r) => {
    previewBody = r.request().postDataJSON()
    await r.fulfill({ json: { data: { valid: 2, rejectedCount: 1, rejected: [{ row: 4, reason: 'Kompetensi tidak ada di kamus kompetensi organisasi ini' }], sample: [{ row: 2, values: { employeeId: 'D-RINA', competency: 'Memahami kontrak proyek', score: 4 } }] } } })
  })
  await page.route('**/api/dna/imports/batches/b1/commit', async (r) => {
    commitBody = r.request().postDataJSON()
    await r.fulfill({ json: { data: { id: 'b1', kind: 'dna_results', filename: uploaded, status: 'committed', rowCount: 3, headers: [], mapping: {}, options: {}, result: { imported: 2, rejectedCount: 1, rejected: [] }, createdAt: '2026-11-13T10:00:00Z', committedAt: '2026-11-13T10:01:00Z', createdByName: 'HR' } } })
  })
  await page.goto('/m/dna')
  await expect(page.getByTestId('dna-candidates')).toHaveCount(0) // modul promosi mati (G2-A)
  const panel = page.getByTestId('import-panel')
  await expect(panel.getByLabel('Jenis data')).toHaveValue('dna_results')
  await panel.getByLabel('File (.xlsx atau .csv)').setInputFiles({ name: 'hasil-elgos.csv', mimeType: 'text/csv', buffer: Buffer.from('NIK,Nama Kompetensi,Nilai\nD-RINA,Memahami kontrak proyek,4\n') })
  const mapping = page.getByTestId('import-mapping')
  await expect(mapping).toContainText('hasil-elgos.csv · 3 baris')
  await expect(mapping.getByLabel('ID Karyawan')).toHaveValue('NIK')
  await mapping.getByLabel('Kompetensi').selectOption('Nama Kompetensi')
  await mapping.getByLabel('Pewawancara (bila kolom kosong)').fill('Tim ETA')
  await mapping.getByLabel('Tanggal wawancara (bila kolom kosong)').fill('2026-10-20')
  await panel.getByRole('button', { name: 'Periksa' }).click()
  await expect(page.getByTestId('import-preview')).toContainText('2 baris valid, 1 baris akan dilewati')
  await expect(page.getByTestId('import-preview')).toContainText('Baris 4: Kompetensi tidak ada')
  await expect(page.getByTestId('import-preview')).toContainText('Memahami kontrak proyek')
  const expected = { mapping: { employeeId: 'NIK', email: null, competency: 'Nama Kompetensi', score: 'Nilai' }, options: { assessor: 'Tim ETA', assessedAt: '2026-10-20' } }
  expect(previewBody).toEqual(expected)
  const before = reloads
  await panel.getByRole('button', { name: 'Simpan 2 baris' }).click()
  await expect(panel.getByRole('status')).toHaveText('2 baris disimpan, 1 baris dilewati.')
  expect(commitBody).toEqual(expected)
  expect(uploaded).toBe('hasil-elgos.csv')
  await expect(page.getByTestId('import-mapping')).toHaveCount(0)
  await expect.poll(() => reloads).toBeGreaterThan(before)
})

test('HR: unduh template impor', async ({ page }) => {
  await page.route('**/api/dna/employees', (r) => r.fulfill({ json: { data: [] } }))
  await loginAs(page, 'hr_admin')
  await page.route('**/api/dna/imports/templates/dna_results.xlsx', (r) => r.fulfill({ body: Buffer.from('xlsx'), headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } }))
  await page.goto('/m/dna')
  const download = page.waitForEvent('download')
  await page.getByTestId('import-panel').getByRole('button', { name: 'Unduh XLSX' }).click()
  expect((await download).suggestedFilename()).toBe('template-elgos-dna_results.xlsx')
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

test('HR: cakupan TNA default target merah, atau semua karyawan di role tertentu', async ({ page }) => {
  let scheduledWith: unknown = null
  await page.route('**/api/tna/dashboard', (r) => r.fulfill({ json: { data: { role: 'hr_admin', people: null, redTargets: 2, sessions: { completed: 1 }, trainingFindings: 1, planItems: {} } } }))
  await page.route('**/api/tna/findings', (r) => r.fulfill({ json: { data: [{ id: 'f1', userId: 'd', userName: 'Dimas', title: 'Kesulitan mencapai target SLA', status: 'open', competencyName: 'Memahami kontrak proyek', metricName: 'SLA respons', target: 15, actual: 30 }] } }))
  await page.route('**/api/tna/plan-items', (r) => r.fulfill({ json: { data: [] } }))
  await page.route('**/api/tna/sessions', (r) => r.fulfill({ json: { data: [] } }))
  await page.route('**/api/tna/pareto', (r) => r.fulfill({ json: { data: [{ key: 'c1', label: 'Memahami kontrak proyek', people: 3, avgMiss: 0.5, score: 4.5, share: 0.8, cumulativeShare: 0.8 }] } }))
  await page.route('**/api/tna/job-roles', (r) => r.fulfill({ json: { data: [{ id: 'jr1', name: 'Service Delivery L1', division: null }] } }))
  await page.route('**/api/projects', (r) => r.fulfill({ json: { data: [{ id: 'p1', name: 'POC Des', status: 'active' }] } }))
  await page.route('**/api/tna/projects/p1/interviews', async (r) => {
    scheduledWith = r.request().postDataJSON()
    await r.fulfill({ status: 201, json: { data: { scope: 'red_only', scheduled: 3, skipped: 0 } } })
  })
  await loginAs(page, 'hr_admin')
  await page.goto('/m/tna')
  await expect(page.getByTestId('tna-pareto')).toContainText('Memahami kontrak proyek')
  await expect(page.getByTestId('tna-findings')).toContainText('SLA respons: target 15, realisasi 30')

  await page.getByLabel('Periode', { exact: true }).fill('2026-11')
  await page.getByLabel('Proyek').selectOption('p1')
  await expect(page.getByLabel('Hanya karyawan dengan target merah')).toBeChecked()
  await page.getByRole('button', { name: 'Jadwalkan' }).click()
  await expect(page.getByRole('status')).toHaveText('3 wawancara dijadwalkan.')
  expect(scheduledWith).toEqual({ scope: 'red_only', period: '2026-11' })

  scheduledWith = null
  await page.getByLabel('Semua karyawan di job role tertentu').check()
  await page.getByRole('button', { name: 'Jadwalkan' }).click()
  await expect(page.getByRole('alert')).toHaveText('Pilih job role yang semua karyawannya akan diwawancarai.')
  expect(scheduledWith).toBeNull()
  await page.getByLabel(/^Job role/).selectOption('jr1')
  await page.getByRole('button', { name: 'Jadwalkan' }).click()
  await expect(page.getByRole('status')).toHaveText('3 wawancara dijadwalkan.')
  expect(scheduledWith).toEqual({ scope: 'all_members', period: '2026-11', jobRoleId: 'jr1' })
})

test('HR: cakupan TNA mengikuti konfigurasi klien (ELGOS: semua anggota L1)', async ({ page }) => {
  let scheduledWith: unknown = null
  await page.route('**/api/tna/dashboard', (r) => r.fulfill({ json: { data: { role: 'hr_admin', people: null, redTargets: 0, sessions: {}, trainingFindings: 0, planItems: {} } } }))
  for (const path of ['findings', 'plan-items', 'sessions', 'pareto']) await page.route(`**/api/tna/${path}`, (r) => r.fulfill({ json: { data: [] } }))
  await page.route('**/api/tna/job-roles', (r) => r.fulfill({ json: { data: [{ id: 'jr1', name: 'Service Delivery L1', division: null }], defaults: { scope: 'all_members', jobRoleId: 'jr1' } } }))
  await page.route('**/api/projects', (r) => r.fulfill({ json: { data: [{ id: 'p1', name: 'ELGOS L1', status: 'active' }] } }))
  await page.route('**/api/tna/projects/p1/interviews', async (r) => {
    scheduledWith = r.request().postDataJSON()
    await r.fulfill({ status: 201, json: { data: { scope: 'all_members', scheduled: 5, skipped: 0 } } })
  })
  await loginAs(page, 'hr_admin')
  await page.goto('/m/tna')
  await expect(page.getByLabel('Semua karyawan di job role tertentu')).toBeChecked()
  await expect(page.getByLabel(/^Job role/)).toHaveValue('jr1')
  await page.getByLabel('Periode', { exact: true }).fill('2026-11')
  await page.getByLabel('Proyek').selectOption('p1')
  await page.getByRole('button', { name: 'Jadwalkan' }).click()
  await expect(page.getByRole('status')).toHaveText('5 wawancara dijadwalkan.')
  expect(scheduledWith).toEqual({ scope: 'all_members', period: '2026-11', jobRoleId: 'jr1' })
})

test('learner: wawancara TNA lalu meminta training', async ({ page }) => {
  let state = 'scheduled'
  const empty = { data: [] }
  await page.route('**/api/tna/dashboard', (r) => r.fulfill({ json: { data: { role: 'learner', people: 1, redTargets: 1, sessions: {}, trainingFindings: 0, planItems: {} } } }))
  await page.route('**/api/tna/findings', (r) => r.fulfill({ json: state === 'completed' ? { data: [{ id: 'f1', userId: 'u-1', userName: 'Dimas', title: 'Kesulitan mencapai target SLA', status: 'open', competencyName: null, metricName: null, target: null, actual: null }] } : empty }))
  await page.route('**/api/tna/plan-items', (r) => r.fulfill({ json: empty }))
  await page.route('**/api/tna/sessions', (r) => r.fulfill({ json: { data: state === 'completed' ? [] : [{ id: 's1', projectId: 'p1', intervieweeId: 'u-1', intervieweeName: 'Dimas', status: state, triggerCount: 1 }] } }))
  await page.route('**/api/tna/sessions/s1', (r) => r.fulfill({ json: { data: { id: 's1', status: state, turns: [] } } }))
  let consentBody: unknown = null
  await page.route('**/api/tna/sessions/s1/consent', (r) => { consentBody = r.request().postDataJSON(); state = 'in_progress'; return r.fulfill({ json: { data: { question: { speaker: 'ai', text: 'Target "SLA respons" belum tercapai. Apa penyebabnya?', at: '' } } } }) })
  await page.route('**/api/tna/sessions/s1/turns', (r) => r.fulfill({ json: { data: { question: null, done: true } } }))
  await page.route('**/api/tna/sessions/s1/complete', (r) => { state = 'completed'; return r.fulfill({ json: { data: { status: 'completed' } } }) })
  let requested = false
  await page.route('**/api/tna/training-requests', (r) => { requested = true; return r.fulfill({ status: 201, json: { data: {} } }) })

  await loginAs(page, 'learner')
  await page.goto('/m/tna')
  await page.getByTestId('tna-my-sessions').getByRole('link', { name: 'Mulai wawancara' }).click()
  // PM-9 A: tombol aktif setelah kotak dicentang; kode versi teks ikut terkirim
  const start = page.getByRole('button', { name: 'Setuju dan mulai' })
  await expect(start).toBeDisabled()
  await page.getByTestId('consent-check').check()
  await start.click()
  await expect(page.getByTestId('turn-ai')).toContainText('SLA respons')
  expect(consentBody).toEqual({ consentVersion: 'tna-consent-id-v1.0' })
  await page.getByLabel('Jawaban').fill('Saya sulit memahami kontrak proyek.')
  await page.getByRole('button', { name: 'Kirim' }).click()
  await page.getByRole('button', { name: 'Selesai dan kirim' }).click()
  await expect(page).toHaveURL(/\/m\/tna$/)
  await expect(page.getByTestId('tna-pareto')).toHaveCount(0)
  await page.getByRole('button', { name: 'Minta training' }).click()
  await expect(page.getByRole('status')).toHaveText('Permintaan training terkirim.')
  expect(requested).toBe(true)
})

test('karyawan: minta link masuk lalu masuk dari link email (R3-2)', async ({ page }) => {
  let requested: unknown = null; let verified: unknown = null
  await mockImports(page)
  await page.route('**/api/auth/email-link', async (r) => {
    requested = r.request().postDataJSON()
    await r.fulfill({ status: 202, json: { message: 'Bila email terdaftar di organisasi ini, link masuk sudah dikirim. Periksa kotak masuk Anda.' } })
  })
  await page.route('**/api/auth/email-link/verify', async (r) => {
    verified = r.request().postDataJSON()
    await r.fulfill({ json: { token: 't', user: { id: 'u-l', tenantId: 't-1', email: 'dimas@demo.test', role: 'learner' } } })
  })
  await page.route('**/api/me/access', (r) => r.fulfill({ json: ACCESS }))
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill('dimas@demo.test')
  await page.getByRole('button', { name: 'Minta link lewat email' }).click()
  await expect(page.getByRole('status')).toContainText('link masuk sudah dikirim')
  expect(requested).toEqual({ tenant: 'demo', email: 'dimas@demo.test' })

  await page.goto('/masuk#token=abcdefghijklmnopqrstuvwxyz012345')
  await expect(page).toHaveURL(/\/masuk$/) // token dihapus dari address bar
  expect(verified).toBeNull() // belum ditukar sebelum tombol ditekan
  await page.getByRole('button', { name: 'Lanjutkan masuk' }).click()
  await expect(page.getByTestId('card-dna')).toBeVisible()
  expect(verified).toEqual({ token: 'abcdefghijklmnopqrstuvwxyz012345' })
})

test('link masuk tidak valid menampilkan pesan', async ({ page }) => {
  await page.route('**/api/auth/email-link/verify', (r) => r.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Link masuk tidak valid, sudah dipakai, atau kedaluwarsa. Minta link baru.' } } }))
  await page.goto('/masuk#token=abcdefghijklmnopqrstuvwxyz012345')
  await page.getByRole('button', { name: 'Lanjutkan masuk' }).click()
  await expect(page.getByRole('alert')).toContainText('Minta link baru')
})

test('HR: kirim undangan masuk ke karyawan baru', async ({ page }) => {
  await page.route('**/api/dna/employees', (r) => r.fulfill({ json: { data: [] } }))
  await loginAs(page, 'hr_admin')
  await page.route('**/api/invitations', (r) => r.fulfill({ status: 201, json: { data: { sent: 12 } } }))
  await page.goto('/m/dna')
  await page.getByRole('button', { name: 'Kirim undangan masuk ke karyawan yang belum pernah masuk' }).click()
  await expect(page.getByTestId('import-panel').getByRole('status')).toHaveText('Undangan masuk dikirim ke 12 karyawan.')
})

// PK-14: review hasil AI oleh HR sebelum hasil tampil (PD-14 ★A, PM-5 ★A)
test('HR: antrean review hasil AI, setujui, ubah, dan tolak dengan alasan', async ({ page }) => {
  const base = { projectId: 'p1', sessionId: 's1', userId: 'd', userName: 'Dimas', detail: null, competencyName: null, metricName: 'SLA respons', target: 85, actual: 70,
    reviewedByName: null, reviewedAt: null, reviewNote: null, originalTitle: null, originalDetail: null, originalCategory: null, createdAt: '' }
  let queue = [
    { ...base, id: 'f1', category: 'training', title: 'Belum paham batas SLA', confidence: 0.85, scoringAgreement: true, reviewStatus: 'draft' },
    { ...base, id: 'f2', category: 'non_training', title: 'VPN putus saat shift malam', confidence: 0.4, scoringAgreement: false, reviewStatus: 'draft' },
    { ...base, id: 'f3', category: 'training', title: 'Format laporan', confidence: 0.6, scoringAgreement: true, reviewStatus: 'draft' },
  ]
  const decisions: Record<string, unknown> = {}
  await page.route('**/api/tna/dashboard', (r) => r.fulfill({ json: { data: { role: 'hr_admin', people: null, redTargets: 3, sessions: { completed: 1 }, trainingFindings: 0, planItems: {}, reviewPending: queue.length } } }))
  for (const path of ['findings', 'plan-items', 'sessions', 'pareto']) await page.route(`**/api/tna/${path}`, (r) => r.fulfill({ json: { data: [] } }))
  await page.route('**/api/tna/job-roles', (r) => r.fulfill({ json: { data: [] } }))
  await page.route('**/api/tna/review?*', (r) => r.fulfill({ json: { data: queue, counts: { draft: queue.length, approved: 0, edited: 0, rejected: 0 } } }))
  await page.route('**/api/tna/findings/*/review', async (r) => {
    const id = r.request().url().split('/').at(-2) as string
    decisions[id] = r.request().postDataJSON()
    queue = queue.filter((f) => f.id !== id)
    return r.fulfill({ json: { data: {} } })
  })
  await loginAs(page, 'hr_admin')
  await page.goto('/m/tna')
  await expect(page.getByTestId('tna-review-banner')).toContainText('3 temuan AI dari wawancara TNA menunggu review')
  await page.getByTestId('tna-review-banner').getByRole('link', { name: 'Review' }).click()
  await expect(page).toHaveURL(/\/m\/tna\/review$/)
  await expect(page.getByTestId('review-item-f1')).toContainText('Keyakinan tinggi (85%)')
  await expect(page.getByTestId('review-item-f2')).toContainText('Keyakinan rendah (40%)')
  await expect(page.getByTestId('review-item-f2')).toContainText('Dua penilaian AI berbeda')

  await page.getByTestId('review-item-f1').getByRole('button', { name: 'Setujui' }).click()
  await expect(page.getByRole('status')).toContainText('Temuan disetujui')
  await expect(page.getByTestId('review-item-f1')).toHaveCount(0)

  await page.getByTestId('review-item-f2').getByRole('button', { name: 'Tolak' }).click()
  await page.getByLabel('Alasan penolakan').fill('Sudah ditangani tim IT')
  await page.getByRole('button', { name: 'Tolak temuan' }).click()
  await expect(page.getByRole('status')).toContainText('Temuan ditolak')

  await page.getByTestId('review-item-f3').getByRole('button', { name: 'Ubah' }).click()
  await page.getByLabel('Judul').fill('Belum menguasai format laporan bulanan baru')
  await page.getByRole('button', { name: 'Simpan dan setujui' }).click()
  await expect(page.getByTestId('review-empty')).toBeVisible()
  expect(decisions).toEqual({
    f1: { decision: 'approve' },
    f2: { decision: 'reject', note: 'Sudah ditangani tim IT' },
    f3: { decision: 'edit', title: 'Belum menguasai format laporan bulanan baru', detail: '', category: 'training' },
  })
})

test('Karyawan tidak bisa membuka antrean review', async ({ page }) => {
  await loginAs(page, 'learner')
  await page.goto('/m/tna/review')
  await expect(page).toHaveURL(/\/$/)
})

test('PO-6 A: HR membuka sesi wawancara tanpa melihat percakapan', async ({ page }) => {
  await page.route('**/api/tna/sessions/s9', (r) => r.fulfill({ json: { data: { id: 's9', status: 'completed', transcriptVisible: false } } }))
  await loginAs(page, 'hr_admin')
  await page.goto('/m/tna/sessions/s9')
  await expect(page.getByTestId('transcript-private')).toBeVisible()
  await expect(page.getByTestId('turn-human')).toHaveCount(0)
})
