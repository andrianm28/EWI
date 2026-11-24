import { test, expect, type Page, type Route } from '@playwright/test'

// B11 Admin Tenant: pengguna & peran, jabatan & kamus, impor & integrasi. API di-mock.
// Spek: docs/designs/b11-admin-tenant.md. Peran tenant_admin dipetakan shell ke tampilan "Admin Tenant".
const FLAGS = { 'module.dna': true, 'module.tna': true, 'admin.tenant': true }
const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, json: body })

const USERS = [
  { id: 'u-1', name: 'Admin Satu', email: 'tenant_admin@demo.test', employeeId: null, role: 'tenant_admin', roleLabel: 'Admin Tenant', jobRoleId: null, jobRoleName: null, careerLevelId: null, supervisorId: null, status: 'active', lastLoginAt: '2026-11-19T01:00:00Z', pendingLogin: false },
  { id: 'u-2', name: 'Karyawan A', email: 'a@demo.test', employeeId: 'E-1', role: 'learner', roleLabel: 'Karyawan', jobRoleId: 'j-1', jobRoleName: 'Engineer Service Delivery', careerLevelId: null, supervisorId: null, status: 'active', lastLoginAt: null, pendingLogin: true },
  { id: 'u-3', name: 'ETA', email: 'eta@demo.test', employeeId: null, role: 'eta_admin', roleLabel: 'Super Admin', jobRoleId: null, jobRoleName: null, careerLevelId: null, supervisorId: null, status: 'active', lastLoginAt: '2026-11-18T01:00:00Z', pendingLogin: false },
]
const JOBS = [
  { id: 'j-1', name: 'Engineer Service Delivery', division: 'Operasi', description: null, levels: [], competencyCount: 12, employeeCount: 6, dictionary: 'tersedia', sources: ['dacum'], lastImport: { filename: 'DACUM_SD_v2.1.xlsx', at: '2026-11-18T03:00:00Z' } },
  { id: 'j-2', name: 'Sales', division: null, description: null, levels: [], competencyCount: 0, employeeCount: 0, dictionary: 'belum_tersedia', sources: [], lastImport: null },
]

async function login(page: Page, role = 'tenant_admin', flags: Record<string, boolean> = FLAGS) {
  const user = { id: 'u-1', tenantId: 't-1', email: `${role}@demo.test`, role }
  await page.route('**/api/auth/tenants', (r) => r.fulfill({ json: { data: [] } }))
  // PK-16: form kata sandi hanya tampil bila API mengizinkan (dev/staging)
  await page.route('**/api/auth/methods', (r) => r.fulfill({ json: { password: true, emailLink: true } }))
  await page.route('**/api/auth/login', (r) => r.fulfill({ json: { token: 't', user } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }))
  await page.route('**/api/me/access', (r) => r.fulfill({ json: { submodules: ['dna', 'tna'], flags } }))
  await page.route(/\/api\/(dna|tna)\//, (r) => r.fulfill({ json: { data: [] } }))
  await page.goto('/login')
  await page.getByLabel('Organisasi').fill('demo')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Kata sandi').fill(`pw-${Date.now()}`)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigasi utama' })

