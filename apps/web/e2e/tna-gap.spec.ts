import { test, expect, type Page, type Route } from '@playwright/test'

// B5 Training Needs: papan gap, detail gap, dan penugasan wawancara. Spek: docs/designs/b5-training-needs.md bagian 16.
// API di-mock; flag papan dan penugasan bawaan mati di produksi, di sini dinyalakan per test.

const ACCESS = { submodules: ['cca', 'dna', 'tna', 'ina'], flags: { 'module.dna': true, 'module.tna': true } as Record<string, boolean> }
const C1 = '11111111-1111-4111-8111-111111111111'
const E1 = 'e1111111-1111-4111-8111-111111111111'
const E2 = 'e2222222-2222-4222-8222-222222222222'
const P1 = 'p1111111-1111-4111-8111-111111111111'

const SUMMARY = {
  period: '2026-11', periods: ['2026-11', '2026-10'],
  kpis: { competencyGaps: 2, okrGaps: 1, totalGaps: 3, interviewed: 1, top4Share: 0.86 },
  classification: { training: 1, non_training: 0, review: 1, pending: 1 }, unapprovedCompetencies: 2,
}
const COMP = {
  key: `c:${C1}`, kind: 'competency', competencyId: C1, name: 'Analisis insiden', target: 3, actual: 2.25, gap: 0.75,
  targetPct: 75, actualPct: 56, gapPct: 19, assessed: 4, peopleWithGap: 3, peopleTotal: 5, cumulativeShare: 0.41,
  classification: 'pending', interviewed: false, interviewedCount: 0, assignedCount: 1,
}
const OKR = {
  key: 'o:sla|waktu respons|2026-11', kind: 'okr', metricType: 'sla', name: 'Waktu respons', period: '2026-11', target: 15, actual: 22.5, diff: 7.5,
  targetVaries: false, direction: 'lower', tolerance: 0, unit: 'menit', valueType: 'angka', peopleMissed: 2, peopleTotal: 4,
  classification: 'review', interviewed: true, interviewedCount: 1, assignedCount: 0,
}
const DETAIL = {
  ...COMP,
  evidence: ['3 dari 4 karyawan yang dinilai berada di bawah target.'],
  hypotheses: [{ text: 'Materi pelatihan belum mencakup langkah ini.', verified: false }],
  jobRoles: ['Service Delivery L1'],
  employees: [
    { id: E1, name: 'Dimas', jobRoleId: 'jr1', jobRoleName: 'Service Delivery L1', value: 2, target: 3, gap: 1, self: false, assignable: true, session: null },
    { id: E2, name: 'Sari', jobRoleId: 'jr1', jobRoleName: 'Service Delivery L1', value: 2, target: 3, gap: 1, self: false, assignable: true,
      session: { id: 's-open', status: 'scheduled', inviteExpiresAt: '2026-12-01T16:59:59.000Z', projectId: P1, assignedBy: 'u-1', open: true } },
  ],
}

interface Opts { role?: string; flags?: Record<string, boolean>; assign?: (r: Route) => Promise<void> | void; cancel?: (r: Route) => Promise<void> | void }
interface Sent { path: string; body: unknown }

