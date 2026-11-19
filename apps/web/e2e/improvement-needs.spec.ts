import { test, expect, type Page, type Route } from '@playwright/test'

// B9 Improvement Needs: layar HR, atasan, pimpinan, dan verifikasi oleh pemilik tindakan. API di-mock.
// Spek: docs/designs/b9-improvement-needs.md.
const FLAGS = { 'module.dna': true, 'module.tna': true, 'module.ina': true, 'ina.dashboard': true, 'ina.ai_verification': true }

const ACTIONS = [
  { id: 'a-1', title: 'Perbarui SOP eskalasi insiden', category: 'sop', subLabel: null, ownerUserId: 'u-2', ownerName: 'Karyawan A', ownerJobRoleName: 'Engineer L1', sourceRef: 'ST-A2', dueDate: '2026-11-01', status: 'new', overdue: true, lastVerification: null, findingId: null, involvesIndividual: false },
  { id: 'a-2', title: 'Forum umpan balik bulanan', category: 'budaya', subLabel: null, ownerUserId: null, ownerName: null, ownerJobRoleName: null, sourceRef: null, dueDate: null, status: 'in_progress', overdue: false, lastVerification: null, findingId: null, involvesIndividual: false },
]
const KPIS = { total: 2, done: 0, process: 1, culture: 1, overdue: 1 }

async function login(page: Page, role: string, flags: Record<string, boolean> = FLAGS) {
  const user = { id: role === 'learner' ? 'u-2' : 'u-1', tenantId: 't-1', email: `${role}@demo.test`, role }
  await page.route('**/api/auth/tenants', (r) => r.fulfill({ json: { data: [] } }))
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token: 't', user } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: ['dna', 'tna', 'ina'], flags } }))
  await page.route(/\/api\/(dna|tna)\//, (r) => r.fulfill({ json: { data: [] } }))
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(`pw-${Date.now()}`)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigasi utama' })
const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, json: body })

