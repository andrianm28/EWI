import { test, expect, type Page, type Route } from '@playwright/test'

// B14 Learning Delivery: Ringkasan, Sedang berjalan, Akan datang, Pelatihan offline. API di-mock.
// Spek: docs/designs/b14-learning-delivery.md.
const base = {
  vendorName: null, venue: null, sessionCount: 1, sessionsDone: 0, status: 'running', materialsReady: false, assessmentMode: 'none', assessmentRef: null,
  assessmentStatus: 'none', moduleCode: null, moduleName: null, programTier: null, participants: 0, completed: 0, present: 0, attendanceRecorded: 0, scored: 0,
  checks: [{ key: 'schedule', ok: true }, { key: 'materials', ok: true }, { key: 'participants', ok: true }, { key: 'assessment', ok: true }],
}
const ONLINE = { ...base, id: 't-1', title: 'ITIL Foundation', mode: 'online', source: 'lms', startsOn: '2026-11-01', endsOn: '2026-11-10', participants: 4, completed: 1, group: 'running', progressPct: 40, health: 'late' }
const OFFLINE = {
  ...base, id: 't-2', title: 'Workshop RCA', mode: 'offline', source: 'manual', vendorName: 'Mahaka Institute', venue: null, startsOn: '2026-11-25', endsOn: '2026-11-25',
  status: 'scheduled', group: 'upcoming', progressPct: 0, health: 'watch', participants: 2,
  checks: [{ key: 'schedule', ok: false }, { key: 'materials', ok: false }, { key: 'participants', ok: true }, { key: 'assessment', ok: false }],
}
const people: { userId: string; name: string; email: string; jobRoleName: string; status: string; attendance: boolean | null; score: number | null; scoreSource: string | null }[] = [
  { userId: 'u-d', name: 'Dimas', email: 'dimas@demo.test', jobRoleName: 'Engineer', status: 'enrolled', attendance: null, score: null, scoreSource: null },
  { userId: 'u-r', name: 'Rina', email: 'rina@demo.test', jobRoleName: 'Engineer', status: 'enrolled', attendance: null, score: null, scoreSource: null },
]