async function setup(page: Page, o: Opts = {}): Promise<Sent[]> {
  const role = o.role ?? 'hr_admin'
  const sent: Sent[] = []
  const ok = (r: Route, data: unknown) => r.fulfill({ json: { data } })
  for (const sm of ['dna', 'tna']) {
    await page.route(`**/api/${sm}/imports/templates`, (r) => ok(r, []))
    await page.route(`**/api/${sm}/imports/batches`, (r) => ok(r, []))
  }
  const user = { id: 'u-1', tenantId: 't-1', email: `${role}@demo.test`, role }
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token: 't', user } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { ...ACCESS, flags: { ...ACCESS.flags, ...(o.flags ?? {}) } } }))
  // Pengelolaan TNA lama
  await page.route('**/api/tna/dashboard', (r) => ok(r, { role, people: null, redTargets: 1, sessions: {}, trainingFindings: 0, planItems: {} }))
  await page.route('**/api/tna/findings', (r) => ok(r, [{ id: 'f1', userId: 'd', userName: 'Dimas', title: 'Kesulitan analisis insiden', status: 'open', competencyName: null, metricName: null, target: null, actual: null }]))
  await page.route('**/api/tna/pareto', (r) => ok(r, []))
  await page.route('**/api/tna/plan-items', (r) => ok(r, []))
  await page.route('**/api/tna/sessions', (r) => ok(r, []))
  await page.route('**/api/tna/job-roles', (r) => r.fulfill({ json: { data: [{ id: 'jr1', name: 'Service Delivery L1' }], defaults: { scope: 'red_only', jobRoleId: null } } }))
  await page.route('**/api/projects', (r) => ok(r, [{ id: P1, name: 'Pilot L1', status: 'active' }, { id: 'p-closed', name: 'Lama', status: 'closed' }]))
  // Papan gap B5
  await page.route(/\/api\/tna\/gaps\/summary/, (r) => ok(r, SUMMARY))
  await page.route(/\/api\/tna\/gaps\/competencies/, (r) => ok(r, { rows: [COMP], unapprovedCompetencies: 2 }))
  await page.route(/\/api\/tna\/gaps\/okr/, (r) => ok(r, { rows: [OKR], period: '2026-11', periods: SUMMARY.periods }))
  await page.route(/\/api\/tna\/gaps\/detail/, (r) => ok(r, DETAIL))
  await page.route('**/api/tna/assignments', async (r) => {
    sent.push({ path: '/assignments', body: r.request().postDataJSON() })
    if (o.assign) return o.assign(r)
    return r.fulfill({ status: 201, json: { data: { assigned: [{ sessionId: 's-new', employeeId: E1, inviteExpiresAt: '2026-12-05T16:59:59.000Z', durationMinutes: 15, replaced: false }], skipped: [] } } })
  })
  await page.route('**/api/tna/assignments/*/cancel', async (r) => {
    sent.push({ path: new URL(r.request().url()).pathname, body: null })
    if (o.cancel) return o.cancel(r)
    return r.fulfill({ json: { data: { id: 's-open', status: 'abandoned' } } })
  })
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(`pw-${Date.now()}`)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByTestId('card-dna')).toBeVisible()
  return sent
}

const BOARD = { 'tna.gap_board': true }

test('flag papan mati: halaman Training Needs hanya berisi pengelolaan TNA lama', async ({ page }) => {
  await setup(page)
  await page.goto('/tna')
  await expect(page.getByRole('heading', { level: 1, name: 'Training Needs' })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.getByTestId('tna-findings')).toContainText('Kesulitan analisis insiden')
})

test('alamat lama /m/tna dialihkan ke /tna', async ({ page }) => {
  await setup(page)
  await page.goto('/m/tna')
  await expect(page).toHaveURL(/\/tna$/)
  await expect(page.getByTestId('tna-findings')).toBeVisible()
})

