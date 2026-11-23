import { test, expect, type Page } from '@playwright/test'
import { loginSebagai, type Peran } from './support/sesi'
import { mockApi, permintaanBelumDimock } from './support/api'
import { papanGapTna, ID_KOMPETENSI } from './support/tna-gap'
import { tinjauanGap, RINCIAN_RAHASIA, T_DRAF, T_PERBAIKAN, T_PELATIHAN, TEMUAN_MOCKUP, type OpsiTinjauan } from './support/tinjauan'

// Paritas B7 web: tinjauan temuan AI per gap (mockup layar `review`). Spek: docs/designs/paritas-mockup/b7-tinjauan-web.md.
// API di-mock; flag tna.review_workspace dan tna.gap_board bawaan mati di produksi, di sini dinyalakan per test.

const FLAGS = { 'tna.gap_board': true, 'tna.review_workspace': true }
const ALAMAT = `/tna/tinjauan?kind=competency&competencyId=${ID_KOMPETENSI}&tab=kompetensi`

async function setup(page: Page, o: OpsiTinjauan & { peran?: Peran; flags?: Record<string, boolean> } = {}) {
  const { peran = 'hr', flags = FLAGS, ...opsi } = o
  const papan = papanGapTna({ peran })
  const tinjauan = tinjauanGap(opsi)
  await mockApi(page, papan.penangan)
  await mockApi(page, tinjauan.penangan)
  await loginSebagai(page, peran, { submodules: ['cca', 'dna', 'tna', 'ina'], flags })
  return tinjauan.terkirim
}

const kartu = (page: Page, judul: string) => page.locator('.el-card').filter({ has: page.getByRole('heading', { name: judul }) })
const baris = (page: Page, judul: string) => page.getByRole('listitem').filter({ hasText: judul })

test.afterEach(({ page }) => { expect(permintaanBelumDimock(page)).toEqual([]) })

