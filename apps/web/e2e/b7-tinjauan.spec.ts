import { test, expect, type Page } from '@playwright/test'
import { loginSebagai, type Peran } from './support/sesi'
import { mockApi, permintaanBelumDimock } from './support/api'
import { papanGapTna, ID_KOMPETENSI } from './support/tna-gap'
import { tinjauanGap, galatApi, RINCIAN_RAHASIA, T_DRAF, T_PERBAIKAN, T_PELATIHAN, TEMUAN_MOCKUP, type OpsiTinjauan } from './support/tinjauan'

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
  await expect(bc).toHaveText(/Training Needs\s*›\s*Tinjauan HR/)
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

const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms))
const galatTeks = (page: Page) => page.getByRole('alert')

test('alamat gap tidak lengkap atau tidak valid: pesan, tanpa daftar', async ({ page }) => {
  await setup(page, { galat: (path) => (path === 'GET /tna/review' ? galatApi(400, 'BAD_REQUEST', 'Kompetensi tidak valid') : undefined) })
  await page.goto('/tna/tinjauan?tab=kompetensi')
  await expect(galatTeks(page)).toContainText('Alamat gap tidak lengkap. Buka tinjauan dari detail gap Training Needs.')
  await expect(page.getByRole('heading', { name: 'Temuan dan klasifikasi' })).toHaveCount(0)
  await page.goto('/tna/tinjauan?kind=competency&competencyId=bukan-uuid')
  await expect(galatTeks(page)).toContainText('Kompetensi tidak valid')
  await expect(page.getByRole('heading', { name: 'Temuan dan klasifikasi' })).toHaveCount(0)
})

test('memuat: teks "Memuat…" dan aria-busy selama solusi belum datang', async ({ page }) => {
  await setup(page, { tundaSolusiMs: 1500 })
  await page.goto(ALAMAT)
  const memuat = page.getByText('Memuat…')
  await expect(memuat).toBeVisible()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(1)
  await expect(kartu(page, 'Temuan dan klasifikasi').getByRole('listitem')).toHaveCount(3)
  await expect(memuat).toHaveCount(0)
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
})

test('klasifikasi sedang disimpan: fokus tetap di tombol, klik ulang diabaikan, temuan lain tetap bisa diklasifikasi', async ({ page }) => {
  const sent = await setup(page, { galat: async (path) => { if (path === `classify ${T_DRAF}`) await tunggu(1000); return undefined } })
  await page.goto(ALAMAT)
  const draf = baris(page, 'Kesulitan menentukan akar masalah')
  const pilih = draf.getByRole('button', { name: 'Improvement Needs' })
  await pilih.click()
  await expect(pilih).toHaveAttribute('aria-disabled', 'true')
  await expect(pilih).toBeFocused()
  // bukan atribut disabled bawaan (yang membuang fokus); force: Playwright menganggap aria-disabled tidak bisa diklik
  await expect(pilih).not.toHaveAttribute('disabled')
  await draf.getByRole('button', { name: 'Training Needs' }).click({ force: true })
  // temuan lain tidak ikut terkunci
  const lain = baris(page, 'Praktik dan umpan balik sangat minim')
  await lain.getByRole('button', { name: 'Improvement Needs' }).click()
  await expect(lain.getByRole('button', { name: 'Improvement Needs' })).toHaveAttribute('aria-pressed', 'true')
  await expect(pilih).toHaveAttribute('aria-pressed', 'true')
  await expect(pilih).not.toHaveAttribute('aria-disabled', 'true')
  expect(sent.filter((s) => s.path === `classify ${T_DRAF}`)).toHaveLength(1)
  expect(sent.filter((s) => s.path === `classify ${T_PELATIHAN}`)).toHaveLength(1)
})

test('klasifikasi terkunci selama solusi dijalankan', async ({ page }) => {
  const sent = await setup(page, { galat: async (path) => { if (path.startsWith('assign')) await tunggu(1000); return undefined } })
  await page.goto(ALAMAT)
  await kartu(page, 'Solusi pelatihan').getByRole('button', { name: 'Tugaskan di EliteMentor' }).click()
  const pilih = baris(page, 'Kesulitan menentukan akar masalah').getByRole('button', { name: 'Training Needs' })
  await expect(pilih).toHaveAttribute('aria-disabled', 'true')
  await pilih.click({ force: true })
  await expect(kartu(page, 'Solusi pelatihan').getByRole('note')).toBeVisible()
  expect(sent.filter((s) => s.path.startsWith('classify'))).toEqual([])
})

