import { test, expect, type Page, type Route } from '@playwright/test'

// B10 Core Competencies: layar HR (tab visi-misi, nilai, wawancara AI) dan layar penugasan atasan/karyawan.
// Spek: docs/designs/b10-core-competencies.md bagian 13. API di-mock.
const row = (id: string, name: string, target: number, actual: number | null, status = 'draft') => {
  const gap = actual === null ? null : Math.max(0, target - actual)
  return { id, name, definition: null, targetScore: target, actualScore: actual, actualSource: actual === null ? null : 'manual', gap, classification: gap === null ? 'belum_diukur' : gap <= 8 ? 'dalam_batas' : 'perlu_ditinjau', status }
}
const VM = {
  kpis: { readiness: 79, biggestGap: { name: 'Arsitektur public cloud', gap: 17 }, belowTarget: { count: 1, measured: 2, total: 3 }, pendingValidation: 2 },
  groups: [
    { id: 's-1', kind: 'vision', title: 'Corporate Vision', text: 'Menjadi pemimpin layanan cloud.', sourceRef: 'contoh.test/about', readiness: 79,
      rows: [row('r-1', 'Arsitektur public cloud', 80, 63), row('r-2', 'Tata kelola layanan', 80, 75, 'validated'), row('r-3', 'Otomasi', 75, null)] },
    { id: 's-2', kind: 'mission', title: 'Corporate Mission', text: 'Memberi manfaat lewat teknologi.', sourceRef: null, readiness: null, rows: [] },
  ],
}
const VALUES = {
  kpis: { readiness: 82, biggestGap: { name: 'Serah terima rapi', gap: 20 }, belowTarget: { count: 1, measured: 2, total: 2 }, pendingValidation: 0, weakestSource: { title: 'Committed', readiness: 75 } },
  groups: [
    { id: 's-3', kind: 'value', title: 'Credible', text: 'Dapat dipercaya.', sourceRef: null, readiness: 90, rows: [row('r-4', 'Menepati janji', 80, 72, 'validated')] },
    { id: 's-4', kind: 'value', title: 'Committed', text: 'Tuntas.', sourceRef: null, readiness: 75, rows: [row('r-5', 'Serah terima rapi', 80, 60, 'validated')] },
  ],
}
const CONFIG = {
  values: [{ name: 'Credible' }, { name: 'Committed' }], components: [{ name: 'Kuis', weight: 40 }, { name: 'Asesmen akhir', weight: 60 }],
  totalActivities: 9, passScore: 70, bands: [{ key: 'strong', label: 'Strong Culture Alignment', min: 85, description: 'Skor akhir 85 atau lebih' }, { key: 'baseline', label: 'Baseline Implementation', min: 70, description: null }],
}
const PROGRAM = { key: 'dna-5c', name: "Elitery's DNA 5C", provider: 'Elite Academy', cutoffDate: '2026-10-09', config: CONFIG, insight: 'Skor akhir tertahan kuis.', recommendations: [{ title: 'Selesaikan kegiatan', detail: 'Dampingi yang belum selesai.' }], participants: 0, manualReport: null }
const div = (name: string, participants: number, completed: number, passed: number) => ({ name, participants, completed, completedPct: Math.round((completed / participants) * 100), passed, passedPct: Math.round((passed / participants) * 100), avgFinal: 72.1, avgValueScore: 93.4 })
const REPORT = {
  source: 'manual', program: { key: 'dna-5c', name: "Elitery's DNA 5C", provider: 'Elite Academy', cutoffDate: '2026-10-09' },
  kpis: { registered: 135, completed: 69, completedPct: 51, passed: 39, passedPct: 29, avgValueScore: 93.4 },
  statuses: [
    { key: 'strong', label: 'Strong Culture Alignment', description: 'Skor akhir 85 atau lebih', min: 85, count: 7, pct: 5 },
    { key: 'baseline', label: 'Baseline Implementation', description: null, min: 70, count: 32, pct: 24 },
    { key: 'not_passed', label: 'Belum lulus', description: null, min: null, count: 30, pct: 22 },
    { key: 'in_progress', label: 'Masih berjalan', description: null, min: null, count: 66, pct: 49 },
  ],
  values: [{ name: 'Credible', avgCompleted: 94.1, avgAll: 61.2 }, { name: 'Committed', avgCompleted: 92.7, avgAll: 60.3 }],
  components: [{ name: 'Kuis', weight: 40, done: 120, donePct: 89, avg: 58.2, contribution: 23.28 }, { name: 'Asesmen akhir', weight: 60, done: 69, donePct: 51, avg: 81.5, contribution: 48.9 }],
  total: { done: 69, donePct: 51, avgFinal: 72.1 },
  divisions: [div('IT Service Delivery', 80, 45, 25), div('Sales', 55, 24, 14)], allDivisions: div('Semua divisi', 135, 69, 39),
  insight: 'Skor akhir tertahan kuis.', recommendations: [{ title: 'Selesaikan kegiatan', detail: 'Dampingi yang belum selesai.' }],
}
const leaderRow = (userId: string, name: string, status: string, extra = {}) => ({ userId, name, division: 'IT Service Delivery', jobRoleName: 'Kepala Divisi', assignmentId: status === 'none' ? null : `a-${userId}`, status, dueDate: status === 'none' ? null : '2026-11-30', teamTotal: 6, teamAssigned: 0, teamDone: 0, ...extra })
const HR_ASSIGN = {
  role: 'hr', mine: { leader: null, employee: null },
  kpis: { leadersEligible: 3, leadersAssigned: 1, leadersCompleted: 1, employeesAssigned: 4, employeesCompleted: 3 },
  leaders: [leaderRow('u-l1', 'Dewi Atasan', 'completed', { teamAssigned: 4, teamDone: 3 }), leaderRow('u-l2', 'Budi Atasan', 'none'), leaderRow('u-l3', 'Citra Atasan', 'none')],
}
const assignment = (tier: string, status: string) => ({ id: `as-${tier}`, tier, status, dueDate: '2026-11-30', durationMinutes: 10, completedAt: status === 'completed' ? '2026-11-20T03:00:00Z' : null })