test('Admin Tenant mendarat di Pengguna & peran; undang, kirim ulang, dan nonaktifkan', async ({ page }) => {
  let users = structuredClone(USERS)
  const sent: { method: string; path: string; body: unknown }[] = []
  await page.route('**/api/tenant-admin/**', (r) => {
    const method = r.request().method()
    const path = new URL(r.request().url()).pathname.replace(/^.*\/api\/tenant-admin/, '')
    if (method !== 'GET') sent.push({ method, path, body: r.request().postDataJSON() })
    if (path === '/users' && method === 'GET') return json(r, { data: users, meta: { total: users.length, sso: true } })
    if (path === '/roles') return json(r, { data: [{ key: 'learner', label: 'Karyawan' }, { key: 'supervisor', label: 'Atasan' }, { key: 'hr_admin', label: 'HR / L&D' }] })
    if (path === '/job-roles') return json(r, { data: JOBS })
    if (path === '/users' && method === 'POST') {
      const body = r.request().postDataJSON()
      const created = { ...USERS[1], id: 'u-9', ...body, roleLabel: 'Atasan', status: 'invited', jobRoleName: null }
      users = [...users, created]
      return json(r, { data: created, invited: true }, 201)
    }
    if (path === '/users/u-2/invite') return json(r, { data: { sent: true } }, 201)
    if (path === '/users/u-2' && method === 'PATCH') {
      users = users.map((u) => (u.id === 'u-2' ? { ...u, status: 'disabled' } : u))
      return json(r, { data: users[1] })
    }
    return json(r, { error: { code: 'NOT_FOUND', message: 'tidak ada' } }, 404)
  })
  await login(page)
  await expect(page).toHaveURL(/\/admin\/pengguna$/)
  await expect(nav(page).getByRole('link')).toHaveText(['Pengguna & peran', 'Jabatan & kamus kompetensi', 'Impor data & integrasi'])
  await expect(page.getByRole('heading', { level: 1, name: 'Pengguna & peran' })).toBeVisible()
  await expect(page.getByTestId('usr-jumlah')).toHaveText('3 pengguna')
  // P7 ADM-1/3/4/5: tanpa baris pil AdminNav; tombol undang berikon; email mono 12px; nama satu baris
  await expect(page.getByRole('navigation', { name: 'Layar Admin Tenant' })).toHaveCount(0)
  await expect(page.getByTestId('usr-undang').locator('.el-icon')).toHaveCount(1)
  await expect(page.getByRole('cell', { name: 'a@demo.test', exact: true }).locator('.el-mono')).toHaveCSS('font-size', '12px')
  await expect(page.getByRole('row').filter({ hasText: 'Admin Satu' }).locator('b.adm__nowrap')).toHaveCSS('white-space', 'nowrap')
  await expect(page.getByText('SSO aktif')).toBeVisible()

  const row = (name: string) => page.getByRole('row').filter({ hasText: name })
  await expect(row('Karyawan A')).toContainText('Diundang')
  await expect(row('ETA')).toContainText('Dikelola ETA')
  await expect(row('Admin Satu').getByRole('button', { name: 'Nonaktifkan' })).toHaveCount(0) // akun sendiri

  // undang: validasi di layar, lalu kirim
  await page.getByTestId('usr-undang').click()
  await page.getByRole('button', { name: 'Kirim undangan' }).click()
  await expect(page.getByRole('alert')).toContainText('Isi nama pengguna')
  await page.getByLabel('Nama').fill('Atasan Baru')
  await page.getByLabel('Email kerja').fill('atasan.baru@demo.test')
  await page.getByLabel('Peran').selectOption('supervisor')
  await page.getByLabel('Jabatan').selectOption('j-1')
  await page.getByRole('button', { name: 'Kirim undangan' }).click()
  await expect(page.getByTestId('adm-info')).toContainText('Undangan dikirim ke atasan.baru@demo.test')
  // P7 ADM-2: note sukses hijau di dalam wilayah status
  await expect(page.getByTestId('adm-info')).toHaveClass(/el-note--success/)
  await expect(page.getByRole('status').getByTestId('adm-info')).toBeVisible()
  expect(sent[0]).toEqual({ method: 'POST', path: '/users', body: { name: 'Atasan Baru', email: 'atasan.baru@demo.test', role: 'supervisor', jobRoleId: 'j-1', employeeId: null } })

  await row('Karyawan A').getByRole('button', { name: 'Kirim ulang undangan' }).click()
  await expect(page.getByTestId('adm-info')).toHaveText('Undangan dikirim ulang ke a@demo.test.')
  await row('Karyawan A').getByRole('button', { name: 'Nonaktifkan' }).click()
  await expect(row('Karyawan A')).toContainText('Nonaktif')
  expect(sent.at(-1)).toEqual({ method: 'PATCH', path: '/users/u-2', body: { status: 'disabled' } })
})

