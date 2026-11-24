import { test, expect, type Page } from '@playwright/test'
import { loginSebagai } from './support/sesi'
import { papanGapTna, COMP, DETAIL, ID_KOMPETENSI, ID_DIMAS, ID_PROYEK, type OpsiPapanGap } from './support/tna-gap'
import { penanganDashboardHr } from './support/dashboard'
import { cocok, mockApi, permintaanBelumDimock, responsData } from './support/api'
import { tanggalWib } from './support/tanggal'

/** Tenggat uji relatif (tanggal tetap kedaluwarsa karena batas 30 hari). */
const TENGGAT = tanggalWib(11)

// B5 Training Needs: papan gap, detail gap, dan penugasan wawancara. Spek: docs/designs/b5-training-needs.md bagian 16.
// API di-mock; flag papan dan penugasan bawaan mati di produksi, di sini dinyalakan per test.

type Opts = Partial<OpsiPapanGap> & { flags?: Record<string, boolean> }

/** Masuk lewat support/ B18 (loginSebagai + mockApi). Mengembalikan daftar permintaan tulis yang dikirim layar. */
async function setup(page: Page, { peran = 'hr', flags, ...papan }: Opts = {}) {
  const { penangan, terkirim } = papanGapTna({ ...papan, peran })
  await mockApi(page, penangan)
  await loginSebagai(page, peran, { submodules: ['cca', 'dna', 'tna', 'ina'], flags })
  return terkirim
}

const BOARD = { 'tna.gap_board': true }

// Layar tidak boleh bergantung pada endpoint yang tidak di-mock (jaring pengaman support/api.ts)
test.afterEach(({ page }) => { expect(permintaanBelumDimock(page)).toEqual([]) })

test('flag papan mati: halaman Training Needs hanya berisi pengelolaan TNA lama', async ({ page }) => {
  await setup(page)
  await page.goto('/tna')
  await expect(page.getByRole('heading', { level: 1, name: 'Training Needs' })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.getByTestId('tna-findings')).toContainText('Kesulitan analisis insiden')
})

test('alamat lama /m/tna dialihkan ke /tna', async ({ page }) => {
  await setup(page)
  await page.goto('/m/tna')
  await expect(page).toHaveURL(/\/tna$/)
  await expect(page.getByTestId('tna-findings')).toBeVisible()
})

