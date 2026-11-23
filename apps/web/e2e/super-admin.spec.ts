import { test, expect, type Page } from '@playwright/test'
import { loginSebagai } from './support/sesi'
import { mockApi, cocok } from './support/api'

// B12 konsol Super Admin. API di-mock. Spek: docs/designs/b12-super-admin.md (rencana web, butir e2e 1–6).
const ON = { 'platform.console': true }
const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigasi utama' })

const TENANTS = [
  { id: 't-1', slug: 'pt-elitery', name: 'PT Elitery', status: 'active', adminEmail: 'admin@elitery.test', users: 42, activeModules: 3, createdAt: '2026-11-10T02:00:00Z' },
  { id: 't-2', slug: 'pt-tunggu', name: 'PT Tunggu', status: 'pending_admin', adminEmail: 'admin@tunggu.test', users: 1, activeModules: 0, createdAt: '2026-11-18T02:00:00Z' },
  { id: 't-3', slug: 'pt-beku', name: 'PT Beku', status: 'suspended', adminEmail: null, users: 0, activeModules: 0, createdAt: '2026-11-01T02:00:00Z' },
]
const MODULES = [
  { key: 'cca', name: 'Core Competencies', available: true, earlyAccess: true, entitled: true, flagOn: false, killSwitch: false, effective: false },
  { key: 'dna', name: 'Developmental Needs', available: true, earlyAccess: false, entitled: true, flagOn: true, killSwitch: true, effective: false },
  { key: 'tna', name: 'Training Needs', available: true, earlyAccess: false, entitled: true, flagOn: false, killSwitch: false, effective: false },
  { key: 'li', name: 'Learning Intervention', available: true, earlyAccess: false, entitled: false, flagOn: false, killSwitch: false, effective: false },
]
const SETTINGS = {
  editable: { sessionIdleMinutes: 30, aiHrAgreementTarget: 85 },
  display: { encryption: 'local', aiModel: { provider: 'bedrock', model: 'model-uji' }, ssoTenants: 0, idleEnforcedTenants: 1, idleEnforcement: 'per_tenant' },
  encryptionProvider: 'local',
}

async function konsol(page: Page) {
  let tenants = structuredClone(TENANTS)
  let modules = structuredClone(MODULES)
  let settings = structuredClone(SETTINGS)
  const sent: { method: string; path: string; body: unknown }[] = []
  await mockApi(page, (req) => {
    if (!req.path.startsWith('/platform/')) return undefined
    if (req.method !== 'GET') sent.push({ method: req.method, path: req.path, body: req.body })
    if (req.method === 'GET' && req.path === '/platform/tenants') {
      return { json: { data: { kpis: { tenants: tenants.length, activeTenants: 1, users: 43, modulesAvailable: 8 }, tenants } } }
    }
    if (req.method === 'POST' && req.path === '/platform/tenants') {
      const body = req.body as { name: string; adminEmail: string }
      const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      if (req.query.get('dryRun') === '1') {
        return { json: { data: { slug, exists: tenants.some((t) => t.slug === slug), report: [{ step: 'tenant', status: 'dibuat', detail: slug }] } } }
      }
      const tenant = { id: 't-9', slug, name: body.name, status: 'pending_admin', adminEmail: body.adminEmail, users: 1, activeModules: 0, createdAt: '2026-11-23T02:00:00Z' }
      tenants = [tenant, ...tenants]
      return { status: 201, json: { data: { tenant: { id: tenant.id, slug, name: tenant.name, status: tenant.status }, slug, invitation: 'failed' } } }
    }
    if (cocok(req, 'POST /platform/tenants/:id/invite')) return { json: { data: { invitation: 'sent' } } }
    if (cocok(req, 'GET /platform/tenants/:id/modules')) return { json: { data: modules } }
    const m = cocok(req, 'PUT /platform/tenants/:id/modules/:key')
    if (m) {
      const enabled = (req.body as { enabled: boolean }).enabled
      modules = modules.map((x) => (x.key === m.key ? { ...x, flagOn: enabled, effective: enabled && x.entitled !== false && !x.killSwitch } : x))
      return { json: { data: modules.find((x) => x.key === m.key) } }
    }
    if (req.path === '/platform/settings' && req.method === 'GET') return { json: { data: settings } }
    if (req.path === '/platform/settings' && req.method === 'PUT') {
      const body = req.body as Record<string, number>
      if (body.sessionIdleMinutes !== undefined && (body.sessionIdleMinutes < 5 || body.sessionIdleMinutes > 480)) {
        return { status: 400, json: { error: { code: 'BAD_REQUEST', message: 'Batas waktu sesi (menit) harus bilangan bulat 5–480' } } }
      }
      settings = { ...settings, editable: { ...settings.editable, ...body } }
      return { json: { data: settings } }
    }
    if (req.path === '/platform/ai-quality') {
      return { json: { data: [
        { tenantId: 't-1', name: 'PT Elitery', reviewed: 40, approved: 36, agreement: 90, meetsTarget: true, enoughData: true, daily: [{ day: '2026-11-20', reviewed: 12, approved: 11, agreement: 91.7, enoughData: true }, { day: '2026-11-21', reviewed: 3, approved: 2, agreement: 66.7, enoughData: false }] },
        { tenantId: 't-2', name: 'PT Tunggu', reviewed: 4, approved: 3, agreement: 75, meetsTarget: null, enoughData: false, daily: [] },
      ] } }
    }
    if (req.path === '/platform/ai-cost') {
      return { json: { data: [{ tenantId: 't-1', name: 'PT Elitery', week: '2026-11-16', sessions: 12, calls: 80, tokensIn: 120000, tokensOut: 30000, costUsd: 1.25, costMissing: true }] } }
    }
    if (req.path === '/platform/log') {
      return { json: { data: [{ id: '1', at: '2026-11-23T03:00:00Z', actorEmail: 'super@contoh.test', action: 'update', resource: 'tenant.module', targetTenantName: 'PT Elitery', meta: { module: 'tna', enabled: true } }] } }
    }
    if (req.path === '/platform/attempts') return { json: { data: [{ day: '2026-11-23', outcome: 'unknown_org', count: 12 }] } }
    return undefined
  })
  return { sent }
}

