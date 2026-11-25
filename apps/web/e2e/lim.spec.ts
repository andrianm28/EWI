import { test, expect, type Page, type Route } from '@playwright/test'

// B15 Learning Impact Measurement: empat tab mockup Pak Eji (Ringkasan, Per kompetensi, Dampak bisnis, Pengukuran AI),
// formulir rencana, dan tampilan atasan. API di-mock. Spek: docs/designs/b15-impact-measurement.md bagian 3 dan 12.
const PLAN = {
  id: 'p-1', title: 'Pilot L1', jobRoleId: 'jr-1', jobRoleName: 'Engineer Service Delivery', periodFrom: '2026-09-01', periodUntil: null,
  businessProblem: 'Penyelesaian insiden P1 lambat', desiredBehavior: 'Engineer menganalisis akar masalah', priorityCapabilities: 'RCA dan Ticket Life Cycle',
  evidencePlan: 'Skor asesmen, wawancara ulang AI, review atasan', existingMetrics: 'MTTR P1, SLA', baselineLabel: 'Sep 2026', afterLabel: 'Nov 2026',
  status: 'active', valueEstimate: null, factors: [], modules: [{ id: 'm-1', title: 'RCA', code: 'ST-A2' }],
}
const OVERVIEW = {
  plan: PLAN, participants: 6, generatedBy: 'rules',
  chain: [
    { level: 1, key: 'activity', label: 'Aktivitas', source: 'Learning Delivery', finding: '5 dari 6 keikutsertaan selesai (83%)', coverage: 'measured' },
    { level: 2, key: 'learning', label: 'Pembelajaran', source: 'Asesmen pre dan post', finding: 'Naik rata-rata 16 poin pada 3 kompetensi', coverage: 'measured' },
    { level: 3, key: 'capability', label: 'Kapabilitas', source: 'Wawancara ulang AI', finding: '1 dari 6 karyawan sudah diwawancara ulang', coverage: 'partial' },
    { level: 4, key: 'application', label: 'Penerapan', source: 'Review atasan, isian kinerja', finding: '2 dari 6 karyawan punya skor kinerja', coverage: 'partial' },
    { level: 5, key: 'performance', label: 'Kinerja', source: 'Indikator kinerja tim', finding: 'MTTR P1 92 → 71 mnt', coverage: 'measured' },
    { level: 6, key: 'business', label: 'Hasil bisnis', source: 'Indikator bisnis tim', finding: 'Belum ada data', coverage: 'missing' },
  ],
  insight: { level: 3, text: 'Rantai paling lemah ada di tingkat 3. Baru 1 dari 6 karyawan yang dikonfirmasi lewat wawancara ulang.' },
  competencies: [
    { competencyId: 'k1', name: 'RCA & Post-Incident Report', pre: 52, preN: 6, post: 71, postN: 6, postUnauditable: 2, postShared: true, reinterview: 92, reinterviewN: 1, performance: 88, performanceN: 1, verdict: 'terkonfirmasi' },
    { competencyId: 'k2', name: 'Ticket Life Cycle', pre: 58, preN: 6, post: 77, postN: 6, postUnauditable: 0, postShared: false, reinterview: null, reinterviewN: 0, performance: null, performanceN: 0, verdict: 'belum_diukur' },
  ],
  indicators: [
    { id: 'i-1', name: 'MTTR insiden P1', level: 'performance', source: 'Sistem tiket', unit: 'mnt', direction: 'lower_better', baseline: 92, current: 71, target: 75, improved: true, targetMet: true, strength: 'strong', strengthSource: 'hr', position: 0 },
    { id: 'i-2', name: 'Kepuasan pelanggan', level: 'business', source: 'Belum terhubung', unit: null, direction: 'higher_better', baseline: null, current: null, target: null, improved: null, targetMet: null, strength: 'no_data', strengthSource: 'rules', position: 1 },
  ],
  valueEstimate: { label: 'Waktu teknisi dihemat', value: '±14 jam / bulan', note: '21 menit × 40 insiden' },
  factors: ['Alat monitoring baru dipasang pada Oktober 2026.'],
}
const QUEUE = [
  { userId: 'u-a', name: 'Karyawan A', competencies: [{ competencyId: 'k1', name: 'RCA & Post-Incident Report' }], postCompletedOn: '2026-10-20', dueFrom: '2026-11-17', dueUntil: '2026-12-01', status: 'none', window: 'due', scheduledOn: null, score: null },
  { userId: 'u-b', name: 'Karyawan B', competencies: [{ competencyId: 'k1', name: 'RCA & Post-Incident Report' }], postCompletedOn: '2026-09-01', dueFrom: '2026-09-29', dueUntil: '2026-10-13', status: 'done', window: null, scheduledOn: null, score: 92 },
]