test('HR: ringkasan KPI, tab gap kompetensi dan OKR dengan label klasifikasi', async ({ page }) => {
  await setup(page, { flags: BOARD })
  await page.goto('/tna')
  await expect(page.getByRole('tab', { name: 'Ringkasan' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('GAP KOMPETENSI', { exact: true })).toBeVisible()
  await expect(page.getByText('KONTRIBUSI 4 GAP TERBESAR', { exact: true })).toBeVisible()
  await expect(page.getByText('86%', { exact: true })).toBeVisible()
  await expect(page.getByText('2 kompetensi menunggu pengesahan HR')).toBeVisible()
  await page.getByRole('tab', { name: 'Gap kompetensi' }).click()
  const comp = page.getByRole('table', { name: 'Gap kompetensi' })
  await expect(comp).toContainText('Analisis insiden')
  await expect(comp).toContainText('Belum diwawancarai')
  await expect(comp.getByRole('columnheader', { name: 'Status wawancara' })).toBeVisible()
  await expect(comp).toContainText('0 selesai · 1 berjalan')
  await page.getByRole('tab', { name: 'Gap OKR' }).click()
  const okr = page.getByRole('table', { name: 'Gap OKR' })
  await expect(okr).toContainText('Waktu respons')
  await expect(okr).toContainText('Perlu ditinjau HR')
  // P5 TN-2: pengelolaan lama tidak lagi di bawah papan
  await expect(page.getByTestId('tna-findings')).toHaveCount(0)
})

test('HR: klik gap membuka detail, lalu tugaskan wawancara untuk karyawan terpilih', async ({ page }) => {
  const sent = await setup(page, { flags: { ...BOARD, 'tna.interview_assignment': true } })
  await page.goto('/tna?tab=kompetensi')
  await page.getByRole('link', { name: 'Analisis insiden' }).click()
  await expect(page).toHaveURL(/\/tna\/gap\?/)
  await expect(page.getByRole('heading', { level: 1, name: 'Analisis insiden' })).toBeVisible()
  await expect(page.getByText('3 dari 4 karyawan yang dinilai berada di bawah target.')).toBeVisible()
  await expect(page.getByText('Materi pelatihan belum mencakup langkah ini.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Langsung ke tinjauan HR' })).toBeVisible()

  // P8 R2: formulir penugasan dibuka di dialog dari CTA
  await page.getByRole('button', { name: 'Mulai wawancara akar masalah' }).click()
  const form = page.getByRole('form', { name: 'Tugaskan wawancara' })
  // Sari sudah punya sesi terbuka, jadi tidak bisa dicentang
  await expect(form.getByRole('checkbox', { name: 'Sari' })).toHaveCount(0)
  await form.getByRole('checkbox', { name: 'Dimas' }).check()
  await form.getByLabel('Tenggat').fill(TENGGAT)
  await form.getByRole('radio', { name: '15 menit' }).check()
  await form.getByRole('button', { name: 'Tugaskan wawancara' }).click()
  await expect(page.getByRole('status')).toContainText('1 wawancara ditugaskan')
  expect(sent.find((s) => s.path === '/assignments')?.body).toEqual({
    projectId: ID_PROYEK, gap: { kind: 'competency', competencyId: ID_KOMPETENSI }, mode: 'affected', employeeIds: [ID_DIMAS], dueDate: TENGGAT, durationMinutes: 15,
  })
})

test('HR: galat penugasan dari API ditampilkan', async ({ page }) => {
  await setup(page, {
    flags: { ...BOARD, 'tna.interview_assignment': true },
    assign: { status: 400, json: { error: { code: 'DUE_DATE_OUT_OF_RANGE', message: 'Tenggat paling cepat besok dan paling lama 30 hari lagi' } } },
  })
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}`)
  await page.getByRole('button', { name: 'Mulai wawancara akar masalah' }).click()
  const form = page.getByRole('form', { name: 'Tugaskan wawancara' })
  await form.getByLabel('Tenggat').fill(TENGGAT)
  await form.getByRole('button', { name: 'Tugaskan wawancara' }).click()
  await expect(page.getByRole('alert').getByRole('link', { name: /Tenggat paling cepat besok/ })).toBeVisible()
})

test('HR: tenggat kosong ditolak di peramban, galat menaut ke field', async ({ page }) => {
  const sent = await setup(page, { flags: { ...BOARD, 'tna.interview_assignment': true } })
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}`)
  await page.getByRole('button', { name: 'Mulai wawancara akar masalah' }).click()
  const form = page.getByRole('form', { name: 'Tugaskan wawancara' })
  // tenggat terisi +14 hari (keputusan user 24 Nov); dikosongkan dulu untuk menguji penolakan
  await form.getByLabel('Tenggat').fill('')
  await form.getByRole('button', { name: 'Tugaskan wawancara' }).click()
  await expect(page.getByRole('alert').getByRole('link', { name: 'Pilih tenggat wawancara' })).toBeVisible()
  await expect(form.getByLabel('Tenggat')).toHaveAttribute('aria-invalid', 'true')
  expect(sent.some((s) => s.path === '/assignments')).toBe(false)
})

test('atasan: penugasan dari HR tidak bisa dibatalkan, tombol tinjauan HR tidak ada', async ({ page }) => {
  await setup(page, { peran: 'atasan', flags: { ...BOARD, 'tna.interview_assignment': true } })
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Analisis insiden' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Langsung ke tinjauan HR' })).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'Semua karyawan di jabatan' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Batalkan penugasan Sari' })).toHaveCount(0)
})