test('HR: ringkasan KPI, tab gap kompetensi dan OKR dengan label klasifikasi', async ({ page }) => {
  await setup(page, { flags: BOARD })
  await page.goto('/tna')
  await expect(page.getByRole('tab', { name: 'Ringkasan' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('GAP KOMPETENSI', { exact: true })).toBeVisible()
  await expect(page.getByText('KONTRIBUSI 4 GAP TERBESAR', { exact: true })).toBeVisible()
  await expect(page.getByText('86%', { exact: true })).toBeVisible()
  await expect(page.getByText('2 kompetensi menunggu pengesahan HR')).toBeVisible()
  await page.getByRole('tab', { name: 'Gap kompetensi' }).click()
  const comp = page.getByRole('table', { name: 'Gap kompetensi' })
  await expect(comp).toContainText('Analisis insiden')
  await expect(comp).toContainText('Belum diwawancarai')
  await page.getByRole('tab', { name: 'Gap OKR' }).click()
  const okr = page.getByRole('table', { name: 'Gap OKR' })
  await expect(okr).toContainText('Waktu respons')
  await expect(okr).toContainText('Perlu ditinjau HR')
  await expect(page.getByTestId('tna-findings')).toBeVisible()
})

test('HR: klik gap membuka detail, lalu tugaskan wawancara untuk karyawan terpilih', async ({ page }) => {
  const sent = await setup(page, { flags: { ...BOARD, 'tna.interview_assignment': true } })
  await page.goto('/tna?tab=kompetensi')
  await page.getByRole('link', { name: 'Analisis insiden' }).click()
  await expect(page).toHaveURL(/\/tna\/gap\?/)
  await expect(page.getByRole('heading', { level: 1, name: 'Analisis insiden' })).toBeVisible()
  await expect(page.getByText('3 dari 4 karyawan yang dinilai berada di bawah target.')).toBeVisible()
  await expect(page.getByText('Materi pelatihan belum mencakup langkah ini.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Langsung ke tinjauan HR' })).toBeVisible()

  const form = page.getByRole('form', { name: 'Tugaskan wawancara' })
  // Sari sudah punya sesi terbuka, jadi tidak bisa dicentang
  await expect(form.getByRole('checkbox', { name: 'Sari' })).toHaveCount(0)
  await form.getByRole('checkbox', { name: 'Dimas' }).check()
  await form.getByLabel('Tenggat').fill('2026-12-05')
  await form.getByRole('radio', { name: '15 menit' }).check()
  await form.getByRole('button', { name: 'Tugaskan wawancara' }).click()
  await expect(page.getByRole('status')).toContainText('1 wawancara ditugaskan')
  expect(sent.find((s) => s.path === '/assignments')?.body).toEqual({
    projectId: P1, gap: { kind: 'competency', competencyId: C1 }, mode: 'affected', employeeIds: [E1], dueDate: '2026-12-05', durationMinutes: 15,
  })
})

test('HR: galat penugasan dari API ditampilkan', async ({ page }) => {
  await setup(page, {
    flags: { ...BOARD, 'tna.interview_assignment': true },
    assign: (r) => r.fulfill({ status: 400, json: { error: { code: 'DUE_DATE_OUT_OF_RANGE', message: 'Tenggat paling cepat besok dan paling lama 30 hari lagi' } } }),
  })
  await page.goto(`/tna/gap?kind=competency&competencyId=${C1}`)
  const form = page.getByRole('form', { name: 'Tugaskan wawancara' })
  await form.getByLabel('Tenggat').fill('2026-12-05')
  await form.getByRole('button', { name: 'Tugaskan wawancara' }).click()
  await expect(page.getByRole('alert')).toContainText('Tenggat paling cepat besok')
})

test('atasan: membatalkan penugasan orang lain ditolak, tombol tinjauan HR tidak ada', async ({ page }) => {
  const sent = await setup(page, {
    role: 'supervisor',
    flags: { ...BOARD, 'tna.interview_assignment': true },
    cancel: (r) => r.fulfill({ status: 403, json: { error: { code: 'NOT_ASSIGNER', message: 'Hanya penugas atau HR yang bisa membatalkan penugasan ini' } } }),
  })
  await page.goto(`/tna/gap?kind=competency&competencyId=${C1}`)
  await expect(page.getByRole('link', { name: 'Langsung ke tinjauan HR' })).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'Semua karyawan di jabatan' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Batalkan penugasan Sari' }).click()
  await expect(page.getByRole('alert')).toContainText('Hanya penugas atau HR')
  expect(sent.some((s) => s.path === '/api/tna/assignments/s-open/cancel')).toBe(true)
})

test('flag penugasan mati: detail gap tanpa formulir penugasan', async ({ page }) => {
  await setup(page, { flags: BOARD })
  await page.goto(`/tna/gap?kind=competency&competencyId=${C1}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Analisis insiden' })).toBeVisible()
  await expect(page.getByRole('form', { name: 'Tugaskan wawancara' })).toHaveCount(0)
})
