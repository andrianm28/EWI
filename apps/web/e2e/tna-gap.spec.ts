import { test, expect, type Page } from '@playwright/test'
import { loginSebagai, PERAN_API, type Peran } from './support/sesi'
import { mockApi, cocok, permintaanBelumDimock, type ResponsApi } from './support/api'

// B5 Training Needs: papan gap, detail gap, dan penugasan wawancara. Spek: docs/designs/b5-training-needs.md bagian 16.
// API di-mock; flag papan dan penugasan bawaan mati di produksi, di sini dinyalakan per test.

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
      session: { id: 's-open', status: 'scheduled', inviteExpiresAt: '2026-12-01T16:59:59.000Z', projectId: P1, assignedBy: 'u-hr', open: true } },
  ],
}

interface Opts { peran?: Peran; flags?: Record<string, boolean>; assign?: ResponsApi; cancel?: ResponsApi }
interface Sent { path: string; body: unknown }

/** Masuk lewat support/ B18 (loginSebagai + mockApi). Mengembalikan daftar permintaan tulis yang dikirim layar. */
async function setup(page: Page, o: Opts = {}): Promise<Sent[]> {
  const sent: Sent[] = []
  const data = (d: unknown, status = 200): ResponsApi => ({ status, json: { data: d } })
  await mockApi(page, (req) => {
    if (cocok(req, 'GET /:sm/imports/templates') || cocok(req, 'GET /:sm/imports/batches')) return data([])
    // Pengelolaan TNA lama
    if (cocok(req, 'GET /tna/dashboard')) return data({ role: PERAN_API[o.peran ?? 'hr'], people: null, redTargets: 1, sessions: {}, trainingFindings: 0, planItems: {} })
    if (cocok(req, 'GET /tna/findings')) return data([{ id: 'f1', userId: 'd', userName: 'Dimas', title: 'Kesulitan analisis insiden', status: 'open', competencyName: null, metricName: null, target: null, actual: null }])
    if (cocok(req, 'GET /tna/pareto') || cocok(req, 'GET /tna/plan-items') || cocok(req, 'GET /tna/sessions')) return data([])
    if (cocok(req, 'GET /tna/job-roles')) return { json: { data: [{ id: 'jr1', name: 'Service Delivery L1' }], defaults: { scope: 'red_only', jobRoleId: null } } }
    if (cocok(req, 'GET /projects')) return data([{ id: P1, name: 'Pilot L1', status: 'active' }, { id: 'p-closed', name: 'Lama', status: 'closed' }])
    // Papan gap B5
    if (cocok(req, 'GET /tna/gaps/summary')) return data(SUMMARY)
    if (cocok(req, 'GET /tna/gaps/competencies')) return data({ rows: [COMP], unapprovedCompetencies: 2 })
    if (cocok(req, 'GET /tna/gaps/okr')) return data({ rows: [OKR], period: '2026-11', periods: SUMMARY.periods })
    if (cocok(req, 'GET /tna/gaps/detail')) return data(DETAIL)
    if (cocok(req, 'POST /tna/assignments')) {
      sent.push({ path: '/assignments', body: req.body })
      return o.assign ?? data({ assigned: [{ sessionId: 's-new', employeeId: E1, inviteExpiresAt: '2026-12-05T16:59:59.000Z', durationMinutes: 15, replaced: false }], skipped: [] }, 201)
    }
    if (cocok(req, 'POST /tna/assignments/:id/cancel')) {
      sent.push({ path: `/api${req.path}`, body: null })
      return o.cancel ?? data({ id: 's-open', status: 'abandoned' })
    }
    return undefined
  })
  await loginSebagai(page, o.peran ?? 'hr', { submodules: ['cca', 'dna', 'tna', 'ina'], flags: o.flags })
  return sent
}

const BOARD = { 'tna.gap_board': true }

// Layar tidak boleh bergantung pada endpoint yang tidak di-mock (jaring pengaman support/api.ts)
test.afterEach(({ page }) => { expect(permintaanBelumDimock(page)).toEqual([]) })

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
  await expect(comp.getByRole('columnheader', { name: 'Status wawancara' })).toBeVisible()
  await expect(comp).toContainText('0 selesai · 1 berjalan')
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
    assign: { status: 400, json: { error: { code: 'DUE_DATE_OUT_OF_RANGE', message: 'Tenggat paling cepat besok dan paling lama 30 hari lagi' } } },
  })
  await page.goto(`/tna/gap?kind=competency&competencyId=${C1}`)
  const form = page.getByRole('form', { name: 'Tugaskan wawancara' })
  await form.getByLabel('Tenggat').fill('2026-12-05')
  await form.getByRole('button', { name: 'Tugaskan wawancara' }).click()
  await expect(page.getByRole('alert').getByRole('link', { name: /Tenggat paling cepat besok/ })).toBeVisible()
})

test('HR: tenggat kosong ditolak di peramban, galat menaut ke field', async ({ page }) => {
  const sent = await setup(page, { flags: { ...BOARD, 'tna.interview_assignment': true } })
  await page.goto(`/tna/gap?kind=competency&competencyId=${C1}`)
  const form = page.getByRole('form', { name: 'Tugaskan wawancara' })
  await form.getByRole('button', { name: 'Tugaskan wawancara' }).click()
  await expect(page.getByRole('alert').getByRole('link', { name: 'Pilih tenggat wawancara' })).toBeVisible()
  await expect(form.getByLabel('Tenggat')).toHaveAttribute('aria-invalid', 'true')
  expect(sent.some((s) => s.path === '/assignments')).toBe(false)
})

test('atasan: penugasan dari HR tidak bisa dibatalkan, tombol tinjauan HR tidak ada', async ({ page }) => {
  await setup(page, { peran: 'atasan', flags: { ...BOARD, 'tna.interview_assignment': true } })
  await page.goto(`/tna/gap?kind=competency&competencyId=${C1}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Analisis insiden' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Langsung ke tinjauan HR' })).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'Semua karyawan di jabatan' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Batalkan penugasan Sari' })).toHaveCount(0)
})

test('HR membatalkan penugasan; penolakan API tampil di ringkasan galat', async ({ page }) => {
  const sent = await setup(page, {
    flags: { ...BOARD, 'tna.interview_assignment': true },
    cancel: { status: 409, json: { error: { code: 'INVALID_STATE', message: 'Wawancara sudah dimulai, penugasan tidak bisa dibatalkan' } } },
  })
  await page.goto(`/tna/gap?kind=competency&competencyId=${C1}`)
  await page.getByRole('button', { name: 'Batalkan penugasan Sari' }).click()
  await expect(page.getByRole('alert')).toContainText('Wawancara sudah dimulai')
  expect(sent.some((s) => s.path === '/api/tna/assignments/s-open/cancel')).toBe(true)
})

test('flag penugasan mati: detail gap tanpa formulir penugasan', async ({ page }) => {
  await setup(page, { flags: BOARD })
  await page.goto(`/tna/gap?kind=competency&competencyId=${C1}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Analisis insiden' })).toBeVisible()
  await expect(page.getByRole('form', { name: 'Tugaskan wawancara' })).toHaveCount(0)
})
