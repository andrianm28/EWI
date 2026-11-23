import { test, expect, type Page } from '@playwright/test'
import { loginSebagai } from './support/sesi'
import { mockApi, permintaanBelumDimock } from './support/api'
import { papanGapTna, ID_KOMPETENSI, ID_DIMAS, ID_PROYEK, type OpsiPapanGap } from './support/tna-gap'

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

  const form = page.getByRole('form', { name: 'Tugaskan wawancara' })
  // Sari sudah punya sesi terbuka, jadi tidak bisa dicentang
  await expect(form.getByRole('checkbox', { name: 'Sari' })).toHaveCount(0)
  await form.getByRole('checkbox', { name: 'Dimas' }).check()
  await form.getByLabel('Tenggat').fill('2026-12-05')
  await form.getByRole('radio', { name: '15 menit' }).check()
  await form.getByRole('button', { name: 'Tugaskan wawancara' }).click()
  await expect(page.getByRole('status')).toContainText('1 wawancara ditugaskan')
  expect(sent.find((s) => s.path === '/assignments')?.body).toEqual({
    projectId: ID_PROYEK, gap: { kind: 'competency', competencyId: ID_KOMPETENSI }, mode: 'affected', employeeIds: [ID_DIMAS], dueDate: '2026-12-05', durationMinutes: 15,
  })
})

test('HR: galat penugasan dari API ditampilkan', async ({ page }) => {
  await setup(page, {
    flags: { ...BOARD, 'tna.interview_assignment': true },
    assign: { status: 400, json: { error: { code: 'DUE_DATE_OUT_OF_RANGE', message: 'Tenggat paling cepat besok dan paling lama 30 hari lagi' } } },
  })
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}`)
  const form = page.getByRole('form', { name: 'Tugaskan wawancara' })
  await form.getByLabel('Tenggat').fill('2026-12-05')
  await form.getByRole('button', { name: 'Tugaskan wawancara' }).click()
  await expect(page.getByRole('alert').getByRole('link', { name: /Tenggat paling cepat besok/ })).toBeVisible()
})

test('HR: tenggat kosong ditolak di peramban, galat menaut ke field', async ({ page }) => {
  const sent = await setup(page, { flags: { ...BOARD, 'tna.interview_assignment': true } })
  await page.goto(`/tna/gap?kind=competency&competencyId=${ID_KOMPETENSI}`)
  const form = page.getByRole('form', { name: 'Tugaskan wawancara' })
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
  await baris.getByRole('cell', { name: '75%' }).click()
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
  const sel = page.getByRole('table', { name: 'Gap kompetensi' }).getByRole('row', { name: /Analisis insiden/ }).getByRole('cell', { name: '75%' })
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