interface Opts { role?: string; plans?: unknown[]; products?: string[]; overviewFails?: boolean }
async function setup(page: Page, o: Opts = {}, calls: { method: string; url: string; body: unknown }[] = []) {
  const user = { id: 'u-1', tenantId: 't-1', email: 'hr@demo.test', role: o.role ?? 'hr_admin' }
  await page.route('**/api/auth/tenants', (r) => r.fulfill({ json: { data: [] } }))
  // PK-16: form kata sandi hanya tampil bila API mengizinkan (dev/staging)
  await page.route('**/api/auth/methods', (r) => r.fulfill({ json: { password: true, emailLink: true } }))
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token: 't', user } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: ['dna', 'tna', 'lim'], products: o.products ?? ['full_suite'], flags: { 'module.dna': true, 'module.tna': true, 'module.lim': true } } }))
  await page.route(/\/api\/(dna|tna)\//, (r) => r.fulfill({ json: { data: [] } }))
  let plans = o.plans ?? [{ id: 'p-1', title: 'Pilot L1', jobRoleName: 'Engineer Service Delivery', moduleCount: 1, participantCount: 6 }]
  await page.route(/\/api\/lim\//, async (r: Route) => {
    const req = r.request(); const url = new URL(req.url()); const path = url.pathname.replace(/^.*\/api\/lim/, '')
    const body = (() => { try { return JSON.parse(req.postData() ?? 'null') } catch { return null } })()
    calls.push({ method: req.method(), url: path, body })
    if (path === '/plans' && req.method() === 'GET') return r.fulfill({ json: { data: plans } })
    if (path === '/plans' && req.method() === 'POST') { plans = [{ id: 'p-1', title: body.title, jobRoleName: null, moduleCount: 1, participantCount: 0 }]; return r.fulfill({ status: 201, json: { data: PLAN } }) }
    if (path === '/options') return r.fulfill({ json: { data: { modules: [{ id: 'm-1', code: 'ST-A2', name: 'RCA' }], jobRoles: [{ id: 'jr-1', name: 'Engineer Service Delivery' }] } } })
    if (path === '/plans/p-1/overview') return o.overviewFails ? r.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Layanan sedang sibuk' } } }) : r.fulfill({ json: { data: OVERVIEW } })
    if (path === '/plans/p-1/queue') return r.fulfill({ json: { data: QUEUE } })
    if (path === '/plans/p-1/pre-from-dna') return r.fulfill({ json: { data: { filled: 2 } } })
    if (path === '/imports/templates') return r.fulfill({ json: { data: [{ key: 'lim_measurements', label: 'Skor dampak belajar (Impact Measurement)', description: 'Skor per karyawan per kompetensi.',
      fields: [{ key: 'competencyName', header: 'Nama Kompetensi', required: false, oneOf: 'competency', help: null, example: null }],
      options: [{ key: 'planId', label: 'Rencana pengukuran', type: 'lim_plan', required: true }] }] } })
    if (path === '/imports/batches') return r.fulfill({ json: { data: [] } })
    if (path === '/imports/lim_measurements') return r.fulfill({ status: 201, json: { data: { id: 'bt-1', kind: 'lim_measurements', filename: 'skor.csv', status: 'uploaded', rowCount: 1, headers: ['Nama Kompetensi'], mapping: { competencyName: 'Nama Kompetensi' }, options: {}, result: null, createdAt: '2026-11-19T00:00:00Z', committedAt: null, createdByName: null } } })
    if (path === '/imports/batches/bt-1/preview') return r.fulfill({ json: { data: { valid: 1, rejectedCount: 0, rejected: [], sample: [] } } })
    if (path === '/plans/p-1/queue/schedule') return r.fulfill({ json: { data: { scheduled: body.userIds, skipped: [], rejected: [] } } })
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

test('HR: Ringkasan memuat lima pertanyaan, rantai 6 tingkat, dan insight berbasis aturan', async ({ page }) => {
  await setup(page)
  await nav(page).getByRole('link', { name: 'Learning Impact Measurement' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Learning Impact Measurement' })).toBeVisible()
  await expect(page.getByText('Mulai dari masalah bisnis · Engineer Service Delivery')).toBeVisible()
  await expect(page.getByText('Penyelesaian insiden P1 lambat')).toBeVisible()
  const chain = page.getByRole('table', { name: 'Rantai dampak enam tingkat' })
  await expect(chain.getByRole('row')).toHaveCount(7)
  await expect(chain).toContainText('1 dari 6 karyawan sudah diwawancara ulang')
  await expect(chain).toContainText('Sebagian')
  await expect(chain).toContainText('Belum ada data')
  await expect(page.getByTestId('insight')).toContainText('tingkat 3')
  await expect(page.getByTestId('insight')).toContainText('dari data pengukuran')
  await expect(page.getByText('bukan bukti sebab-akibat')).toBeVisible()
})

test('HR: Per kompetensi dan Dampak bisnis', async ({ page }) => {
  await setup(page)
  await page.goto('/lim')
  await page.getByRole('tab', { name: 'Per kompetensi' }).click()
  const comp = page.getByRole('table', { name: 'Kompetensi sampai kinerja' })
  await expect(comp).toContainText('RCA & Post-Incident Report')
  await expect(comp).toContainText('Terkonfirmasi')
  await expect(comp).toContainText('Belum diukur')
  await expect(comp).toContainText('skor modul, bukan per kompetensi')
  await page.getByRole('tab', { name: 'Dampak bisnis' }).click()
  const biz = page.getByRole('table', { name: 'Indikator bisnis tim' })
  await expect(biz).toContainText('92 mnt')
  await expect(biz).toContainText('≤ 75 mnt')
  await expect(biz).toContainText('Indikasi kuat')
  await expect(biz).toContainText('Belum ada data')
  await expect(page.getByText('Estimasi nilai (ilustratif)')).toBeVisible()
  await expect(page.getByText('±14 jam / bulan')).toBeVisible()
  await expect(page.getByText('Alat monitoring baru dipasang pada Oktober 2026.')).toBeVisible()
})

test('HR: Pengukuran AI menjadwalkan wawancara ulang per karyawan', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, {}, calls)
  await page.goto('/lim')
  await page.getByRole('tab', { name: 'Pengukuran AI' }).click()
  const q = page.getByRole('table', { name: 'Antrean wawancara ulang' })
  await expect(q).toContainText('Karyawan A')
  await expect(q).toContainText('Belum dijadwalkan')
  await expect(q).toContainText('Selesai')
  await page.getByLabel('Tanggal wawancara ulang').fill('2026-11-25')
  await q.getByRole('button', { name: 'Jadwalkan Karyawan A' }).click()
  await expect.poll(() => calls.find((c) => c.url === '/plans/p-1/queue/schedule')?.body).toEqual({ userIds: ['u-a'], date: '2026-11-25' })
  await expect(page.getByTestId('info')).toContainText('1 karyawan dijadwalkan')
})

test('paritas mockup 12.9: peserta di baris rencana, n= dan sumber di tooltip, kartu agen dan catatan Pengukuran AI', async ({ page }) => {
  await setup(page)
  await page.goto('/lim')
  // LIM-4: jumlah peserta di baris rencana, bukan di catatan rantai
  await expect(page.getByText('Rencana: Pilot L1 · 6 peserta')).toBeVisible()
  await expect(page.getByText('Peserta terhitung')).toHaveCount(0)
  // LIM-2: pemilih rencana dan "Rencana baru" di kanan baris tab, tidak menggeser tab ke bawah
  const tabbar = page.getByTestId('lim-tabbar')
  await expect(tabbar.getByRole('tablist')).toBeVisible()
  await expect(tabbar.getByRole('button', { name: 'Rencana baru' })).toBeVisible()
  // urutan DOM (tidak bergantung viewport): tab lebih dulu, lalu pemilih rencana
  await expect(tabbar.locator(':scope > :nth-child(1)')).toHaveAttribute('role', 'tablist')
  await expect(tabbar.locator(':scope > :nth-child(2)')).toContainText('Rencana baru')
  // LIM-10: n= dan sumber kekuatan bukti pindah ke tooltip; kartu isian HR dilipat
  await page.getByRole('tab', { name: 'Per kompetensi' }).click()
  const comp = page.getByRole('table', { name: 'Kompetensi sampai kinerja' })
  await expect(comp).not.toContainText('n=')
  await expect(comp.getByTitle('Rata-rata dari 6 orang').first()).toBeVisible()
  // tooltip bisa dicapai papan ketik (review egm P2)
  await expect(comp.getByTitle('Rata-rata dari 6 orang').first()).toHaveAttribute('tabindex', '0')
  await expect(page.getByRole('button', { name: 'Isi pre dari asesmen DNA' })).toBeHidden()
  await page.getByRole('tab', { name: 'Dampak bisnis' }).click()
  const biz = page.getByRole('table', { name: 'Indikator bisnis tim' })
  // sumber hanya di tooltip dan teks pembaca layar, tidak tampil sebagai teks (review egm P1)
  await expect(biz.getByTitle('Kekuatan bukti dinilai HR')).toBeVisible()
  await expect(biz.getByTitle('Kekuatan bukti dinilai HR')).toHaveAttribute('tabindex', '0')
  await expect(biz.locator('.el-sr-only', { hasText: 'kekuatan bukti dinilai HR' })).toHaveCount(1)
  await expect(biz.locator('.el-sr-only', { hasText: 'kekuatan bukti dihitung aturan' })).toHaveCount(1)
  // LIM-5 dan LIM-7: kartu agen dan catatan mockup
  await page.getByRole('tab', { name: 'Pengukuran AI' }).click()
  await expect(page.getByRole('heading', { name: 'Agen AI · Pengukuran dampak' })).toBeVisible()
  await expect(page.getByText('AI mewawancarai ulang karyawan beberapa pekan setelah belajar untuk memastikan hasil belajar bertahan, membandingkannya dengan kinerja kerja, lalu menghubungkannya ke hasil bisnis tim.')).toBeVisible()
  await expect(page.getByText('Wawancara ulang dijadwalkan 4 sampai 6 pekan setelah belajar. Karyawan mengerjakannya sendiri dari menu Wawancara ulang setelah dijadwalkan.')).toBeVisible()
})

test('ringkasan gagal dimuat: pemilih rencana dan "Rencana baru" tetap ada (review egm P2)', async ({ page }) => {
  await setup(page, { overviewFails: true })
  await page.goto('/lim')
  await expect(page.getByTestId('galat')).toContainText('Layanan sedang sibuk')
  await expect(page.getByRole('tablist')).toHaveCount(0)
  await expect(page.getByText('Rencana: Pilot L1 · 6 peserta')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rencana baru' })).toBeVisible()
})

test('HR: isi pre dari asesmen DNA dan impor skor untuk rencana yang sedang dibuka', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, {}, calls)
  await page.goto('/lim')
  await page.getByRole('tab', { name: 'Per kompetensi' }).click()
  await page.getByText('Isi data pengukuran (HR)').click()
  await page.getByRole('button', { name: 'Isi pre dari asesmen DNA' }).click()
  await expect(page.getByTestId('info')).toContainText('2 skor pre diisi dari asesmen DNA (level × 25)')
  expect(calls.some((c) => c.method === 'POST' && c.url === '/plans/p-1/pre-from-dna')).toBe(true)
  const panel = page.getByTestId('import-panel')
  await panel.getByLabel('File (.xlsx atau .csv)').setInputFiles({ name: 'skor.csv', mimeType: 'text/csv', buffer: Buffer.from('Nama Kompetensi\nRCA') })
  await expect(panel.getByLabel('Rencana pengukuran *')).toHaveValue('p-1')
  await panel.getByRole('button', { name: 'Periksa' }).click()
  await expect.poll(() => (calls.find((c) => c.url === '/imports/batches/bt-1/preview')?.body as { options?: unknown })?.options).toEqual({ planId: 'p-1' })
})

test('atasan tidak melihat tombol isian HR', async ({ page }) => {
  await setup(page, { role: 'supervisor' })
  await page.goto('/lim')
  await page.getByRole('tab', { name: 'Per kompetensi' }).click()
  await expect(page.getByRole('table', { name: 'Kompetensi sampai kinerja' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Isi pre dari asesmen DNA' })).toHaveCount(0)
  await expect(page.getByTestId('import-panel')).toHaveCount(0)
})

test('HR tanpa rencana: membuat rencana dari formulir', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, { plans: [] }, calls)
  await page.goto('/lim')
  await page.getByRole('button', { name: 'Buat rencana' }).click()
  await expect(page.getByRole('alert')).toContainText('Isi judul rencana')
  await page.getByLabel('Judul rencana').fill('Pilot L1')
  await page.getByLabel('Jabatan').selectOption('jr-1')
  await page.getByLabel('ST-A2 · RCA').check()
  await page.getByLabel('Masalah bisnis').fill('Penyelesaian insiden P1 lambat')
  await page.getByRole('button', { name: 'Buat rencana' }).click()
  await expect.poll(() => calls.find((c) => c.method === 'POST' && c.url === '/plans')?.body).toMatchObject({ title: 'Pilot L1', jobRoleId: 'jr-1', moduleIds: ['m-1'], businessProblem: 'Penyelesaian insiden P1 lambat' })
  await expect(page.getByText('Mulai dari masalah bisnis · Engineer Service Delivery')).toBeVisible()
})

test('atasan: ringkasan timnya; antrean tidak dibuka', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, { role: 'supervisor' }, calls)
  await page.goto('/lim')
  await expect(page.getByRole('table', { name: 'Rantai dampak enam tingkat' })).toBeVisible()
  await page.getByRole('tab', { name: 'Pengukuran AI' }).click()
  await expect(page.getByText('Antrean wawancara ulang dikelola HR')).toBeVisible()
  expect(calls.some((c) => c.url.endsWith('/queue'))).toBe(false)
})

test('tenant tanpa paket full_suite tidak melihat menu', async ({ page }) => {
  await setup(page, { products: ['dna', 'tna'] })
  await expect(nav(page).getByRole('link', { name: 'Learning Impact Measurement' })).toHaveCount(0)
})