test('HR membuka tinjauan dari detail gap; breadcrumb kembali ke asal gap', async ({ page }) => {
  const sent = await setup(page)
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}&tab=kompetensi`)
  await page.getByRole('link', { name: 'Langsung ke tinjauan HR' }).click()
  await expect(page).toHaveURL(/\/tna\/tinjauan\?/)
  await expect(page.getByRole('heading', { level: 1, name: 'Tinjauan temuan AI' })).toBeVisible()
  await expect(page.getByText('Analisis insiden. HR memastikan klasifikasi sebelum solusi dijalankan; AI tidak memutuskan sendiri.')).toBeVisible()
  await expect(page.getByTestId('judul-layar')).toHaveText('Tinjauan HR')
  const bc = page.getByRole('navigation', { name: 'Lokasi' })
  await expect(bc).toHaveText('Training Needs › Tinjauan HR')
  // permintaan memakai filter gap yang sama dengan detail gap
  expect(sent.find((s) => s.path === 'GET /tna/review')?.body).toMatchObject({ kind: 'competency', competencyId: ID_KOMPETENSI })
  expect(sent.find((s) => s.path === 'GET /tna/review/solutions')?.body).toMatchObject({ kind: 'competency', competencyId: ID_KOMPETENSI })
  await bc.getByRole('link', { name: 'Training Needs' }).click()
  await expect(page).toHaveURL(/\/tna\?tab=kompetensi$/)
})

test('daftar temuan: keyakinan AI, saran AI untuk draf, pilihan sesuai keputusan, tanpa rincian (PO-6)', async ({ page }) => {
  await setup(page)
  await page.goto(ALAMAT)
  const temuan = kartu(page, 'Temuan dan klasifikasi')
  await expect(temuan.getByRole('listitem')).toHaveCount(3)
  const draf = baris(page, 'Kesulitan menentukan akar masalah')
  await expect(draf).toContainText('· AI 90%')
  await expect(draf).toContainText('saran AI: Training Needs')
  // draf belum diputus: tidak ada pilihan aktif
  for (const label of ['Training Needs', 'Improvement Needs', 'Perlu ditinjau HR']) await expect(draf.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
  const perbaikan = baris(page, 'Tidak ada template baku')
  await expect(perbaikan.getByRole('button', { name: 'Improvement Needs' })).toHaveAttribute('aria-pressed', 'true')
  await expect(perbaikan).not.toContainText('saran AI')
  // sudah diputus: tidak bisa kembali ke "Perlu ditinjau HR" (API 409 ALREADY_REVIEWED)
  await expect(perbaikan.getByRole('button', { name: 'Perlu ditinjau HR' })).toBeDisabled()
  await expect(page.getByText(RINCIAN_RAHASIA)).toHaveCount(0)
  // fitur kelola di luar mockup: lewat antrean lama
  await expect(temuan.getByRole('link', { name: 'Ubah teks atau tolak temuan di antrean tinjauan' })).toHaveAttribute('href', '/m/tna/review')
})

test('klasifikasi tersimpan langsung lewat classify', async ({ page }) => {
  const sent = await setup(page)
  await page.goto(ALAMAT)
  const draf = baris(page, 'Kesulitan menentukan akar masalah')
  await draf.getByRole('button', { name: 'Improvement Needs' }).click()
  await expect(draf.getByRole('button', { name: 'Improvement Needs' })).toHaveAttribute('aria-pressed', 'true')
  await expect(draf).not.toContainText('saran AI')
  expect(sent.find((s) => s.path === `classify ${T_DRAF}`)?.body).toEqual({ classification: 'improvement' })
})

test('solusi pelatihan: modul rekomendasi, tugaskan di EliteMentor (rencana lalu penugasan), catatan terkirim', async ({ page }) => {
  const sent = await setup(page)
  await page.goto(ALAMAT)
  const solusi = kartu(page, 'Solusi pelatihan')
  await expect(solusi.locator('.el-chip')).toHaveText('Training Needs')
  await expect(solusi).toContainText('ST-A2')
  await expect(solusi).toContainText('RCA & Post-Incident Report')
  await expect(solusi).toContainText('Level Intermediate · Analisis insiden')
  await expect(solusi).toContainText('Bila klien tidak memakai EliteMentor, gap diekspor ke LMS klien.')
  await solusi.getByRole('button', { name: 'Tugaskan di EliteMentor' }).click()
  await expect(solusi.getByRole('note')).toHaveText('Penugasan terkirim ke EliteMentor. Progres akan tersinkron kembali ke ELGOS.')
  await expect(solusi.getByRole('button', { name: 'Tugaskan di EliteMentor' })).toHaveCount(0)
  expect(sent.map((s) => s.path).filter((p) => p.startsWith('plan') || p.startsWith('assign'))).toEqual([`plan ${T_PELATIHAN}`, 'assign plan-3'])
})

test('tenant belajar di LMS sendiri: buat rencana saja, lalu unduh daftar gap', async ({ page }) => {
  const sent = await setup(page, { delivery: { target: 'lms', label: 'Moodle Elitery', assignAvailable: false } })
  await page.goto(ALAMAT)
  const solusi = kartu(page, 'Solusi pelatihan')
  await expect(solusi.getByRole('button', { name: 'Tugaskan di EliteMentor' })).toHaveCount(0)
  await expect(solusi).toContainText('Organisasi Anda belajar di Moodle Elitery.')
  await solusi.getByRole('button', { name: 'Buat rencana' }).click()
  await expect(solusi.getByRole('note')).toHaveText('Rencana dibuat. Unduh daftar gap untuk Moodle Elitery.')
  const unduh = page.waitForEvent('download')
  await solusi.getByRole('button', { name: 'Unduh daftar gap (CSV)' }).click()
  await unduh
  expect(sent.map((s) => s.path).filter((p) => /^(plan|assign|export)/.test(p))).toEqual([`plan ${T_PELATIHAN}`, 'export.csv'])
})

test('tindakan perbaikan: teruskan ke Improvement Needs', async ({ page }) => {
  const sent = await setup(page)
  await page.goto(ALAMAT)
  const ina = kartu(page, 'Tindakan perbaikan')
  await expect(ina.locator('.el-chip')).toHaveText('Improvement Needs')
  await expect(ina).toContainText('Temuan non-pelatihan menjadi tindakan perbaikan (SOP, alat, sistem, atau budaya) dengan pemilik dan tenggat.')
  await ina.getByRole('button', { name: 'Buat tindakan di Improvement Needs' }).click()
  await expect(ina.getByRole('note')).toHaveText('1 temuan diteruskan ke Improvement Needs.')
  expect(sent.find((s) => s.path === 'handoff')?.body).toEqual({ findingIds: [T_PERBAIKAN] })
  // sudah diteruskan: klasifikasinya terkunci (API 409 ALREADY_ACTIONED)
  await expect(baris(page, 'Tidak ada template baku').getByRole('button', { name: 'Training Needs' })).toBeDisabled()
})

test('modul Improvement Needs mati: tombol serah tidak tampil', async ({ page }) => {
  await setup(page, { inaEnabled: false })
  await page.goto(ALAMAT)
  const ina = kartu(page, 'Tindakan perbaikan')
  await expect(ina.getByRole('button', { name: 'Buat tindakan di Improvement Needs' })).toHaveCount(0)
  await expect(ina).toContainText('Modul Improvement Needs belum aktif untuk organisasi Anda.')
})

test('tanpa temuan pelatihan dan non-pelatihan: teks kosong mockup', async ({ page }) => {
  await setup(page, { temuan: [TEMUAN_MOCKUP[0]!] })
  await page.goto(ALAMAT)
  await expect(kartu(page, 'Solusi pelatihan')).toContainText('Belum ada temuan yang diklasifikasi sebagai pelatihan.')
  await expect(kartu(page, 'Tindakan perbaikan')).toContainText('Belum ada temuan non-pelatihan.')
})

test('flag tinjauan mati: tombol detail gap ke antrean lama, rute baru memantul', async ({ page }) => {
  await setup(page, { flags: { 'tna.gap_board': true } })
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}&tab=kompetensi`)
  await expect(page.getByRole('link', { name: 'Langsung ke tinjauan HR' })).toHaveAttribute('href', '/m/tna/review')
  await page.goto(ALAMAT)
  await expect(page).not.toHaveURL(/\/tna\/tinjauan/)
})

test('atasan tidak bisa membuka tinjauan HR (spek B7: hanya HR; RV-3 perlu keputusan)', async ({ page }) => {
  await setup(page, { peran: 'atasan' })
  await page.goto(ALAMAT)
  await expect(page).not.toHaveURL(/\/tna\/tinjauan/)
})

test('antrean lama memakai komponen ELGOS', async ({ page }) => {
  await setup(page)
  await page.goto('/m/tna/review')
  await expect(page.getByRole('heading', { level: 1, name: 'Review hasil AI' })).toBeVisible()
  await expect(page.getByTestId(`review-item-${T_DRAF}`)).toHaveClass(/el-card/)
  await expect(page.locator('[class*="text-slate"], [class*="bg-slate"], [class*="rounded-lg"]')).toHaveCount(0)
})

test('snapshot visual: tinjauan HR 1440', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page)
  await page.goto(ALAMAT)
  await expect(kartu(page, 'Temuan dan klasifikasi').getByRole('listitem')).toHaveCount(3)
  await page.evaluate('document.fonts.ready.then(() => true)')
  await expect(page).toHaveScreenshot('tinjauan-hr-terang.png', { fullPage: true })
})