test('HR: KPI, tabel tindakan, ubah status, tambah tindakan, dan akses atasan', async ({ page }) => {
  let actions = structuredClone(ACTIONS)
  const sent: Record<string, unknown>[] = []
  let granted = false
  await page.route('**/api/ina/**', async (r) => {
    const url = new URL(r.request().url())
    const method = r.request().method()
    const path = url.pathname.replace(/^.*\/api\/ina/, '')
    if (path === '/access/me') return json(r, { data: { level: 'manage', pendingVerifications: 0 } })
    if (path === '/actions' && method === 'GET') return json(r, { data: actions, kpis: KPIS, meta: { level: 'manage', hiddenIndividual: 1 } })
    if (path === '/actions' && method === 'POST') {
      const body = r.request().postDataJSON()
      sent.push(body)
      actions = [...actions, { ...ACTIONS[1], id: 'a-3', ...body, ownerName: 'Karyawan A', status: 'new' }]
      return json(r, { data: actions[2] }, 201)
    }
    if (path === '/actions/a-1' && method === 'PATCH') {
      const body = r.request().postDataJSON()
      sent.push(body)
      actions = actions.map((a) => (a.id === 'a-1' ? { ...a, ...body } : a))
      return json(r, { data: actions[0] })
    }
    if (path === '/actions/a-1' && method === 'GET') {
      // detail datang terlambat: menyimpan sebelum detail termuat tidak boleh menghapusnya
      await new Promise((ok) => setTimeout(ok, 1500))
      return json(r, { data: { ...actions[0], detail: 'Detail lama yang tidak boleh hilang' } })
    }
    if (path === '/owners') return json(r, { data: [{ id: 'u-2', name: 'Karyawan A', jobRoleName: 'Engineer L1' }] })
    if (path === '/access') return json(r, { data: [{ supervisorId: 's-1', name: 'Atasan Satu', email: 'atasan@demo.test', granted, grantedAt: null, grantedByName: null }] })
    if (path === '/access/s-1' && method === 'PUT') { granted = true; return json(r, { data: { granted: true } }) }
    if (path === '/verifications') return json(r, { data: [] })
    return json(r, { error: { code: 'NOT_FOUND', message: 'tidak ada' } }, 404)
  })
  await login(page, 'hr_admin')
  await nav(page).getByRole('link', { name: 'Improvement Needs' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Improvement Needs' })).toBeVisible()

  const kpi = page.getByTestId('ina-kpi')
  await expect(kpi).toContainText('Tindakan')
  await expect(kpi).toContainText('1 lewat tenggat')
  await expect(kpi).toContainText('SOP / Alat / Sistem')
  const table = page.getByRole('table', { name: 'Tindakan perbaikan' })
  await expect(table.getByRole('row')).toHaveCount(3)
  await expect(table).toContainText('Perbarui SOP eskalasi insiden')
  await expect(table).toContainText('Lewat tenggat')
  await expect(page.getByTestId('ina-ai')).toContainText('Pilot')
  await expect(page.getByTestId('ina-tersembunyi')).toHaveText('Lihat 1 tindakan yang menyangkut individu')

  // status hanya menawarkan transisi yang sah
  const status = page.getByLabel('Status Perbarui SOP eskalasi insiden')
  await expect(status.locator('option')).toHaveText(['Baru', 'Berjalan', 'Selesai', 'Ditolak'])
  await status.selectOption('in_progress')
  await expect(page.getByTestId('ina-info')).toContainText('Berjalan')
  expect(sent[0]).toEqual({ status: 'in_progress' })

  // formulir: validasi di layar dulu
  await page.getByTestId('ina-tambah').click()
  await page.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByRole('alert')).toContainText('minimal 3 karakter')
  await page.getByLabel('Temuan atau tindakan').fill('Tambah alat pemantauan tiket')
  await page.getByLabel('Kategori').selectOption('alat')
  await page.getByLabel('Pemilik').selectOption('u-2')
  await page.getByLabel('Tenggat').fill('2026-12-15')
  await page.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByTestId('ina-info')).toHaveText('Tindakan ditambahkan.')
  expect(sent[1]).toMatchObject({ title: 'Tambah alat pemantauan tiket', category: 'alat', ownerUserId: 'u-2', dueDate: '2026-12-15', subLabel: null, involvesIndividual: false })

  // ubah sebelum detail termuat: detail tidak ikut dikirim
  await table.getByRole('row').filter({ hasText: 'Perbarui SOP eskalasi insiden' }).getByRole('button', { name: 'Ubah' }).click()
  await page.getByLabel('Temuan atau tindakan').fill('Perbarui SOP eskalasi insiden v2')
  await page.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByTestId('ina-info')).toHaveText('Tindakan diperbarui.')
  expect(sent[2]).toMatchObject({ title: 'Perbarui SOP eskalasi insiden v2' })
  expect(sent[2]).not.toHaveProperty('detail')

  // akses atasan (K1)
  const akses = page.getByTestId('ina-akses')
  await expect(akses).toContainText('Akses ini juga berlaku untuk daftar temuan di luar pelatihan')
  await akses.getByRole('button', { name: 'Beri akses' }).click()
  await expect(akses).toContainText('Punya akses')
  await expect(akses.getByRole('button', { name: 'Cabut akses' })).toBeVisible()
})

test('atasan tanpa akses melihat pesan; pimpinan hanya angka ringkasan', async ({ page }) => {
  await page.route('**/api/ina/**', (r) => {
    const path = new URL(r.request().url()).pathname
    if (path.endsWith('/access/me')) return json(r, { data: { level: null, pendingVerifications: 0 } })
    return json(r, { error: { code: 'NO_INA_ACCESS', message: 'HR belum memberi Anda akses' } }, 403)
  })
  await login(page, 'supervisor')
  await page.goto('/ina')
  await expect(page.getByTestId('ina-galat')).toContainText('HR belum memberi Anda akses ke tindakan perbaikan')
  await expect(page.getByRole('table')).toHaveCount(0)
})

test('pimpinan: hanya KPI, tanpa tabel dan tanpa tombol kelola', async ({ page }) => {
  await page.route('**/api/ina/**', (r) => {
    const path = new URL(r.request().url()).pathname
    if (path.endsWith('/access/me')) return json(r, { data: { level: 'summary', pendingVerifications: 0 } })
    return json(r, { data: [], kpis: KPIS, meta: { level: 'summary' } })
  })
  await login(page, 'pimpinan')
  await page.goto('/ina')
  await expect(page.getByTestId('ina-kpi')).toContainText('Budaya')
  await expect(page.getByText('Anda melihat angka ringkasan')).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
  await expect(page.getByTestId('ina-tambah')).toHaveCount(0)
})