test('HR membatalkan penugasan; penolakan API tampil di ringkasan galat', async ({ page }) => {
  const sent = await setup(page, {
    flags: { ...BOARD, 'tna.interview_assignment': true },
    cancel: { status: 409, json: { error: { code: 'INVALID_STATE', message: 'Wawancara sudah dimulai, penugasan tidak bisa dibatalkan' } } },
  })
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}`)
  await page.getByRole('button', { name: 'Batalkan penugasan Sari' }).click()
  await expect(page.getByRole('alert')).toContainText('Wawancara sudah dimulai')
  expect(sent.some((s) => s.path === '/api/tna/assignments/s-open/cancel')).toBe(true)
})

// Paritas P3 (docs/designs/paritas-mockup/p3-komponen-bersama.md)
test('P3 TN-1: kartu Agen AI di atas subjudul, tombol Contoh wawancara ke daftar wawancara', async ({ page }) => {
  await setup(page, { flags: BOARD })
  await page.goto('/tna')
  await expect(page.getByRole('navigation', { name: 'Lokasi' })).toHaveText(/Learning Needs Analysis\s*›\s*Training Needs/)
  const kartu = page.getByTestId('tna-agen')
  await expect(kartu.getByRole('heading', { name: 'Agen AI · Wawancara akar masalah' })).toBeVisible()
  await expect(kartu).toContainText('Pilot')
  await expect(kartu).toContainText('Setiap gap kompetensi diwawancarai AI untuk mencari akar masalah, lalu diklasifikasikan ke Training Needs atau Improvement Needs. Penugasan wawancara mengikuti alur HR, atasan, karyawan.')
  await expect(kartu.getByRole('link', { name: 'Contoh wawancara' })).toHaveAttribute('href', '/iv')
})

test('P3 TN-7: kolom Kode pertama; klik di mana pun pada baris membuka detail gap; tautan nama bisa difokus', async ({ page }) => {
  await setup(page, { flags: BOARD })
  await page.goto('/tna?tab=kompetensi')
  const comp = page.getByRole('table', { name: 'Gap kompetensi' })
  await expect(comp.getByRole('columnheader').first()).toHaveText('Kode')
  const baris = comp.getByRole('row', { name: /Analisis insiden/ })
  await expect(baris.getByRole('cell').first()).toHaveText('ST-A2')
  await baris.getByRole('cell', { name: '75', exact: true }).click()
  await expect(page).toHaveURL(/\/tna\/gap\?/)
  await expect(page.getByRole('heading', { level: 1, name: 'Analisis insiden' })).toBeVisible()
  const crumb = page.getByRole('navigation', { name: 'Lokasi' })
  await expect(crumb).toHaveText(/Training Needs\s*›\s*Detail gap/)
  await crumb.getByRole('link', { name: 'Training Needs' }).click()
  await expect(page).toHaveURL(/tab=kompetensi/)
  await comp.getByRole('link', { name: 'Analisis insiden' }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/tna\/gap\?/)
})

test('P3 review: Ctrl-klik atau klik tengah di sel non-tautan membuka tab baru, halaman ini tetap', async ({ page, context }) => {
  await setup(page, { flags: BOARD })
  await page.goto('/tna?tab=kompetensi')
  const sel = page.getByRole('table', { name: 'Gap kompetensi' }).getByRole('row', { name: /Analisis insiden/ }).getByRole('cell', { name: '75', exact: true })
  const [tabCtrl] = await Promise.all([context.waitForEvent('page'), sel.click({ modifiers: ['ControlOrMeta'] })])
  await expect.poll(() => tabCtrl.url()).toMatch(/\/tna\/gap\?/)
  await expect(page).toHaveURL(/tab=kompetensi/)
  const [tabTengah] = await Promise.all([context.waitForEvent('page'), sel.click({ button: 'middle' })])
  await expect.poll(() => tabTengah.url()).toMatch(/\/tna\/gap\?/)
  await expect(page).toHaveURL(/tab=kompetensi/)
})

test('P3: baris gap OKR juga bisa diklik', async ({ page }) => {
  await setup(page, { flags: BOARD })
  await page.goto('/tna?tab=okr')
  await page.getByRole('table', { name: 'Gap OKR' }).getByRole('row', { name: /Waktu respons/ }).getByRole('cell').last().click()
  await expect(page).toHaveURL(/\/tna\/gap\?.*kind=okr/)
})

test('flag penugasan mati: detail gap tanpa formulir penugasan', async ({ page }) => {
  await setup(page, { flags: BOARD })
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Analisis insiden' })).toBeVisible()
  await expect(page.getByRole('form', { name: 'Tugaskan wawancara' })).toHaveCount(0)
})

// Paritas P5 (docs/designs/paritas-mockup/p5-lna.md)
// ImportPanel bersama (B0 kode bersama) dikecualikan; lihat p5-lna.md "Tidak dikerjakan"
test('P5 TN-2: papan menyala, pengelolaan TNA pindah ke /tna/kelola lewat tautan Kelola TNA, tanpa gaya Tailwind', async ({ page }) => {
  await setup(page, { flags: BOARD })
  await page.goto('/tna')
  await expect(page.getByRole('tab', { name: 'Ringkasan' })).toBeVisible()
  await expect(page.getByTestId('tna-findings')).toHaveCount(0)
  await expect(page.getByText('Pengelolaan TNA')).toHaveCount(0)
  await page.getByRole('link', { name: 'Kelola TNA' }).click()
  await expect(page).toHaveURL(/\/tna\/kelola$/)
  await expect(page.getByRole('navigation', { name: 'Lokasi' })).toHaveText(/Learning Needs Analysis\s*›\s*Training Needs\s*›\s*Kelola TNA/)
  await expect(page.getByRole('heading', { level: 1, name: 'Kelola TNA' })).toBeVisible()
  await expect(page.getByTestId('tna-findings')).toContainText('Kesulitan analisis insiden')
  await expect(page.getByTestId('tna-stats')).toBeVisible()
  const tailwind = await page.locator('main [class]').evaluateAll((els) => els.filter((e) => !e.closest('[data-import-panel]')).map((e) => e.getAttribute('class') ?? '').filter((c) => /\b(slate-|bg-white|text-blue|rounded-lg|border-amber|text-sm|mt-4)/.test(c)))
  expect(tailwind).toEqual([])
  await page.getByRole('navigation', { name: 'Lokasi' }).getByRole('link', { name: 'Training Needs' }).click()
  await expect(page).toHaveURL(/\/tna$/)
})

test('P5 TN-2: papan mati, pengelolaan tetap di /tna tanpa gaya Tailwind', async ({ page }) => {
  await setup(page)
  await page.goto('/tna')
  await expect(page.getByTestId('tna-findings')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Kelola TNA' })).toHaveCount(0)
  const tailwind = await page.locator('main [class]').evaluateAll((els) => els.filter((e) => !e.closest('[data-import-panel]')).map((e) => e.getAttribute('class') ?? '').filter((c) => /\b(slate-|bg-white|text-blue|rounded-lg|text-sm|mt-4)/.test(c)))
  expect(tailwind).toEqual([])
})

test('P5 TN-3/TN-5/TN-9/TN-10/TN-12: copy KPI dan note mockup, tombol Lihat gap kompetensi, bar gap di bawah 20 tidak merah', async ({ page }) => {
  await setup(page, { flags: BOARD })
  await page.goto('/tna')
  await expect(page.getByText('terhadap Job Competency Model', { exact: true })).toBeVisible()
  await expect(page.getByText('key result di bawah target', { exact: true })).toBeVisible()
  await expect(page.getByText('dari 3 gap', { exact: true })).toBeVisible()
  await expect(page.getByText('dari total gap kompetensi', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Lihat gap kompetensi' }).click()
  await expect(page.getByRole('tab', { name: 'Gap kompetensi' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('note')).toContainText('Job Competency Model')
  await expect(page.getByRole('note')).toContainText('Klik baris untuk membuka detail')
  const bar = page.getByRole('progressbar', { name: 'Gap Analisis insiden' })
  await expect(bar).not.toHaveClass(/el-bar--critical/)
  await expect(bar).toHaveAttribute('aria-valuenow', '100')
  await page.getByRole('tab', { name: 'Gap OKR' }).click()
  await expect(page.getByRole('note')).toContainText('pencapaian OKR operasional')
})

// Triase review independen P5 (p5-code-review.md, bagian "Review independen")
test('P5 triase M1: papan menyala, HR tetap melihat catatan temuan AI menunggu review di /tna', async ({ page }) => {
  await setup(page, { flags: BOARD, reviewPending: 3 })
  await page.goto('/tna')
  const note = page.getByTestId('tna-review-ringkas')
  await expect(note).toContainText('3 temuan AI dari wawancara TNA menunggu review')
  await expect(note.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/m/tna/review')
})

// P9 CD-4 (B0 5.1): izin HR dibaca dari session.roles, bukan peran utama; akun atasan yang juga HR melihat bagian HR
test('P9 CD-4: akun multi-peran (atasan utama + HR) di tampilan HR melihat catatan review dan bagian HR', async ({ page }) => {
  const { penangan } = papanGapTna({ peran: 'atasan', reviewPending: 3 })
  await mockApi(page, penangan)
  await mockApi(page, penanganDashboardHr)
  await loginSebagai(page, 'atasan', { submodules: ['cca', 'dna', 'tna', 'ina'], flags: { ...BOARD, 'dashboard.main': true }, peranLain: ['hr'] })
  const tampilan = page.getByRole('group', { name: 'Tampilan' })
  await tampilan.getByRole('button', { name: 'HR / L&D' }).click()
  await expect(tampilan.getByRole('button', { name: 'HR / L&D' })).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/tna')
  await expect(page.getByTestId('tna-review-ringkas')).toContainText('3 temuan AI dari wawancara TNA menunggu review')
  await page.goto('/tna/kelola')
  await expect(page.getByTestId('tna-review-banner')).toContainText('3 temuan AI dari wawancara TNA menunggu review')
  await expect(page.getByTestId('tna-review-banner').getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/m/tna/review')
})

test('P5 triase M1: tanpa temuan menunggu review, catatan tidak tampil', async ({ page }) => {
  await setup(page, { flags: BOARD })
  await page.goto('/tna')
  await expect(page.getByRole('tab', { name: 'Ringkasan' })).toBeVisible()
  await expect(page.getByTestId('tna-review-ringkas')).toHaveCount(0)
})

test('P5 triase: /tna/kelola dengan papan mati dialihkan ke /tna', async ({ page }) => {
  await setup(page)
  await page.goto('/tna/kelola')
  await expect(page).toHaveURL(/\/tna$/)
  await expect(page.getByTestId('tna-findings')).toBeVisible()
})

test('P5 triase M2: karyawan membuka /tna/kelola langsung, hasilnya sama dengan /tna (pengelolaan di /tna)', async ({ page }) => {
  await setup(page, { peran: 'karyawan', flags: BOARD })
  await page.goto('/tna')
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.getByTestId('tna-findings')).toBeVisible()
  await page.goto('/tna/kelola')
  await expect(page).toHaveURL(/\/tna$/)
  await expect(page.getByTestId('tna-findings')).toBeVisible()
})

test('P5 triase M2: atasan dengan papan menyala bisa membuka /tna/kelola', async ({ page }) => {
  await setup(page, { peran: 'atasan', flags: BOARD })
  await page.goto('/tna/kelola')
  await expect(page).toHaveURL(/\/tna\/kelola$/)
  await expect(page.getByTestId('tna-findings')).toBeVisible()
})

test('P5 triase M2: submodul tna tidak dilanggan, /tna/kelola diarahkan ke beranda seperti /tna', async ({ page }) => {
  const { penangan } = papanGapTna({ peran: 'hr' })
  await mockApi(page, penangan)
  await loginSebagai(page, 'hr', { submodules: ['cca', 'dna', 'ina'], flags: BOARD })
  await page.goto('/tna')
  await expect(page).not.toHaveURL(/\/tna/)
  const home = new URL(page.url()).pathname
  await page.goto('/tna/kelola')
  await expect(page).not.toHaveURL(/\/tna/)
  expect(new URL(page.url()).pathname).toBe(home)
})

test('P5 triase TN-12: "pencapaian OKR" tebal seperti mockup', async ({ page }) => {
  await setup(page, { flags: BOARD })
  await page.goto('/tna?tab=okr')
  await expect(page.getByRole('note').locator('b', { hasText: 'pencapaian OKR' })).toBeVisible()
})

// Paritas P8 (docs/designs/paritas-mockup/p8-keputusan-r1-r22.md)
test('P8 R2 TD-5: CTA satu baris; formulir penugasan dibuka di dialog dan perilakunya tetap', async ({ page }) => {
  const sent = await setup(page, { flags: { ...BOARD, 'tna.interview_assignment': true } })
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}`)
  const cta = page.getByTestId('tna-cta')
  await expect(cta.getByRole('heading', { name: 'Cari akar masalah' })).toBeVisible()
  await expect(cta.getByRole('link', { name: 'Langsung ke tinjauan HR' })).toBeVisible()
  // teks kiri, tombol kanan dalam satu baris
  const teks = (await cta.getByRole('heading', { name: 'Cari akar masalah' }).boundingBox())!
  const tombol = (await cta.getByRole('button', { name: 'Mulai wawancara akar masalah' }).boundingBox())!
  expect(tombol.x).toBeGreaterThan(teks.x + 200)
  expect(Math.abs(tombol.y - teks.y)).toBeLessThan(40)
  await expect(page.getByRole('form', { name: 'Tugaskan wawancara' })).toHaveCount(0)

  await cta.getByRole('button', { name: 'Mulai wawancara akar masalah' }).click()
  const dialog = page.getByRole('dialog', { name: 'Tugaskan wawancara akar masalah' })
  await expect(dialog).toBeVisible()
  const form = dialog.getByRole('form', { name: 'Tugaskan wawancara' })
  await form.getByLabel('Tenggat').fill('')
  await form.getByRole('button', { name: 'Tugaskan wawancara' }).click()
  await expect(dialog.getByRole('alert').getByRole('link', { name: 'Pilih tenggat wawancara' })).toBeVisible()
  await form.getByRole('checkbox', { name: 'Dimas' }).check()
  await form.getByLabel('Tenggat').fill(TENGGAT)
  await form.getByRole('button', { name: 'Tugaskan wawancara' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('1 wawancara ditugaskan')
  expect(sent.find((s) => s.path === '/assignments')?.body).toEqual({
    projectId: ID_PROYEK, gap: { kind: 'competency', competencyId: ID_KOMPETENSI }, mode: 'affected', employeeIds: [ID_DIMAS], dueDate: TENGGAT, durationMinutes: 30,
  })
})