interface Opts { role?: string; interview?: boolean; assignments?: unknown; featureDisabled?: boolean }
interface Sent { method: string; path: string; body: unknown }

async function loginAs(page: Page, o: Opts = {}): Promise<Sent[]> {
  const role = o.role ?? 'hr_admin'
  const user = { id: 'u-1', tenantId: 't-1', email: `${role}@demo.test`, role }
  const sent: Sent[] = []
  const ok = (r: Route, data: unknown, status = 200) => r.fulfill({ status, json: { data } })
  await page.route('**/api/auth/tenants', (r) => r.fulfill({ json: { data: [] } }))
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token: 't', user } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: ['cca', 'dna', 'tna'], flags: { 'module.cca': true, 'module.dna': true, 'module.tna': true, 'cca.interview': o.interview ?? true } } }))
  await page.route(/\/api\/(dna|tna)\//, (r) => r.fulfill({ json: { data: [] } }))
  await page.route(/\/api\/cca\//, async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const path = url.pathname.replace(/^.*\/api\/cca/, '')
    if (req.method() !== 'GET') {
      sent.push({ method: req.method(), path, body: req.postDataJSON() })
      if (path === '/assignments') return ok(r, { tier: 'leader', assigned: (req.postDataJSON().assigneeIds as string[]).map((id) => ({ ...assignment('leader', 'assigned'), assigneeId: id })), skipped: [], rejected: [] }, 201)
      return ok(r, {})
    }
    if (path === '/overview') return ok(r, url.searchParams.get('group') === 'values' ? VALUES : VM)
    if (path === '/programs') return ok(r, [PROGRAM])
    if (path === '/programs/dna-5c/report') return ok(r, REPORT)
    if (path === '/assignments') {
      if (o.featureDisabled) return r.fulfill({ status: 403, json: { error: { code: 'FEATURE_DISABLED', message: 'Belum diaktifkan' } } })
      return ok(r, o.assignments ?? HR_ASSIGN)
    }
    return ok(r, [])
  })
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(`pw-${Date.now()}`)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
  return sent
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigasi utama' })

test('HR: tab Vision & Mission menampilkan kesiapan, gap, dan status validasi; HR memvalidasi persyaratan', async ({ page }) => {
  const sent = await loginAs(page)
  await nav(page).getByRole('link', { name: 'Core Competencies' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Core Competencies' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Corporate Vision & Mission' })).toHaveAttribute('aria-selected', 'true')
  const panel = page.getByTestId('cc-req-vm')
  await expect(panel.getByText('79%').first()).toBeVisible()
  await expect(panel.getByText('1 dari 2')).toBeVisible()
  const vision = page.getByTestId('cc-sumber-vision')
  const cloud = vision.getByRole('row', { name: /Arsitektur public cloud/ })
  await expect(cloud).toContainText('Perlu ditinjau HR')
  await expect(cloud).toContainText('Menunggu validasi HR')
  await expect(cloud).toContainText('−17')
  await expect(vision.getByRole('row', { name: /Otomasi/ })).toContainText('Belum diukur')
  await expect(vision.getByRole('row', { name: /Tata kelola layanan/ })).toContainText('Tervalidasi')
  await expect(panel.getByRole('note').last()).toContainText('2 persyaratan kompetensi menunggu validasi HR')

  await cloud.getByRole('button', { name: 'Validasi Arsitektur public cloud' }).click()
  await expect(panel.getByRole('status')).toContainText('divalidasi')
  expect(sent).toContainEqual({ method: 'PATCH', path: '/requirements/r-1', body: { status: 'validated' } })

  await vision.getByRole('button', { name: 'Tambah persyaratan kompetensi' }).click()
  await vision.getByLabel('Nama').fill('Keamanan cloud')
  await vision.getByLabel('Target').fill('85')
  await vision.getByRole('button', { name: 'Simpan' }).click()
  expect(sent).toContainEqual({ method: 'POST', path: '/sources/s-1/requirements', body: { name: 'Keamanan cloud', definition: null, targetScore: 85, actualScore: null } })
})

