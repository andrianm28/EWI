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
  // PK-16: form kata sandi hanya tampil bila API mengizinkan (dev/staging)
  await page.route('**/api/auth/methods', (r) => r.fulfill({ json: { password: true, emailLink: true } }))
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token: 't', user } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: ['dna', 'tna', 'ina'], flags } }))
  await page.route(/\/api\/(dna|tna)\//, (r) => r.fulfill({ json: { data: [] } }))
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Kata sandi').fill(`pw-${Date.now()}`)
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
  // P3 IN-1..IN-3: breadcrumb, kartu Agen AI copy mockup tanpa tombol, tabel verifikasi di kartu sendiri
  await expect(page.getByRole('navigation', { name: 'Lokasi' })).toHaveText(/Learning Needs Analysis\s*›\s*Improvement Needs/)
  const agen = page.getByTestId('ina-ai')
  await expect(agen.getByRole('heading', { name: 'Agen AI · Verifikasi tindakan perbaikan' })).toBeVisible()
  await expect(agen).toContainText('Pilot')
  await expect(agen).toContainText('AI menanyai pemilik tindakan perbaikan (atasan atau karyawan pada jabatan terkait) tentang hambatan dan status, lalu merangkum untuk HR.')
  // Gap C7: HR membuka bagian Verifikasi AI di halaman ini; fokus pindah ke judulnya
  await agen.getByRole('button', { name: 'Buka wawancara AI' }).click()
  await expect(page.getByRole('heading', { name: 'Verifikasi AI' })).toBeFocused()
  await expect(page.getByTestId('ina-verifikasi')).toContainText('Belum ada verifikasi')
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
  // P5 IN-7: tombol Ubah pindah ke klik baris (?ubah=<id>)
  await table.getByRole('row').filter({ hasText: 'Perbarui SOP eskalasi insiden' }).getByRole('cell').nth(1).click()
  await expect(page).toHaveURL(/ubah=a-1/)
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
  // P5 IN-11: bukan galat, jadi nada peringatan
  await expect(page.getByTestId('ina-galat')).toHaveClass(/el-note--warning/)
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

test('P3 review: flag ina.ai_verification mati: kartu Agen AI dan kartu Verifikasi AI tidak ada', async ({ page }) => {
  await page.route(/\/api\/ina\//, (r) => r.fulfill({ json: { data: [] } }))
  await login(page, 'hr_admin', { ...FLAGS, 'ina.ai_verification': false })
  await nav(page).getByRole('link', { name: 'Improvement Needs' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Improvement Needs' })).toBeVisible()
  await expect(page.getByTestId('ina-ai')).toHaveCount(0)
  await expect(page.getByTestId('ina-verifikasi')).toHaveCount(0)
})

// Paritas P5 (docs/designs/paritas-mockup/p5-lna.md)
async function mockManage(page: Page, sent: { method: string; path: string }[] = []) {
  await page.route('**/api/ina/**', async (r) => {
    const url = new URL(r.request().url())
    const method = r.request().method()
    const path = url.pathname.replace(/^.*\/api\/ina/, '')
    if (method !== 'GET') sent.push({ method, path })
    if (path === '/access/me') return json(r, { data: { level: 'manage', pendingVerifications: 0 } })
    if (path === '/actions' && method === 'GET') return json(r, { data: ACTIONS, kpis: KPIS, meta: { level: 'manage', hiddenIndividual: 0 } })
    if (path === '/actions/a-1' && method === 'GET') return json(r, { data: { ...ACTIONS[0], detail: 'Detail' } })
    if (path === '/actions/a-1/verifications' && method === 'POST') return json(r, { data: { id: 'v-1', status: 'assigned' } }, 201)
    if (path === '/owners') return json(r, { data: [{ id: 'u-2', name: 'Karyawan A', jobRoleName: 'Engineer L1' }] })
    if (path === '/access' || path === '/verifications') return json(r, { data: [] })
    return json(r, { error: { code: 'NOT_FOUND', message: 'tidak ada' } }, 404)
  })
}

test('P5 IN-4..IN-9: subjudul dan note KPI mockup, h2 di luar tabel, tujuh kolom tanpa Aksi, Akses tebal', async ({ page }) => {
  await mockManage(page)
  await login(page, 'hr_admin')
  await page.goto('/ina')
  await expect(page.getByText('Masalah non-pelatihan (SOP, alat, sistem, budaya) yang berjalan bersamaan dengan Training Needs agar solusi tepat sasaran.')).toBeVisible()
  const kpi = page.getByTestId('ina-kpi')
  await expect(kpi.locator('.el-kpi__note')).toHaveText(['1 lewat tenggat', 'klik status untuk ubah', 'perbaikan proses', 'perlu dukungan manajemen'])
  await expect(page.getByRole('heading', { level: 2, name: 'Tindakan perbaikan', exact: true })).toBeVisible()
  const table = page.getByRole('table', { name: 'Tindakan perbaikan' })
  await expect(table.getByRole('columnheader')).toHaveText(['Temuan', 'Kategori', 'Pemilik', 'Jabatan pemilik', 'Asal gap', 'Tenggat', 'Status'])
  await expect(table.getByRole('button', { name: /Ubah|Verifikasi lewat AI/ })).toHaveCount(0)
  await expect(page.locator('b', { hasText: 'Akses:' })).toBeVisible()
})

test('P5 IN-7: tabel muat di 1440 dan 1280; klik baris membuka formulir ubah dengan Verifikasi lewat AI', async ({ page }) => {
  const sent: { method: string; path: string }[] = []
  await mockManage(page, sent)
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page, 'hr_admin')
  await page.goto('/ina')
  const table = page.getByRole('table', { name: 'Tindakan perbaikan' })
  await expect(table).toContainText('Perbarui SOP eskalasi insiden')
  const fits = () => page.locator('.el-table__scroll').first().evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
  expect(await fits()).toBe(true)
  await page.setViewportSize({ width: 1280, height: 900 })
  expect(await fits()).toBe(true)

  // klik pada select status tidak membuka formulir
  await page.getByLabel('Status Perbarui SOP eskalasi insiden').click()
  await expect(page).not.toHaveURL(/ubah=/)
  await page.keyboard.press('Escape')
  await table.getByRole('row').filter({ hasText: 'Perbarui SOP eskalasi insiden' }).getByRole('cell').nth(2).click()
  await expect(page).toHaveURL(/ubah=a-1/)
  const form = page.getByTestId('ina-form')
  await expect(form.getByRole('heading', { name: 'Ubah tindakan' })).toBeVisible()
  await expect(form.getByLabel('Temuan atau tindakan')).toHaveValue('Perbarui SOP eskalasi insiden')
  await form.getByRole('button', { name: 'Verifikasi lewat AI' }).click()
  await expect(page.getByTestId('ina-info')).toContainText('Verifikasi untuk "Perbarui SOP eskalasi insiden" ditugaskan')
  expect(sent).toContainEqual({ method: 'POST', path: '/actions/a-1/verifications' })

  // baris tanpa pemilik: tanpa tombol verifikasi; Batal menghapus ?ubah
  await table.getByRole('row').filter({ hasText: 'Forum umpan balik bulanan' }).getByRole('cell').nth(1).click()
  await expect(page).toHaveURL(/ubah=a-2/)
  await expect(form.getByRole('button', { name: 'Verifikasi lewat AI' })).toHaveCount(0)
  await form.getByRole('button', { name: 'Batal' }).click()
  await expect(page).not.toHaveURL(/ubah=/)
  await expect(page.getByTestId('ina-form')).toHaveCount(0)
})

test('P5 IN-7: alamat ?ubah langsung membuka formulir; id tak dikenal dihapus', async ({ page }) => {
  await mockManage(page)
  await login(page, 'hr_admin')
  await page.goto('/ina?ubah=a-1')
  await expect(page.getByTestId('ina-form').getByLabel('Temuan atau tindakan')).toHaveValue('Perbarui SOP eskalasi insiden')
  await page.goto('/ina?ubah=tidak-ada')
  await expect(page).not.toHaveURL(/ubah=/)
  await expect(page.getByTestId('ina-form')).toHaveCount(0)
})

// Triase review independen P5
test('P5 triase: klik baris memindah fokus ke judul formulir ubah', async ({ page }) => {
  await mockManage(page)
  await login(page, 'hr_admin')
  await page.goto('/ina')
  await page.getByRole('table', { name: 'Tindakan perbaikan' }).getByRole('row').filter({ hasText: 'Forum umpan balik bulanan' }).getByRole('cell').nth(1).click()
  await expect(page.getByTestId('ina-form').getByRole('heading', { name: 'Ubah tindakan' })).toBeFocused()
})

test('P5 triase: ?ubah untuk tindakan di daftar "menyangkut individu" membuka daftar itu, bukan dihapus', async ({ page }) => {
  const hiddenAction = { ...ACTIONS[1], id: 'a-9', title: 'Pendampingan kinerja', involvesIndividual: true }
  await page.route('**/api/ina/**', async (r) => {
    const url = new URL(r.request().url())
    const path = url.pathname.replace(/^.*\/api\/ina/, '')
    if (path === '/access/me') return json(r, { data: { level: 'manage', pendingVerifications: 0 } })
    if (path === '/actions') return json(r, url.searchParams.get('hidden') ? { data: [hiddenAction], kpis: KPIS, meta: { level: 'manage', hiddenIndividual: 1 } } : { data: ACTIONS, kpis: KPIS, meta: { level: 'manage', hiddenIndividual: 1 } })
    if (path === '/actions/a-9') return json(r, { data: { ...hiddenAction, detail: null } })
    if (path === '/owners' || path === '/access' || path === '/verifications') return json(r, { data: [] })
    return json(r, { error: { code: 'NOT_FOUND', message: 'tidak ada' } }, 404)
  })
  await login(page, 'hr_admin')
  await page.goto('/ina?ubah=a-9')
  await expect(page.getByTestId('ina-form').getByLabel('Temuan atau tindakan')).toHaveValue('Pendampingan kinerja')
  await expect(page).toHaveURL(/ubah=a-9/)
  await expect(page.getByRole('heading', { level: 2, name: 'Tindakan yang menyangkut individu' })).toBeVisible()
})

test('P5 triase: level baca (atasan) tidak membuka formulir dan ?ubah dihapus', async ({ page }) => {
  await page.route('**/api/ina/**', (r) => {
    const path = new URL(r.request().url()).pathname.replace(/^.*\/api\/ina/, '')
    if (path === '/access/me') return json(r, { data: { level: 'read', pendingVerifications: 0 } })
    return json(r, { data: ACTIONS, kpis: KPIS, meta: { level: 'read' } })
  })
  await login(page, 'supervisor')
  await page.goto('/ina?ubah=a-1')
  await expect(page.getByRole('table', { name: 'Tindakan perbaikan' })).toContainText('Perbarui SOP eskalasi insiden')
  await expect(page).not.toHaveURL(/ubah=/)
  await expect(page.getByTestId('ina-form')).toHaveCount(0)
})

test('P5 triase: copy verifikasi kosong menunjuk klik baris', async ({ page }) => {
  await mockManage(page)
  await login(page, 'hr_admin')
  await page.goto('/ina')
  await expect(page.getByTestId('ina-verifikasi')).toContainText('Klik baris tindakan yang punya pemilik, lalu pilih "Verifikasi lewat AI".')
})