test('P8 R2: dialog penugasan bisa ditutup dengan tombol Tutup dan Esc', async ({ page }) => {
  await setup(page, { flags: { ...BOARD, 'tna.interview_assignment': true } })
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}`)
  const buka = page.getByRole('button', { name: 'Mulai wawancara akar masalah' })
  await buka.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await buka.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('P8 review: galat jaringan saat menugaskan tampil di dialog, bukan di balik latar modal', async ({ page }) => {
  await setup(page, { flags: { ...BOARD, 'tna.interview_assignment': true } })
  await page.route('**/assignments', (r) => (r.request().method() === 'POST' ? r.abort() : r.fallback()))
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}`)
  await page.getByRole('button', { name: 'Mulai wawancara akar masalah' }).click()
  const dialog = page.getByRole('dialog', { name: 'Tugaskan wawancara akar masalah' })
  const form = dialog.getByRole('form', { name: 'Tugaskan wawancara' })
  await form.getByRole('checkbox', { name: 'Dimas' }).check()
  await form.getByLabel('Tenggat').fill(TENGGAT)
  await form.getByRole('button', { name: 'Tugaskan wawancara' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Penugasan gagal')
  await dialog.getByRole('button', { name: 'Tutup' }).click()
  await expect(page.getByRole('alert')).toContainText('Penugasan gagal')
})