test('Jabatan & kamus: daftar, nama kembar ditolak, lihat kamus', async ({ page }) => {
  await page.route('**/api/tenant-admin/**', (r) => {
    const method = r.request().method()
    const path = new URL(r.request().url()).pathname.replace(/^.*\/api\/tenant-admin/, '')
    if (path === '/job-roles' && method === 'GET') return json(r, { data: JOBS })
    if (path === '/job-roles' && method === 'POST') return json(r, { error: { code: 'DUPLICATE', message: 'Jabatan dengan nama ini sudah ada' } }, 409)
    if (path === '/job-roles/j-1/competencies') return json(r, { data: [{ id: 'c-1', name: 'Root Cause Analysis', kind: 'job', source: 'dacum' }] })
    return json(r, { data: [], meta: { total: 0, sso: false } })
  })
  await login(page)
  await nav(page).getByRole('link', { name: 'Jabatan & kamus kompetensi' }).click()
  const row = (name: string) => page.getByRole('row').filter({ hasText: name })
  await expect(row('Engineer Service Delivery')).toContainText('Tersedia')
  await expect(row('Engineer Service Delivery')).toContainText('DACUM · DACUM_SD_v2.1.xlsx')
  await expect(row('Sales')).toContainText('Belum tersedia')
  await expect(row('Sales').getByRole('button', { name: 'Lihat kamus' })).toHaveCount(0)
  // P7 JOB-2/JOB-3: jumlah "—" tanpa kamus, sumber kosong copy mockup
  await expect(row('Sales')).toContainText('Belum ada lokakarya DACUM')
  await expect(row('Sales').getByRole('cell', { name: '–' }).first()).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Layar Admin Tenant' })).toHaveCount(0)

  await page.getByTestId('job-tambah').click()
  await page.getByLabel('Nama jabatan').fill('sales')
  await page.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByRole('alert')).toContainText('Jabatan dengan nama ini sudah ada')

  await page.getByRole('button', { name: 'Batal' }).click()
  await row('Engineer Service Delivery').getByRole('button', { name: 'Lihat kamus' }).click()
  await expect(page.getByTestId('job-kamus')).toContainText('Root Cause Analysis')
})