async function setup(page: Page, calls: { method: string; url: string; body: unknown }[] = []) {
  const user = { id: 'u-1', tenantId: 't-1', email: 'hr@demo.test', role: 'hr_admin' }
  await page.route('**/api/auth/tenants', (r) => r.fulfill({ json: { data: [] } }))
  // PK-16: form kata sandi hanya tampil bila API mengizinkan (dev/staging)
  await page.route('**/api/auth/methods', (r) => r.fulfill({ json: { password: true, emailLink: true } }))
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token: 't', user } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: ['dna', 'tna'], products: ['full_suite'], flags: { 'module.dna': true, 'module.tna': true, 'module.ld': true } } }))
  await page.route(/\/api\/(dna|tna)\//, (r) => r.fulfill({ json: { data: [] } }))
  const created: Record<string, unknown>[] = []
  let detail = {
    ...OFFLINE, participantList: people.map((p) => ({ ...p })), documents: [] as Record<string, unknown>[], storageReady: true,
    readiness: [{ key: 'schedule', state: 'missing' }, { key: 'materials', state: 'missing' }, { key: 'participants', state: 'complete' }, { key: 'attendance', state: 'missing' },
      { key: 'assessment', state: 'missing' }, { key: 'documentation', state: 'missing', optional: true }],
  }
  await page.route(/\/api\/ld\//, async (r: Route) => {
    const req = r.request(); const url = new URL(req.url()); const path = url.pathname.replace(/^.*\/api\/ld/, '')
    const body = req.postData() && req.headers()['content-type']?.includes('json') ? JSON.parse(req.postData()!) : null
    calls.push({ method: req.method(), url: `${path}${url.search}`, body })
    if (path === '/dashboard') {
      return r.fulfill({ json: { data: {
        kpis: { running: 1, online: 1, offline: 0, upcoming: 1, activeLearners: 3, avgProgress: 40, attention: 2 }, generatedBy: 'rules',
        insights: [{ key: 'late:t-1', trainingId: 't-1', title: 'ITIL Foundation tertinggal dari jadwal', detail: '3 dari 4 peserta belum selesai.', source: 'LMS klien' }],
        actions: [{ key: 'remind:t-1', trainingId: 't-1', kind: 'remind', title: 'Kirim pengingat ke 3 peserta ITIL Foundation', detail: 'Batas sudah lewat' },
          { key: 'open_training:t-2', trainingId: 't-2', kind: 'open_training', title: 'Siapkan asesmen Workshop RCA', detail: 'Pilih cara asesmen' }],
      } } })
    }
    if (path === '/trainings' && req.method() === 'GET') return r.fulfill({ json: { data: [ONLINE, OFFLINE, ...created] } })
    if (path === '/options') return r.fulfill({ json: { data: { vendorName: 'Mahaka Institute', storageReady: true, webhookSync: false, jobRoles: [{ id: 'jr-1', name: 'Engineer', people: 2 }], employees: [{ id: 'u-s', name: 'Sari', email: 's@demo.test', jobRoleName: null }] } } })
    if (path === '/trainings' && req.method() === 'POST') { const t = { ...OFFLINE, id: 't-3', title: body.title }; created.push(t); return r.fulfill({ status: 201, json: { data: t } }) }
    if (path === '/trainings/t-1' && req.method() === 'PATCH') return r.fulfill({ json: { data: ONLINE } })
    if (path === '/trainings/t-1/reminders') return r.fulfill({ status: 201, json: { data: { recipients: 3, sent: 3, failed: 0 } } })
    if (path.startsWith('/trainings/t-2') || path.startsWith('/trainings/t-3')) {
      if (path.endsWith('/attendance')) detail = { ...detail, participantList: detail.participantList.map((p) => ({ ...p, attendance: true })) }
      if (path.endsWith('/assessment')) detail = { ...detail, assessmentMode: body.mode, assessmentStatus: 'manual_pending' }
      if (path.endsWith('/scores')) detail = { ...detail, assessmentStatus: 'manual' }
      if (path.endsWith('/documents')) { detail = { ...detail, documents: [{ id: 'doc-1', kind: 'photo', filename: 'sesi.png', mime: 'image/png', sizeBytes: 2048, createdAt: '' }] }; return r.fulfill({ status: 201, json: { data: detail.documents[0] } }) }
      return r.fulfill({ json: { data: path.match(/t-3$/) ? { ...detail, id: 't-3', title: 'Kelas Komunikasi' } : detail } })
    }
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

test('Ringkasan: KPI, insight berbasis aturan, dan pengingat dari saran tindakan', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, calls)
  await nav(page).getByRole('link', { name: 'Learning Delivery' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Learning Delivery' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Insight', exact: true })).toBeVisible()
  await expect(page.getByText('bukan oleh AI')).toBeVisible()
  await expect(page.getByText('ITIL Foundation tertinggal dari jadwal')).toBeVisible()
  await page.getByRole('button', { name: 'Kirim pengingat' }).click()
  await expect(page.getByTestId('info')).toHaveText('Pengingat dikirim ke 3 dari 3 peserta.')
  expect(calls.some((c) => c.method === 'POST' && c.url === '/trainings/t-1/reminders')).toBe(true)
})