test('P8 R4: skor 0-100 tanpa "%", desimal koma; R6: selisih OKR merah', async ({ page }) => {
  await setup(page, { flags: BOARD })
  await page.goto('/tna?tab=kompetensi')
  const comp = page.getByRole('table', { name: 'Gap kompetensi' })
  const baris = comp.getByRole('row', { name: /Analisis insiden/ })
  await expect(baris.getByRole('cell').nth(2)).toHaveText('75')
  await expect(baris.getByRole('cell').nth(3)).toHaveText('56')
  await expect(comp).not.toContainText('%')
  await page.getByRole('tab', { name: 'Gap OKR' }).click()
  const okr = page.getByRole('table', { name: 'Gap OKR' }).getByRole('row', { name: /Waktu respons/ })
  await expect(okr.getByRole('cell').nth(2)).toHaveText('22,5 menit')
  const selisih = okr.getByRole('cell').nth(3)
  await expect(selisih).toHaveText('7,5 menit')
  await expect(selisih.locator('.tna-diff')).toHaveCSS('color', 'rgb(179, 38, 30)')
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}`)
  await expect(page.locator('.el-kpi').filter({ hasText: 'TARGET' })).toContainText(/TARGET\s*75$/)
  await expect(page.locator('.el-kpi').filter({ hasText: 'GAP' })).toContainText(/GAP\s*−19$/)
})

// Triase review independen P8 (docs/designs/paritas-mockup/egm/p8-code-review.md)
test('P8 triase #4/#7: fokus awal di field pertama, Tab tetap di dialog, fokus kembali ke CTA setelah Tutup dan Esc', async ({ page }) => {
  await setup(page, { flags: { ...BOARD, 'tna.interview_assignment': true } })
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}`)
  const buka = page.getByRole('button', { name: 'Mulai wawancara akar masalah' })
  await buka.click()
  const dialog = page.getByRole('dialog', { name: 'Tugaskan wawancara akar masalah' })
  await expect(dialog.getByLabel('Proyek')).toBeFocused()
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((d) => d.contains(d.ownerDocument.activeElement))).toBe(true)
  }
  await dialog.getByRole('button', { name: 'Tutup' }).click()
  await expect(buka).toBeFocused()
  await buka.click()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(buka).toBeFocused()
})