test('Impor data & integrasi: kamus per jabatan dengan sumber DACUM, ringkasan KPI, status integrasi', async ({ page }) => {
  const previews: unknown[] = []
  await page.route('**/api/tenant-admin/**', (r) => {
    const method = r.request().method()
    const path = new URL(r.request().url()).pathname.replace(/^.*\/api\/tenant-admin/, '')
    if (path === '/imports/summary') {
      return json(r, { data: {
        competencyModel: [
          { jobRoleId: 'j-1', jobRoleName: 'Engineer Service Delivery', competencyCount: 12, status: 'terimpor', lastImport: { batchId: 'b-1', filename: 'DACUM_SD_v2.1.xlsx', source: 'dacum', uploadedAt: '2026-11-18T03:00:00Z', uploadedByName: 'Admin Satu', imported: 12 } },
          { jobRoleId: 'j-2', jobRoleName: 'Sales', competencyCount: 0, status: 'belum', lastImport: null },
        ],
        performance: [{ period: '2026-Q4', records: 3, missed: 2, lastImport: { batchId: 'b-2', filename: 'okr_q4_2026.csv', source: 'berkas', uploadedAt: '2026-11-18T04:00:00Z', uploadedByName: null } }],
        integrations: { elitementor: { status: 'terkonfigurasi', organizationMapped: true, sso: true, webhookSync: true }, lms: { targets: ['elitementor', 'moodle'], gapExport: true } },
      } })
    }
    if (path === '/imports/tna/templates') {
      return json(r, { data: [{ key: 'tna_performance', label: 'Kinerja', description: '', options: [], fields: [{ key: 'target', header: 'Target', required: true, oneOf: null, help: null, example: null }] }] })
    }
    if (path === '/imports/tna/tna_performance' && method === 'POST') {
      return json(r, { data: { id: 'b-8', kind: 'tna_performance', filename: 'kpi.csv', status: 'uploaded', rowCount: 1, headers: ['Target'], mapping: { target: 'Target' }, options: {}, result: null, createdAt: '', committedAt: null, createdByName: null } }, 201)
    }
    if (path === '/imports/tna/batches/b-8/preview') {
      previews.push(r.request().postDataJSON())
      return json(r, { data: { valid: 1, rejectedCount: 0, rejected: [], sample: [] } })
    }
    if (path === '/imports/dna/templates') {
      return json(r, { data: [{ key: 'dna_competencies', label: 'Kamus', description: '', options: [], fields: [{ key: 'name', header: 'Nama Kompetensi', required: true, oneOf: null, help: null, example: null }] }] })
    }
    if (path === '/imports/dna/dna_competencies' && method === 'POST') {
      return json(r, { data: { id: 'b-9', kind: 'dna_competencies', filename: 'kamus-sales.csv', status: 'uploaded', rowCount: 2, headers: ['Nama Kompetensi'], mapping: { name: 'Nama Kompetensi' }, options: {}, result: null, createdAt: '', committedAt: null, createdByName: null } }, 201)
    }
    if (path === '/imports/dna/batches/b-9/preview') {
      previews.push(r.request().postDataJSON())
      return json(r, { data: { valid: 2, rejectedCount: 0, rejected: [], sample: [] } })
    }
    return json(r, { error: { code: 'NOT_FOUND', message: 'tidak ada' } }, 404)
  })
  await login(page)
  await nav(page).getByRole('link', { name: 'Impor data & integrasi' }).click()
  const kamus = page.getByTestId('cfg-kamus')
  await expect(kamus).toContainText('DACUM · DACUM_SD_v2.1.xlsx')
  await expect(kamus).toContainText('Terimpor · 12 kompetensi')
  await expect(kamus).toContainText('Belum diimpor')
  await expect(page.getByTestId('cfg-kpi')).toContainText('3 target · 2 belum tercapai')
  await expect(page.getByTestId('cfg-kpi')).toContainText('Berkas · okr_q4_2026.csv')
  await expect(page.getByTestId('cfg-integrasi')).toContainText('EliteMentor: Terkonfigurasi (SSO · sync-back)')
  await expect(page.getByTestId('cfg-integrasi')).not.toContainText('deep link')
  await expect(page.getByTestId('cfg-integrasi')).toContainText('EliteMentor, Moodle')

  await page.getByLabel('Impor kamus untuk jabatan').selectOption('j-2')
  await kamus.getByLabel('Berkas (.xlsx atau .csv)').setInputFiles({ name: 'kamus-sales.csv', mimeType: 'text/csv', buffer: Buffer.from('Nama Kompetensi\nNegosiasi\nProspek\n') })
  await expect(page.getByTestId('impor-pemetaan-dna')).toContainText('kamus-sales.csv · 2 baris')
  await kamus.getByRole('button', { name: 'Periksa' }).click()
  await expect(page.getByTestId('impor-pratinjau-dna')).toContainText('2 baris valid')
  await expect(kamus.getByRole('button', { name: 'Simpan 2 baris' })).toBeVisible()
  expect(previews[0]).toEqual({ mapping: { name: 'Nama Kompetensi' }, options: { jobRoleId: 'j-2', source: 'dacum' } })

  // sumber data kinerja dipilih admin, bukan ditetapkan layar
  const kpi = page.getByTestId('cfg-kpi')
  await page.getByLabel('Periode').fill('2026-Q4')
  await page.getByLabel('Sumber data kinerja').selectOption('hris')
  await kpi.getByLabel('Berkas (.xlsx atau .csv)').setInputFiles({ name: 'kpi.csv', mimeType: 'text/csv', buffer: Buffer.from('Target\nSLA\n') })
  await kpi.getByRole('button', { name: 'Periksa' }).click()
  await expect(page.getByTestId('impor-pratinjau-tna')).toContainText('1 baris valid')
  expect(previews[1]).toEqual({ mapping: { target: 'Target' }, options: { period: '2026-Q4', source: 'hris' } })
})