test('Sedang berjalan dan Akan datang: filter jenis, status, dan cek kesiapan', async ({ page }) => {
  await setup(page)
  await page.goto('/ld')
  await page.getByRole('tab', { name: 'Sedang berjalan' }).click()
  const table = page.getByRole('table', { name: 'Pelatihan yang sedang berjalan' })
  await expect(table.getByRole('row').nth(1)).toContainText('ITIL Foundation')
  await expect(table).toContainText('Terlambat')
  await expect(table).toContainText('LMS klien')
  const dates = page.getByRole('region', { name: 'Atur tanggal pelatihan online' })
  await dates.getByLabel('Pelatihan').selectOption('t-1')
  await dates.getByLabel('Batas').fill('2026-12-20')
  await dates.getByRole('button', { name: 'Simpan tanggal' }).click()
  await expect(page.getByTestId('info')).toHaveText('Tanggal pelatihan disimpan.')
  await page.getByRole('group', { name: 'Jenis' }).getByRole('button', { name: 'Offline' }).click()
  await expect(table).toContainText('Belum ada pelatihan yang berjalan.')

  await page.getByRole('tab', { name: 'Akan datang' }).click()
  const soon = page.getByRole('table', { name: 'Pelatihan yang akan datang' })
  await expect(soon).toContainText('Workshop RCA')
  await expect(soon).toContainText('Asesmen belum siap')
  await soon.getByRole('button', { name: 'Lengkapi' }).click()
  await expect(page.getByRole('tab', { name: 'Pelatihan offline' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('detail-pelatihan')).toContainText('Workshop RCA')
})

test('Pelatihan offline: validasi form, kehadiran, asesmen dari vendor, skor, dan dokumentasi', async ({ page }) => {
  const calls: { method: string; url: string; body: unknown }[] = []
  await setup(page, calls)
  await page.goto('/ld')
  await page.getByRole('tab', { name: 'Pelatihan offline' }).click()
  await page.getByRole('button', { name: 'Tambahkan' }).click()
  await expect(page.getByRole('alert')).toContainText('Isi judul pelatihan')
  await expect(page.locator('#ld-vendor')).toHaveValue('Mahaka Institute')
  await page.locator('#ld-judul').fill('Kelas Komunikasi')
  await page.getByLabel('Tanggal', { exact: true }).fill('2026-12-01')
  await page.getByRole('button', { name: 'Tambahkan' }).click()
  await expect.poll(() => calls.find((c) => c.method === 'POST' && c.url === '/trainings')?.body).toMatchObject({ title: 'Kelas Komunikasi', startsOn: '2026-12-01', vendorName: 'Mahaka Institute' })

  await page.getByRole('button', { name: /Workshop RCA/ }).click()
  const d = page.getByTestId('detail-pelatihan')
  await expect(d).toContainText('Daftar kehadiran: belum lengkap')
  // sinkron EliteMentor mati: pilihan skor dari EliteMentor terkunci
  await expect(page.getByRole('button', { name: 'Ambil skor dari EliteMentor' })).toBeDisabled()
  await d.getByText('Ubah jadwal dan data pelatihan').click()
  await page.locator('#ld-ubah-tempat').fill('Ruang Rajawali')
  await page.getByRole('button', { name: 'Simpan data pelatihan' }).click()
  await expect.poll(() => calls.find((c) => c.method === 'PATCH' && c.url === '/trainings/t-2')?.body).toMatchObject({ venue: 'Ruang Rajawali', title: 'Workshop RCA' })
  await page.getByRole('button', { name: 'Catat semua hadir' }).click()
  await expect(d.getByRole('table')).toContainText('Hadir')
  await page.getByRole('button', { name: 'Input skor dari vendor' }).click()
  await expect(d).toContainText('Input skor dari vendor, belum lengkap')
  await page.getByLabel('Skor Dimas').fill('80')
  await page.getByLabel('Skor Rina').fill('75.5')
  await page.getByRole('button', { name: 'Simpan skor' }).click()
  await expect(d).toContainText('Skor dari vendor sudah lengkap')
  expect(calls.find((c) => c.url.endsWith('/scores'))?.body).toEqual({ entries: [{ userId: 'u-d', score: 80 }, { userId: 'u-r', score: 75.5 }] })

  await page.getByLabel('Unggah foto, video, atau materi').setInputFiles({ name: 'sesi.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) })
  await expect(d.getByRole('list', { name: 'Berkas dokumentasi' })).toContainText('sesi.png')
  expect(calls.find((c) => c.url.includes('/documents'))?.url).toContain('kind=photo&filename=sesi.png')
  await expect(page.getByText('hanya bisa dibuka oleh HR')).toBeVisible()
})

test('Learning Delivery tidak tampil dan tidak bisa dibuka bila tenant tidak punya full_suite, walau flag menyala', async ({ page }) => {
  await setup(page)
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: ['dna', 'tna'], products: ['dna', 'tna'], flags: { 'module.dna': true, 'module.tna': true, 'module.ld': true } } }))
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('button', { name: 'Learning Delivery' })).toHaveCount(0)
  await page.goto('/ld')
  await expect(page).toHaveURL(/\/$/)
})