test('P8 triase #5: skor ≥1000 memakai pemisah ribuan; tanda minus dari nilai, tanpa "−-" atau "−0"', async ({ page }) => {
  await setup(page, { flags: { ...BOARD, 'tna.interview_assignment': true } })
  await mockApi(page, (req) => {
    if (cocok(req, 'GET /tna/gaps/competencies')) return responsData({ rows: [{ ...COMP, targetPct: 1250, gapPct: 0 }], unapprovedCompetencies: 0 })
    if (cocok(req, 'GET /tna/gaps/detail')) return responsData({ ...DETAIL, targetPct: 1250, gapPct: -5 })
    return undefined
  })
  await page.goto('/tna?tab=kompetensi')
  const baris = page.getByRole('table', { name: 'Gap kompetensi' }).getByRole('row', { name: /Analisis insiden/ })
  await expect(baris.getByRole('cell').nth(2)).toHaveText('1.250')
  await expect(baris.getByRole('cell').nth(4)).toHaveText('0')
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}`)
  await expect(page.locator('.el-kpi').filter({ hasText: 'TARGET' })).toContainText(/TARGET\s*1\.250$/)
  await expect(page.locator('.el-kpi').filter({ hasText: 'GAP' })).toContainText(/GAP\s*5$/)
})

test('P8 triase #6: galat muat data penugasan tidak hilang saat dialog dibuka dan ditutup', async ({ page }) => {
  await setup(page, { flags: { ...BOARD, 'tna.interview_assignment': true } })
  await mockApi(page, (req) => (cocok(req, 'GET /projects') ? { status: 500, json: { error: { code: 'X', message: 'Proyek tidak bisa dimuat' } } } : undefined))
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}`)
  await expect(page.getByRole('alert')).toContainText('Proyek tidak bisa dimuat')
  await page.getByRole('button', { name: 'Mulai wawancara akar masalah' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click()
  await expect(page.getByRole('alert')).toContainText('Proyek tidak bisa dimuat')
})