test('1. Super Admin mendarat di Tenant; KPI dan status tenant tampil sebagai teks', async ({ page }) => {
  await konsol(page)
  await loginSebagai(page, 'super', { flags: ON })
  await expect(page).toHaveURL(/\/tenants$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Tenant' })).toBeVisible()
  await expect(page.getByTestId('kpi-tenant')).toContainText('3')
  await expect(page.getByText('43', { exact: true })).toBeVisible()
  const rows = page.getByRole('table', { name: 'Daftar tenant' }).getByRole('row')
  await expect(rows.filter({ hasText: 'PT Elitery' })).toContainText('Aktif')
  await expect(rows.filter({ hasText: 'PT Tunggu' })).toContainText('Menunggu admin')
  await expect(rows.filter({ hasText: 'PT Beku' })).toContainText('Ditangguhkan')
  await expect(nav(page).getByRole('link')).toContainText(['Tenant', 'Konfigurasi platform'])
  // P7 TEN-1/2/5
  await expect(page.getByText('Super admin mengonfigurasi multi-tenant: satu tenant adalah satu perusahaan dengan datanya sendiri.')).toBeVisible()
  await expect(page.getByText('dari 3 tenant terdaftar')).toBeVisible()
  await expect(page.getByText('seluruh tenant')).toBeVisible()
  await expect(page.getByText('dapat diaktifkan per tenant')).toBeVisible()
  await expect(rows.filter({ hasText: 'PT Elitery' })).toContainText(/\d+ \/ \d+/)
})

test('2. Buat tenant: Periksa memberi slug, slug ganda diperingatkan, simpan, undangan gagal bisa dikirim ulang', async ({ page }) => {
  const { sent } = await konsol(page)
  await loginSebagai(page, 'super', { flags: ON })
  await page.getByRole('button', { name: 'Buat tenant baru' }).click()
  // P7 TEN-6
  await expect(page.getByLabel('Nama perusahaan')).toHaveAttribute('placeholder', 'PT Contoh Sejahtera')
  await expect(page.getByLabel('Email admin tenant')).toHaveAttribute('placeholder', 'admin@contoh.co.id')
  await expect(page.getByText('Admin tenant menerima undangan dan menyiapkan pengguna, jabatan, dan data sendiri.')).toBeVisible()
  await page.getByLabel('Nama perusahaan').fill('PT Elitery')
  await page.getByLabel('Email admin tenant').fill('admin@baru.test')
  await page.getByRole('button', { name: 'Periksa' }).click()
  await expect(page.getByTestId('slug-hasil')).toContainText('pt-elitery')
  await expect(page.getByTestId('slug-hasil')).toContainText('sudah dipakai')
  await page.getByLabel('Nama perusahaan').fill('PT Contoh Baru')
  await page.getByRole('button', { name: 'Periksa' }).click()
  await expect(page.getByTestId('slug-hasil')).toContainText('pt-contoh-baru')
  await page.getByRole('button', { name: 'Buat tenant', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('email undangan gagal terkirim')
  await expect(page.getByRole('status').locator('.el-note--success')).toBeVisible()
  const row = page.getByRole('table', { name: 'Daftar tenant' }).getByRole('row').filter({ hasText: 'PT Contoh Baru' })
  await expect(row).toContainText('Menunggu admin')
  await row.getByRole('button', { name: 'Kirim ulang undangan' }).click()
  await expect(page.getByRole('status')).toContainText('Undangan dikirim ulang')
  expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
    'POST /platform/tenants', 'POST /platform/tenants', 'POST /platform/tenants', 'POST /platform/tenants/t-9/invite'])
})

test('3. Panel modul: nyalakan Training Needs; kill switch dan tanpa akses tampil sebagai teks', async ({ page }) => {
  const { sent } = await konsol(page)
  await loginSebagai(page, 'super', { flags: ON })
  await page.getByRole('table', { name: 'Daftar tenant' }).getByRole('row').filter({ hasText: 'PT Elitery' }).getByRole('button', { name: 'Modul' }).click()
  const panel = page.getByRole('region', { name: 'Modul PT Elitery' })
  await expect(panel.getByRole('row').filter({ hasText: 'Developmental Needs' })).toContainText('Dimatikan darurat')
  await expect(panel.getByRole('row').filter({ hasText: 'Learning Intervention' })).toContainText('Belum berlangganan')
  await expect(panel.getByRole('row').filter({ hasText: 'Core Competencies' })).toContainText('Akses awal')
  await panel.getByRole('checkbox', { name: 'Aktifkan Training Needs' }).check()
  await expect(panel.getByRole('row').filter({ hasText: 'Training Needs' })).toContainText('Aktif')
  expect(sent).toContainEqual({ method: 'PUT', path: '/platform/tenants/t-1/modules/tna', body: { enabled: true } })
})

test('4. Konfigurasi platform: menurunkan batas sesi meminta konfirmasi, galat rentang di ringkasan, 2FA tidak dipakai', async ({ page }) => {
  const { sent } = await konsol(page)
  await loginSebagai(page, 'super', { flags: ON })
  await nav(page).getByRole('link', { name: 'Konfigurasi platform' }).click()
  await expect(page).toHaveURL(/\/platform$/)
  await expect(page.getByText('Tidak dipakai (login lewat link email, PD-10)')).toBeVisible()
  await expect(page.getByText('30 menit tanpa aktivitas, di 1 tenant')).toBeVisible()
  const idle = page.getByLabel('Batas waktu sesi (menit)')
  await idle.fill('3')
  await page.getByRole('button', { name: 'Simpan konfigurasi' }).click()
  await expect(page.getByRole('alert')).toContainText('5–480')
  expect(sent).toEqual([])
  await idle.fill('20')
  await page.getByRole('button', { name: 'Simpan konfigurasi' }).click()
  await expect(page.getByTestId('konfirmasi-sesi')).toContainText('berlaku untuk semua tenant')
  await page.getByRole('button', { name: 'Ya, turunkan batas sesi' }).click()
  await expect(page.getByRole('status')).toContainText('Konfigurasi disimpan')
  expect(sent).toEqual([{ method: 'PUT', path: '/platform/settings', body: { sessionIdleMinutes: 20, aiHrAgreementTarget: 85 } }])
})

test('5. Kartu AI: data belum cukup untuk n < 10; unduh CSV biaya; log dan percobaan tampil', async ({ page }) => {
  await konsol(page)
  await page.route('**/api/platform/ai-cost?*format=csv*', (r) => r.fulfill({
    status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="biaya-ai-mingguan.csv"' },
    body: 'minggu,tenant,sesi,panggilan,token_masuk,token_keluar,biaya_usd,biaya_belum_tercatat\r\n',
  }))
  await loginSebagai(page, 'super', { flags: ON })
  await page.goto('/platform')
  const quality = page.getByRole('table', { name: 'Kesepakatan AI–HR per tenant' })
  await expect(quality.getByRole('row').filter({ hasText: 'PT Elitery' })).toContainText('Memenuhi target')
  await expect(quality.getByRole('row').filter({ hasText: 'PT Tunggu' })).toContainText('Data belum cukup (n < 10)')
  await quality.getByRole('row').filter({ hasText: 'PT Elitery' }).getByRole('button', { name: 'Per hari' }).click()
  const daily = page.getByRole('table', { name: 'Kesepakatan per hari PT Elitery' })
  await expect(daily.getByRole('row').filter({ hasText: '2026-11-21' })).toContainText('data belum cukup (n < 10)')
  await expect(page.getByRole('table', { name: 'Biaya token mingguan' })).toContainText('biaya belum tercatat')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Unduh CSV' }).click()
  expect((await download).suggestedFilename()).toBe('biaya-ai-mingguan.csv')
  await expect(page.getByRole('table', { name: 'Log audit platform' })).toContainText('PT Elitery')
  await expect(page.getByRole('table', { name: 'Percobaan masuk tanpa tenant' })).toContainText('Organisasi tidak dikenal')
})

test('6. Flag mati: menu Tenant dan Konfigurasi tidak tampil, /tenants tidak bisa dibuka', async ({ page }) => {
  await konsol(page)
  await loginSebagai(page, 'super', { flags: { 'platform.console': false } })
  await expect(nav(page).getByRole('link', { name: 'Tenant' })).toHaveCount(0)
  await expect(nav(page).getByRole('link', { name: 'Konfigurasi platform' })).toHaveCount(0)
  await page.goto('/tenants')
  await expect(page).not.toHaveURL(/\/tenants$/)
})
