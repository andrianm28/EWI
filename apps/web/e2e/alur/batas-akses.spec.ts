import { test, expect, type Page } from '@playwright/test'
import { loginSebagai, type OpsiSesi } from '../support/sesi'
import { mockApi, cocok } from '../support/api'

// B18 4.4 (docs/designs/b18-e2e-qa-malam.md): batas akses di tingkat tampilan (router dan menu).
// Penegakan sesungguhnya diuji di API (test integrasi tiap paket); di sini hanya alamat langsung yang tidak boleh
// membuka layar peran lain. Yang sudah diuji spec paket tidak digandakan:
// - transkrip tidak tampil untuk HR dan atasan: poc-dna-tna.spec.ts, iv.spec.ts
// - atasan tanpa akses dari HR melihat pesan terkunci di Improvement Needs (K1): improvement-needs.spec.ts
// - flag mati untuk Learning Intervention, Career & Promotion, Dashboard, Admin Tenant, Super Admin, DNA/TNA lama:
//   li.spec.ts, b16-cp.spec.ts, dashboard.spec.ts, admin-tenant.spec.ts, super-admin.spec.ts, gating.spec.ts

const SEMUA_FLAG: Record<string, boolean> = {
  'module.cca': true, 'module.dna': true, 'module.tna': true, 'module.ina': true,
  'module.li': true, 'module.ld': true, 'module.lim': true,
  'dashboard.main': true, 'ina.dashboard': true, 'promotion.recommendation': true,
  'admin.tenant': true, 'platform.console': true, 'tna.gap_board': true,
}
const SEMUA: OpsiSesi = { flags: SEMUA_FLAG }

/** Alamat yang dibuka langsung harus berakhir di beranda tampilan aktif (alamat sesudah masuk). */
async function dialihkanKeBeranda(page: Page, alamat: string[]) {
  const beranda = new URL(page.url()).pathname
  for (const a of alamat) {
    await test.step(a, async () => {
      await page.goto(a)
      await expect(page).toHaveURL((u) => u.pathname === beranda)
      await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
    })
  }
}

const LAYAR_HR = ['/dashboard', '/cc', '/lib', '/prog', '/req', '/ld', '/lim', '/cp', '/ina', '/tna/gap', '/m/tna/review']
const LAYAR_ADMIN = ['/admin/pengguna', '/admin/jabatan', '/admin/impor']
const LAYAR_SUPER = ['/tenants', '/platform']

test('karyawan membuka alamat layar HR, Admin Tenant, atau Super Admin: dialihkan ke berandanya', async ({ page }) => {
  await loginSebagai(page, 'karyawan', SEMUA)
  await dialihkanKeBeranda(page, [...LAYAR_HR, ...LAYAR_ADMIN, ...LAYAR_SUPER])
})

test('atasan membuka alamat layar khusus HR, Admin Tenant, atau Super Admin: dialihkan ke Dashboard tim', async ({ page }) => {
  await loginSebagai(page, 'atasan', SEMUA)
  await expect(page).toHaveURL(/\/dashboard$/)
  await dialihkanKeBeranda(page, ['/cc', '/lib', '/prog', '/req', '/ld', '/m/tna/review', ...LAYAR_ADMIN, ...LAYAR_SUPER])
})

test('Admin Tenant membuka alamat layar Super Admin: dialihkan ke Pengguna & peran', async ({ page }) => {
  await loginSebagai(page, 'admin', SEMUA)
  await expect(page).toHaveURL(/\/admin\/pengguna$/)
  await dialihkanKeBeranda(page, LAYAR_SUPER)
})

test('flag modul baru mati: alamat langsung ke Core Competencies, Learning Delivery, dan Learning Impact Measurement dialihkan', async ({ page }) => {
  await loginSebagai(page, 'hr', { flags: { ...SEMUA_FLAG, 'module.cca': false, 'module.ld': false, 'module.lim': false } })
  await dialihkanKeBeranda(page, ['/cc', '/ld', '/lim'])
})

test('tanpa entitlement full_suite: alamat langsung ke modul 2–5 dialihkan walau flag menyala', async ({ page }) => {
  await loginSebagai(page, 'hr', { flags: SEMUA_FLAG, products: [] })
  await dialihkanKeBeranda(page, ['/lib', '/prog', '/req', '/ld', '/lim'])
})

test('Super Admin membuka sesi wawancara: hanya status, tanpa isi percakapan dan tanpa formulir jawaban (PO-6, B2)', async ({ page }) => {
  // Bentuk respons sama dengan GET /tna/sessions/:id untuk selain yang diwawancarai (modules/interviews/index.js)
  await mockApi(page, (req) => (cocok(req, 'GET /tna/sessions/:id')
    ? { json: { data: { id: 's1', status: 'in_progress', step: 'chat', summaryState: 'not_applicable', focusLabel: 'Analisis insiden', durationMinutes: 15, transcriptVisible: false } } }
    : undefined))
  await loginSebagai(page, 'super', SEMUA)
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name: /Wawancara/ })).toHaveCount(0)
  await page.goto('/iv/s1')
  await expect(page.getByTestId('transcript-private')).toHaveText('Percakapan wawancara hanya bisa dibaca karyawan yang bersangkutan.')
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Kirim|Setuju/ })).toHaveCount(0)
})