test('Keputusan user 23 Nov: atasan dengan papan menyala melihat "Wawancara untuk Anda" di bawah papan', async ({ page }) => {
  await setup(page, { peran: 'atasan', flags: BOARD })
  await mockApi(page, (req) => (cocok(req, 'GET /tna/sessions')
    ? responsData([{ id: 's9', projectId: ID_PROYEK, intervieweeId: 'u-atasan', intervieweeName: 'Pengguna Contoh', status: 'scheduled', triggerCount: 1, inviteExpiresAt: '2026-12-31T16:59:59.000Z' }])
    : undefined))
  await page.goto('/tna')
  await expect(page.getByRole('tab', { name: 'Ringkasan' })).toBeVisible()
  const kartu = page.getByTestId('tna-my-sessions')
  await expect(kartu.getByRole('heading', { name: 'Wawancara untuk Anda' })).toBeVisible()
  await expect(kartu.getByRole('link', { name: 'Mulai wawancara' })).toHaveAttribute('href', '/iv/s9')
  // tata letak papan tetap: kartu di bawah panel tab dan tautan Kelola TNA
  const kelola = (await page.getByRole('link', { name: 'Kelola TNA' }).boundingBox())!
  expect((await kartu.boundingBox())!.y).toBeGreaterThan(kelola.y)
})

