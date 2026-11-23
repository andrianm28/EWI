import { test, expect, type Page } from '@playwright/test'
import { loginSebagai } from './support/sesi'
import { mockApi, cocok } from './support/api'

// B16 Career & Promotion (spek: docs/designs/b16-career-promotion.md). API di-mock lewat support/ (B18 4.2);
// alur yang sama terhadap API sungguhan: apps/api/tests/integration/alur-promosi.test.js.
const B16 = { flags: { 'promotion.recommendation': true } }
const progs = (n: number) => ['basic', 'intermediate', 'advanced'].map((tier, i) => ({ tier, passed: i < n }))
const MAP = {
  okrMin: 80, kpi: { employees: 3, divisions: 2, eligible: 1, awaitingDecision: 1, belowCurrent: 1 }, divisions: ['IT', 'Sales'],
  employees: [
    { id: 'e1', name: 'Ani', division: 'IT', jobRoleId: 'jr1', jobRoleName: 'Engineer', level: { id: 'l1', name: 'Junior' }, programs: progs(2), okr: { achievement: 92.5, period: '2026-11', count: 2 }, status: 'eligible', nextLevel: { id: 'l2', name: 'Senior', requiredProgramTier: 'intermediate' }, decisionState: 'none' },
    { id: 'e2', name: 'Budi', division: 'IT', jobRoleId: 'jr1', jobRoleName: 'Engineer', level: { id: 'l1', name: 'Junior' }, programs: progs(0), okr: null, status: 'below_current', nextLevel: { id: 'l2', name: 'Senior', requiredProgramTier: 'intermediate' }, decisionState: 'none' },
    { id: 'e3', name: 'Cici', division: 'Sales', jobRoleId: 'jr2', jobRoleName: 'Account', level: { id: 'l9', name: 'Staf' }, programs: progs(2), okr: { achievement: 79.5, period: '2026-11', count: 1 }, status: 'program_passed_okr_low', nextLevel: { id: 'l10', name: 'Senior' }, decisionState: 'none' },
  ],
}
const decision = (o: Record<string, unknown> = {}) => ({
  employee: { id: 'e1', name: 'Ani', division: 'IT', jobRoleName: 'Engineer' }, fromLevel: { id: 'l1', name: 'Junior' }, toLevel: { id: 'l2', name: 'Senior' },
  requirement: { programPassed: true, okr: { achievement: 92.5, min: 80, met: true } }, eligible: true, supervisor: null, hr: null, actions: [], blockedReason: 'waiting_supervisor', ...o,
})

/** Mock API B16 lewat support/ (B18). Keputusan yang dikirim dicatat di `posts`; `sesudah` membentuk baris setelah keputusan. */
async function mockCp(page: Page, decisions: unknown[], sesudah: (aksi: string) => unknown = () => decision({
  supervisor: { decision: 'recommend', byName: 'Sari', at: '2026-11-19T09:00:00Z', note: 'Siap' }, actions: ['recommend', 'hold'], blockedReason: null,
})) {
  const posts: { path: string; body: unknown }[] = []
  let rows = decisions
  await mockApi(page, (req) => {
    const data = (d: unknown) => ({ json: { data: d } })
    if (cocok(req, 'GET /dna/career/map')) return data(MAP)
    const ev = cocok(req, 'GET /dna/career/employees/:id/evidence')
    if (ev) {
      const p = MAP.employees.find((e) => e.id === ev.id)
      if (!p) return undefined
      return data({ person: { id: p.id, name: p.name, division: p.division, jobRoleName: p.jobRoleName, level: p.level }, status: p.status, nextLevel: p.nextLevel,
        programsPassed: p.programs.filter((x) => x.passed).map((x) => x.tier), okr: p.okr ? { ...p.okr, min: 80, met: p.okr.achievement >= 80 } : null, reinterview: null, supervisorRecommendation: null })
    }
    if (cocok(req, 'GET /dna/career/paths')) return data({ jobRole: { id: 'jr1', name: 'Engineer' }, okrMin: 80, levels: [
      { id: 'l1', order: 0, name: 'Junior', requiredProgramTier: 'basic', moduleCount: 4, employees: 2, readyForNext: 1 },
      { id: 'l2', order: 1, name: 'Senior', requiredProgramTier: 'intermediate', moduleCount: 6, employees: 0, readyForNext: 0 },
    ] })
    if (cocok(req, 'GET /dna/career/decisions')) return data(rows)
    const d = cocok(req, 'POST /dna/career/decisions/:userId/:tahap')
    if (d) {
      posts.push({ path: req.path, body: req.body })
      rows = [sesudah((req.body as { decision: string }).decision)]
      return data(rows[0])
    }
    return undefined
  })
  return posts
}