test('klasifikasi 409: pesan API dan nilai dari server tampil setelah dimuat ulang', async ({ page }) => {
  await setup(page, {
    galat: (path, temuan) => {
      if (path !== `classify ${T_DRAF}`) return undefined
      // HR lain sudah memutusnya sebagai Improvement Needs
      Object.assign(temuan.find((t) => t.id === T_DRAF)!, { reviewStatus: 'approved', category: 'non_training' })
      return galatApi(409, 'ALREADY_REVIEWED', 'Temuan ini sudah direview')
    },
  })
  await page.goto(ALAMAT)
  const draf = baris(page, 'Kesulitan menentukan akar masalah')
  await draf.getByRole('button', { name: 'Training Needs' }).click()
  await expect(galatTeks(page)).toContainText('Temuan ini sudah direview')
  await expect(draf.getByRole('button', { name: 'Improvement Needs' })).toHaveAttribute('aria-pressed', 'true')
  await expect(draf.getByRole('button', { name: 'Training Needs' })).toHaveAttribute('aria-pressed', 'false')
})

test('klasifikasi tersimpan tetapi muat ulang gagal: pesan tersimpan, bukan gagal', async ({ page }) => {
  let tersimpan = false
  await setup(page, {
    galat: (path) => {
      if (path === `classify ${T_DRAF}`) { tersimpan = true; return undefined }
      return tersimpan && path === 'GET /tna/review/solutions' ? galatApi(500, 'INTERNAL', 'Galat server') : undefined
    },
  })
  await page.goto(ALAMAT)
  const draf = baris(page, 'Kesulitan menentukan akar masalah')
  await draf.getByRole('button', { name: 'Improvement Needs' }).click()
  await expect(galatTeks(page)).toContainText('Klasifikasi tersimpan, tetapi data tidak bisa dimuat ulang.')
  await expect(galatTeks(page)).not.toContainText('gagal disimpan')
  await expect(draf.getByRole('button', { name: 'Improvement Needs' })).toHaveAttribute('aria-pressed', 'true')
})

test('serah ke Improvement Needs tersimpan tetapi muat ulang gagal: pesan tersimpan', async ({ page }) => {
  let diserahkan = false
  await setup(page, {
    galat: (path) => {
      if (path === 'handoff') { diserahkan = true; return undefined }
      return diserahkan && path === 'GET /tna/review' ? galatApi(500, 'INTERNAL', 'Galat server') : undefined
    },
  })
  await page.goto(ALAMAT)
  await kartu(page, 'Tindakan perbaikan').getByRole('button', { name: 'Buat tindakan di Improvement Needs' }).click()
  await expect(galatTeks(page)).toContainText('Temuan diteruskan ke Improvement Needs dan tersimpan, tetapi data tidak bisa dimuat ulang.')
  await expect(galatTeks(page)).not.toContainText('tidak bisa diteruskan')
})

test('penugasan 409 untuk satu temuan: pesan "{judul}: …", temuan lain tetap tersimpan', async ({ page }) => {
  const T_KEDUA = 'f0000000-0000-4000-8000-000000000004'
  const sent = await setup(page, {
    temuan: [...TEMUAN_MOCKUP, { id: T_KEDUA, userId: TEMUAN_MOCKUP[0]!.userId, userName: 'Dimas', title: 'Belum terbiasa menulis laporan insiden', category: 'training', confidence: 0.8, reviewStatus: 'approved', held: false, handedOffAt: null }],
    galat: (path) => (path === 'assign plan-3' ? galatApi(409, 'ASSIGN_IN_PROGRESS', 'Penugasan rencana ini sedang dikirim. Coba lagi sebentar.') : undefined),
  })
  await page.goto(ALAMAT)
  await kartu(page, 'Solusi pelatihan').getByRole('button', { name: 'Tugaskan di EliteMentor' }).click()
  await expect(galatTeks(page)).toContainText('Praktik dan umpan balik sangat minim: Penugasan rencana ini sedang dikirim. Coba lagi sebentar.')
  await expect(galatTeks(page)).not.toContainText('Belum terbiasa menulis laporan insiden')
  expect(sent.map((s) => s.path).filter((p) => /^(plan|assign)/.test(p))).toEqual([`plan ${T_PELATIHAN}`, 'assign plan-3', `plan ${T_KEDUA}`, 'assign plan-4'])
  // yang gagal masih bisa dicoba lagi
  await expect(kartu(page, 'Solusi pelatihan').getByRole('button', { name: 'Tugaskan di EliteMentor' })).toBeVisible()
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
  // P9 IR-5: CSV di layar per gap hanya gap ini (rujukan gap ikut, tanpa tab asal)
  expect(sent.find((s) => s.path === 'export.csv')?.body).toEqual({ kind: 'competency', competencyId: ID_KOMPETENSI })
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