test('flag admin.tenant mati: layar tidak bisa dibuka', async ({ page }) => {
  await login(page, 'tenant_admin', { ...FLAGS, 'admin.tenant': false })
  // menu B0 belum membaca meta.flag rute (lihat PR); penjaga rute yang menutup layar
  await expect(page).not.toHaveURL(/\/admin\/pengguna$/)
  await page.goto('/admin/pengguna')
  await expect(page).not.toHaveURL(/\/admin\/pengguna$/)
})

test('triase P7 ADM-1: Super Admin yang membuka layar admin lewat alamat mendapat tautan antar tiga layar; menu tetap 1:1 mockup', async ({ page }) => {
  await page.route('**/api/tenant-admin/**', (r) => {
    const path = new URL(r.request().url()).pathname.replace(/^.*\/api\/tenant-admin/, '')
    if (path === '/users') return json(r, { data: USERS, meta: { total: USERS.length, sso: false } })
    if (path === '/roles') return json(r, { data: [] })
    if (path === '/job-roles') return json(r, { data: JOBS })
    return json(r, { error: { code: 'NOT_FOUND', message: 'tidak ada' } }, 404)
  })
  await login(page, 'eta_admin')
  await expect(nav(page).getByRole('link', { name: 'Pengguna & peran' })).toHaveCount(0)
  await page.goto('/admin/pengguna')
  const links = page.getByRole('navigation', { name: 'Layar Admin Tenant' })
  await expect(links.getByRole('link')).toHaveText(['Pengguna & peran', 'Jabatan & kamus kompetensi', 'Impor data & integrasi'])
  await expect(links.getByRole('link', { name: 'Pengguna & peran' })).toHaveAttribute('aria-current', 'page')
  await links.getByRole('link', { name: 'Jabatan & kamus kompetensi' }).click()
  await expect(page).toHaveURL(/\/admin\/jabatan$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Jabatan & kamus kompetensi' })).toBeVisible()
  await expect(links.getByRole('link', { name: 'Jabatan & kamus kompetensi' })).toHaveAttribute('aria-current', 'page')
})

// Paritas P8 (docs/designs/paritas-mockup/p8-keputusan-r1-r22.md)
test('P8 R3: status pengguna berupa chip terisi seperti mockup', async ({ page }) => {
  await page.route('**/api/tenant-admin/**', (r) => {
    const path = new URL(r.request().url()).pathname.replace(/^.*\/api\/tenant-admin/, '')
    if (path === '/users') return json(r, { data: USERS, meta: { total: USERS.length, sso: true } })
    if (path === '/roles') return json(r, { data: [{ key: 'learner', label: 'Karyawan' }] })
    if (path === '/job-roles') return json(r, { data: JOBS })
    return json(r, { error: { code: 'NOT_FOUND', message: 'tidak ada' } }, 404)
  })
  await login(page)
  await expect(page.getByRole('row', { name: /Karyawan A/ }).locator('.el-chip--training')).toHaveText('Diundang')
  const baris = page.getByRole('row', { name: /Admin Satu/ })
  await expect(baris.locator('.el-chip--success')).toHaveText('Aktif')
  await expect(baris.locator('.el-status')).toHaveCount(0)
})