test('HR: peta per divisi, bukti, jalur jenjang, dan keputusan menunggu atasan', async ({ page }) => {
  await mockCp(page, [decision()])
  await loginSebagai(page, 'hr', B16)
  await page.goto('/cp')
  await expect(page.getByRole('heading', { level: 1, name: 'Career & Promotion' })).toBeVisible()
  const map = page.getByTestId('cp-map')
  await expect(map).toContainText('Memenuhi syarat Senior')
  await expect(map).toContainText('Belum memenuhi kompetensi jabatan')
  await expect(map).toContainText('Program lulus, OKR belum 80%')
  await expect(map).toContainText('OKR 79%') // pembulatan tidak menyeberangi ambang
  await expect(page.getByTestId('cp-evidence')).toContainText('Bukti untuk Ani')
  await expect(page.getByTestId('cp-evidence')).toContainText('93% (ambang 80%) · terpenuhi')
  await page.getByRole('group', { name: 'Divisi' }).getByRole('button', { name: 'Sales' }).click()
  await expect(map.getByRole('table')).not.toContainText('Ani')
  await page.getByRole('button', { name: 'Bukti Cici' }).click()
  await expect(page.getByTestId('cp-evidence')).toContainText('Bukti untuk Cici')

  await page.getByRole('tab', { name: 'Jalur jenjang' }).click()
  await expect(page.getByTestId('cp-path')).toContainText('lulus program Basic (4 modul)')
  await expect(page.getByTestId('cp-path')).toContainText('Naik ke Senior: lulus program Intermediate dan OKR ≥ 80%')
  await expect(page.getByTestId('cp-path')).toContainText('Jenjang tertinggi pada jalur ini.')
  await page.getByRole('tab', { name: 'Keputusan promosi' }).click()
  await expect(page.getByTestId('cp-dec')).toContainText('Junior → Senior')
  await expect(page.getByTestId('cp-dec')).toContainText('Menunggu atasan')
  await expect(page.getByTestId('cp-dec').getByRole('button', { name: /Setujui/ })).toHaveCount(0)
})

test('Atasan merekomendasikan dengan catatan; keputusan tercatat dengan nama', async ({ page }) => {
  const posts = await mockCp(page, [decision({ actions: ['recommend', 'hold'], blockedReason: null })])
  await loginSebagai(page, 'atasan', B16)
  await page.goto('/cp')
  await page.getByRole('tab', { name: 'Keputusan promosi' }).click()
  await page.getByLabel('Catatan untuk Ani').fill('Siap')
  await page.getByRole('button', { name: 'Rekomendasikan Ani' }).click()
  await expect(page.getByTestId('cp-dec').getByRole('status')).toHaveText('Rekomendasikan: Ani tercatat.')
  expect(posts).toHaveLength(1)
  expect(posts[0]!.path).toBe('/dna/career/decisions/e1/supervisor')
  expect(posts[0]!.body).toEqual({ decision: 'recommend', note: 'Siap' })
  await expect(page.getByTestId('cp-dec')).toContainText('Sari')
  await expect(page.getByTestId('cp-dec')).toContainText('Merekomendasikan')
})

test('HR yang mencatat rekomendasi itu sendiri tidak mendapat tombol keputusan', async ({ page }) => {
  await mockCp(page, [decision({ supervisor: { decision: 'recommend', byName: 'Rina', at: '2026-11-19T09:00:00Z', note: null }, actions: [], blockedReason: 'self_recommended' })])
  await loginSebagai(page, 'hr', B16)
  await page.goto('/cp')
  await page.getByRole('tab', { name: 'Keputusan promosi' }).click()
  await expect(page.getByTestId('cp-dec')).toContainText('Anda yang merekomendasi')
  await expect(page.getByRole('button', { name: 'Setujui Ani' })).toHaveCount(0)
})

test('Menu dan rute tertutup bila flag promotion.recommendation mati', async ({ page }) => {
  await loginSebagai(page, 'hr', { flags: { 'promotion.recommendation': false } })
  await page.goto('/cp')
  await expect(page.getByRole('heading', { level: 1, name: 'Career & Promotion' })).toHaveCount(0)
})

test('HR menyetujui rekomendasi atasan; nama HR tercatat dan tombol keputusan hilang (B18 3.3 rekomendasi promosi)', async ({ page }) => {
  const rekomendasi = { decision: 'recommend', byName: 'Sari', at: '2026-11-19T09:00:00Z', note: 'Siap' }
  const posts = await mockCp(page, [decision({ supervisor: rekomendasi, actions: ['approve', 'hold'], blockedReason: null })],
    () => decision({ supervisor: rekomendasi, hr: { decision: 'approved', byName: 'Pengguna Contoh', at: '2026-11-19T10:00:00Z', note: null }, actions: [], blockedReason: 'approved' }))
  await loginSebagai(page, 'hr', B16)
  await page.goto('/cp')
  await page.getByRole('tab', { name: 'Keputusan promosi' }).click()
  await page.getByRole('button', { name: 'Setujui Ani' }).click()
  await expect(page.getByTestId('cp-dec').getByRole('status')).toHaveText('Setujui: Ani tercatat.')
  expect(posts).toEqual([{ path: '/dna/career/decisions/e1/hr', body: { decision: 'approve' } }])
  await expect(page.getByTestId('cp-dec')).toContainText('Disetujui')
  await expect(page.getByTestId('cp-dec')).toContainText('Pengguna Contoh')
  await expect(page.getByRole('button', { name: 'Setujui Ani' })).toHaveCount(0)
})