test('Keputusan user 23 Nov: HR dengan papan menyala tanpa sesi sendiri tidak melihat kartu "Wawancara untuk Anda"', async ({ page }) => {
  await setup(page, { flags: BOARD })
  await page.goto('/tna')
  await expect(page.getByRole('tab', { name: 'Ringkasan' })).toBeVisible()
  await expect(page.getByTestId('tna-my-sessions')).toHaveCount(0)
})

test('keputusan user 24 Nov: tenggat terisi hari ini +14 (WIB) seperti dialog B10, terkirim tanpa diubah', async ({ page }) => {
  const sent = await setup(page, { flags: { ...BOARD, 'tna.interview_assignment': true } })
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}`)
  await page.getByRole('button', { name: 'Mulai wawancara akar masalah' }).click()
  const form = page.getByRole('form', { name: 'Tugaskan wawancara' })
  await expect(form.getByLabel('Tenggat')).toHaveValue(tanggalWib(14))
  await form.getByRole('checkbox', { name: 'Dimas' }).check()
  await form.getByRole('button', { name: 'Tugaskan wawancara' }).click()
  await expect(page.getByRole('status')).toContainText('1 wawancara ditugaskan')
  expect(sent.find((s) => s.path === '/assignments')?.body).toMatchObject({ dueDate: tanggalWib(14) })
})

test('review egm TD-2: GAP tidak merah bila tidak ada gap (gap kompetensi 0, OKR tanpa karyawan meleset)', async ({ page }) => {
  await setup(page, { flags: BOARD })
  // didaftarkan setelah papan supaya menang (penangan terakhir didahulukan)
  await mockApi(page, (req) => (cocok(req, 'GET /tna/gaps/detail') ? responsData({ ...DETAIL, gap: 0, gapPct: 0, actualPct: 75, peopleWithGap: 0 }) : undefined))
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}`)
  const gap = page.locator('.el-kpi').filter({ hasText: 'GAP' }).locator('.el-kpi__value')
  await expect(gap).toBeVisible()
  await expect(gap).not.toHaveClass(/el-kpi__value--critical/)
})

test('paritas TD-2/TD-3: nilai GAP merah; bukti dan hipotesis berupa baris ikon bergaris pemisah, tanpa poin', async ({ page }) => {
  await setup(page, { flags: BOARD })
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Analisis insiden' })).toBeVisible()
  const gap = page.locator('.el-kpi').filter({ hasText: 'GAP' })
  await expect(gap.locator('.el-kpi__value')).toHaveCSS('color', 'rgb(179, 38, 30)')
  const bukti = page.getByRole('list', { name: 'Bukti yang terdeteksi' })
  await expect(bukti.getByRole('listitem')).toHaveText(['3 dari 4 karyawan yang dinilai berada di bawah target.'])
  await expect(bukti.getByRole('listitem').locator('svg')).toHaveCount(1)
  await expect(bukti.getByRole('listitem').first()).toHaveCSS('list-style-type', 'none')
  await expect(bukti.getByRole('listitem').first()).toHaveCSS('border-bottom-style', 'solid')
  const hipotesis = page.getByRole('list', { name: 'Hipotesis awal (belum terverifikasi)' })
  await expect(hipotesis.getByRole('listitem')).toHaveText(['Materi pelatihan belum mencakup langkah ini.'])
  await expect(hipotesis.getByRole('listitem').locator('svg')).toHaveCount(1)
})