test('HR: tab Corporate Values menampilkan laporan program agregat dan gap per nilai, tanpa data per orang', async ({ page }) => {
  await loginAs(page)
  await page.goto('/cc?tab=val')
  const program = page.getByTestId('cc-program')
  await expect(program.getByRole('heading', { name: "Hasil Program Elitery's DNA 5C" })).toBeVisible()
  await expect(program).toContainText('per 9 Oktober 2026')
  await expect(program).toContainText('Sumber: isian agregat HR')
  await expect(program.getByText('135', { exact: true })).toBeVisible()
  await expect(page.getByTestId('cc-status-in_progress')).toContainText('66 · 49%')
  await expect(program.getByRole('row', { name: /Asesmen akhir/ })).toContainText('48,9')
  await expect(program.getByRole('row', { name: /IT Service Delivery/ })).toContainText('45 (56%)')
  await expect(program.getByText('Temuan:')).toBeVisible()
  const values = page.getByTestId('cc-req-values')
  await expect(values.getByText('Nilai dengan gap terbesar')).toBeVisible()
  await expect(values.getByRole('progressbar', { name: 'Kesiapan Committed' })).toHaveAttribute('aria-valuenow', '75')
})

test('HR: tab Wawancara AI menugaskan pimpinan yang belum ditugaskan', async ({ page }) => {
  const sent = await loginAs(page)
  await page.goto('/cc')
  await page.getByRole('tab', { name: 'Wawancara AI' }).click()
  const panel = page.getByTestId('cc-wawancara-hr')
  await expect(panel.getByText('1 dari 3').first()).toBeVisible()
  await expect(panel.getByRole('row', { name: /Dewi Atasan/ })).toContainText('3 dari 6')
  await panel.getByLabel('Batas waktu penugasan baru').fill('2026-12-15')
  await panel.getByRole('button', { name: 'Tugaskan semua' }).click()
  await expect(panel.getByRole('status')).toHaveText('2 pimpinan ditugaskan.')
  expect(sent).toContainEqual({ method: 'POST', path: '/assignments', body: { assigneeIds: ['u-l2', 'u-l3'], dueDate: '2026-12-15', durationMinutes: 10 } })
})

test('HR: tanpa flag cca.interview tab Wawancara AI tidak ada; alamat lama /m/cca dialihkan', async ({ page }) => {
  await loginAs(page, { interview: false })
  await page.goto('/m/cca')
  await expect(page).toHaveURL(/\/cc$/)
  await expect(page.getByRole('tab')).toHaveText(['Corporate Vision & Mission', 'Corporate Values'])
})

test('atasan: melihat status tim saja dan baru bisa menugaskan setelah wawancaranya selesai', async ({ page }) => {
  const team = [{ userId: 'u-a', name: 'Karyawan A', jobRoleName: 'Engineer', status: 'completed' }, { userId: 'u-b', name: 'Karyawan B', jobRoleName: 'Engineer', status: 'none' }]
  const sent = await loginAs(page, { role: 'supervisor', assignments: { role: 'leader', mine: { leader: assignment('leader', 'completed'), employee: null }, canAssign: true, team } })
  await nav(page).getByRole('link', { name: 'Wawancara AI' }).click()
  await expect(page.getByTestId('cc-wawancara-pimpinan')).toContainText('Selesai')
  await expect(page.getByRole('row', { name: /Karyawan A/ })).toContainText('Selesai')
  await expect(page.getByText('Atasan hanya melihat status tim.')).toBeVisible()
  await page.getByRole('button', { name: 'Tugaskan Karyawan B' }).click()
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0]).toMatchObject({ method: 'POST', path: '/assignments', body: { assigneeIds: ['u-b'] } })
})

test('atasan yang belum selesai diwawancarai tidak bisa menugaskan', async ({ page }) => {
  const team = [{ userId: 'u-b', name: 'Karyawan B', jobRoleName: null, status: 'none' }]
  await loginAs(page, { role: 'supervisor', assignments: { role: 'leader', mine: { leader: assignment('leader', 'assigned'), employee: null }, canAssign: false, team } })
  await page.goto('/aiv')
  await expect(page.getByText('Selesaikan wawancara pimpinan Anda dulu')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tugaskan Karyawan B' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Tugaskan semua' })).toHaveCount(0)
})

test('karyawan: melihat penugasannya sendiri; flag mati menampilkan catatan', async ({ page }) => {
  await loginAs(page, { role: 'learner', assignments: { role: 'employee', mine: { leader: null, employee: assignment('employee', 'assigned') } } })
  await nav(page).getByRole('link', { name: 'Wawancara visi & nilai' }).click()
  const card = page.getByTestId('cc-wawancara-karyawan')
  await expect(card).toContainText('Ditugaskan')
  await expect(card).toContainText('Batas waktu 30 November 2026')
  await expect(card).toContainText('Atasan hanya melihat status selesai atau belum.')
})

test('karyawan: wawancara belum diaktifkan', async ({ page }) => {
  await loginAs(page, { role: 'learner', featureDisabled: true })
  await page.goto('/aiv')
  await expect(page.getByText('Wawancara AI Core Competencies belum diaktifkan untuk organisasi Anda.')).toBeVisible()
})