test('pemilik tindakan: pengingat, persetujuan, tiga jawaban, ringkasan tanpa isi percakapan', async ({ page }) => {
  let status = 'assigned'
  const turns: { speaker: string; text: string }[] = []
  const answers: string[] = []
  const verification = () => ({
    id: 'v-1', actionId: 'a-1', actionTitle: 'Perbarui SOP eskalasi insiden', actionDueDate: null, ownerUserId: 'u-2', ownerName: 'Karyawan A',
    status, dueDate: null, assignedAt: '2026-11-19T00:00:00Z', startedAt: null, endedAt: null,
    reportedStatus: status === 'completed' ? 'blocked' : null,
    summary: status === 'completed' ? 'Pemilik melaporkan tindakan ini terhambat dan membutuhkan tindak lanjut HR.' : null, aiProvider: 'bawaan',
  })
  await page.route('**/api/ina/**', async (r) => {
    const path = new URL(r.request().url()).pathname.replace(/^.*\/api\/ina/, '')
    if (path === '/access/me') return json(r, { data: { level: null, pendingVerifications: status === 'assigned' ? 1 : 0 } })
    if (path === '/verifications/mine') return json(r, { data: [verification()] })
    if (path === '/verifications/v-1') return json(r, { data: { ...verification(), turns } })
    if (path === '/verifications/v-1/consent') {
      expect(r.request().postDataJSON()).toEqual({ consentVersion: 'ina-verifikasi-v1.0' })
      status = 'in_progress'
      turns.push({ speaker: 'ai', text: 'Pertanyaan 1: bagaimana statusnya?' })
      return json(r, { data: { ...verification(), question: turns[0].text, done: false } })
    }
    if (path === '/verifications/v-1/turns') {
      const { text } = r.request().postDataJSON()
      answers.push(text)
      turns.push({ speaker: 'human', text })
      if (answers.length === 3) { status = 'completed'; return json(r, { data: { ...verification(), question: null, done: true } }) }
      const q = `Pertanyaan ${answers.length + 1}`
      turns.push({ speaker: 'ai', text: q })
      return json(r, { data: { question: q, done: false } })
    }
    return json(r, { error: { code: 'NOT_FOUND', message: 'tidak ada' } }, 404)
  })
  await login(page, 'learner')
  const reminder = page.getByTestId('ina-pengingat')
  await expect(reminder).toContainText('1 verifikasi tindakan perbaikan menunggu jawaban Anda')
  await reminder.getByRole('link', { name: 'Buka' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Verifikasi tindakan perbaikan' })).toBeVisible()
  await expect(reminder).toHaveCount(0)
  await page.getByTestId('verif-daftar').getByRole('link', { name: 'Jawab' }).click()

  await page.getByRole('button', { name: 'Mulai' }).click()
  await expect(page.getByRole('alert')).toContainText('Centang persetujuan')
  await page.getByLabel('Saya setuju jawaban saya diringkas untuk HR.').check()
  await page.getByRole('button', { name: 'Mulai' }).click()
  await expect(page.getByTestId('verif-percakapan')).toContainText('Pertanyaan 1')

  for (const [i, text] of ['Belum selesai', 'Terkendala persetujuan manajer', 'Butuh keputusan minggu ini'].entries()) {
    await expect(page.getByLabel(`Jawaban Anda (pertanyaan ${i + 1} dari 3)`)).toBeVisible()
    await page.getByLabel(/Jawaban Anda/).fill(text)
    await page.getByRole('button', { name: 'Kirim jawaban' }).click()
    if (i < 2) await expect(page.getByTestId('verif-percakapan')).toContainText(`Pertanyaan ${i + 2}`)
  }
  const done = page.getByTestId('verif-selesai')
  await expect(done).toContainText('HR menerima ringkasan berikut, tanpa isi percakapan')
  await expect(done).toContainText('Terhambat')
  await expect(done).not.toContainText('persetujuan manajer')
  expect(answers).toHaveLength(3)
})

test('alamat lama /m/ina diarahkan ke layar baru; flag dashboard mati menutup layar', async ({ page }) => {
  await page.route('**/api/ina/**', (r) => json(r, { data: [], kpis: { ...KPIS, total: 0 }, meta: { level: 'manage', hiddenIndividual: 0 } }))
  await login(page, 'hr_admin', { ...FLAGS, 'ina.dashboard': false })
  await page.goto('/m/ina')
  await expect(page).toHaveURL(/\/$/)
})
