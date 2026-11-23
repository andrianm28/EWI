import { test, expect, type Page } from '@playwright/test'
import { loginSebagai, type Peran } from './support/sesi'
import { mockApi, permintaanBelumDimock } from './support/api'
import { sesiWawancara, type OpsiSesiWawancara } from './support/wawancara'

// B6 Wawancara akar masalah: daftar sesi dan alur persetujuan → wawancara → ringkasan → selesai.
// Spek: docs/designs/b6-wawancara-akar-masalah.md bagian 15. API di-mock.

const SUMMARY_ON = { 'tna.interview_summary': true }

type Opts = Omit<OpsiSesiWawancara, 'pemilik'> & { peran?: Peran; flags?: Record<string, boolean> }

/** Masuk lewat support/ B18 (loginSebagai + mockApi) dengan sesi s1 berstate. Mengembalikan permintaan tulis yang dikirim layar. */
async function setup(page: Page, { peran = 'karyawan', flags, ...sesi }: Opts = {}) {
  const { penangan, terkirim } = sesiWawancara({ ...sesi, pemilik: `u-${peran}` })
  await mockApi(page, penangan)
  await loginSebagai(page, peran, { submodules: ['cca', 'dna', 'tna', 'ina'], flags })
  return terkirim
}

// Layar tidak boleh bergantung pada endpoint yang tidak di-mock (jaring pengaman support/api.ts)
test.afterEach(({ page }) => { expect(permintaanBelumDimock(page)).toEqual([]) })

test('daftar wawancara menampilkan topik, durasi, tenggat, dan riwayat', async ({ page }) => {
  await setup(page)
  await page.goto('/iv')
  await expect(page.getByRole('heading', { level: 1, name: 'Wawancara akar masalah' })).toBeVisible()
  const open = page.getByTestId('iv-open')
  await expect(open).toContainText('Analisis insiden')
  await expect(open).toContainText('15 menit')
  await expect(open).toContainText('Belum mulai')
  await expect(page.getByTestId('iv-history')).toContainText('Target kerja yang belum tercapai')
  await open.getByRole('link', { name: /Analisis insiden/ }).click()
  await expect(page).toHaveURL(/\/iv\/s1$/)
})

test('persetujuan tanpa centang menampilkan ringkasan galat', async ({ page }) => {
  await setup(page, { flags: SUMMARY_ON })
  await page.goto('/iv/s1')
  await expect(page.getByText('Topik: Analisis insiden')).toBeVisible()
  // review P3: teks breadcrumb sama dengan mockup
  await expect(page.getByRole('navigation', { name: 'Lokasi' })).toHaveText(/Training Needs\s*›\s*Wawancara akar masalah/)
  await page.getByRole('button', { name: 'Lanjut ke wawancara' }).click()
  await expect(page.getByRole('alert')).toContainText('Centang persetujuan untuk melanjutkan')
  // Ringkasan galat mengambil fokus supaya dibacakan; tautannya membawa ke kotak centang
  await expect(page.getByRole('alert')).toBeFocused()
  await page.getByRole('alert').getByRole('link', { name: 'Centang persetujuan untuk melanjutkan' }).click()
  await expect(page.getByTestId('consent-check')).toBeFocused()
})

test('alur lengkap: persetujuan, jawaban, ringkasan, kirim ke HR', async ({ page }) => {
  const sent = await setup(page, { flags: SUMMARY_ON })
  await page.goto('/iv/s1')
  await page.getByTestId('consent-check').check()
  await page.getByRole('button', { name: 'Lanjut ke wawancara' }).click()
  await expect(page.getByTestId('turn-ai')).toContainText('analisis insiden terakhir')
  await expect(page.getByText('Pertanyaan 1, paling banyak 5')).toBeVisible()
  expect(sent.find((x) => x.path === 'consent')?.body).toEqual({ consentVersion: 'tna-consent-id-v1.0' })
  await page.getByLabel('Jawaban').fill('Saya belum pernah dilatih eskalasi.')
  await page.getByRole('button', { name: 'Kirim' }).click()
  await page.getByRole('button', { name: 'Lihat ringkasan temuan' }).click()
  await expect(page.getByRole('heading', { name: 'Ringkasan temuan AI' })).toBeVisible()
  await expect(page.getByText('Belum paham langkah eskalasi insiden')).toBeVisible()
  await expect(page.getByText('Keyakinan AI sementara: 80%')).toBeVisible()
  await expect(page.getByText('Perlu ditinjau HR')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Kirim dengan catatan' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Sesuai, kirim ke HR' }).click()
  await expect(page.getByText('Ringkasan sudah dikirim ke HR untuk ditinjau.')).toBeVisible()
  expect(sent.find((x) => x.path === 'confirm')?.body).toEqual({})
  await expect(page.getByText('S1ABCDEF · ELGOS-AI · log audit: persetujuan tercatat · 1 jawaban')).toBeVisible()
})

test('ulangi wawancara kembali ke langkah persetujuan', async ({ page }) => {
  const sent = await setup(page, { flags: SUMMARY_ON, state: { status: 'in_progress', summaryAt: '2026-11-20T03:00:00.000Z', turns: [{ speaker: 'ai', text: 'Q', at: '' }, { speaker: 'human', text: 'A', at: '' }] } })
  await page.goto('/iv/s1')
  await expect(page.getByRole('heading', { name: 'Ringkasan temuan AI' })).toBeVisible()
  await page.getByRole('button', { name: /Ulangi wawancara/ }).click()
  await expect(page.getByRole('button', { name: 'Lanjut ke wawancara' })).toBeVisible()
  expect(sent.some((x) => x.path === 'restart')).toBe(true)
})

test('jatah ulangi habis: kirim dengan catatan tidak sesuai', async ({ page }) => {
  const sent = await setup(page, { flags: SUMMARY_ON, state: { status: 'in_progress', restartCount: 2, summaryAt: '2026-11-20T03:00:00.000Z', turns: [{ speaker: 'ai', text: 'Q', at: '' }, { speaker: 'human', text: 'A', at: '' }] } })
  await page.goto('/iv/s1')
  await expect(page.getByRole('button', { name: /Ulangi wawancara/ })).toBeDisabled()
  await page.getByRole('button', { name: 'Kirim dengan catatan' }).click()
  await page.getByLabel('Catatan untuk HR').fill('Temuan kedua tidak sesuai, alatnya sudah diperbaiki.')
  await page.getByRole('button', { name: 'Kirim ringkasan dengan catatan' }).click()
  await expect(page.getByText('Ringkasan sudah dikirim ke HR untuk ditinjau.')).toBeVisible()
  expect(sent.find((x) => x.path === 'confirm')?.body).toEqual({ accurate: false, note: 'Temuan kedua tidak sesuai, alatnya sudah diperbaiki.' })
})

test('catatan terlalu pendek: pesan aturan panjang tampil di ringkasan galat dan field ditandai', async ({ page }) => {
  const sent = await setup(page, { flags: SUMMARY_ON, state: { status: 'in_progress', restartCount: 2, summaryAt: '2026-11-20T03:00:00.000Z', turns: [{ speaker: 'ai', text: 'Q', at: '' }, { speaker: 'human', text: 'A', at: '' }] } })
  await page.goto('/iv/s1')
  await page.getByRole('button', { name: 'Kirim dengan catatan' }).click()
  await page.getByLabel('Catatan untuk HR').fill('pendek')
  await page.getByRole('button', { name: 'Kirim ringkasan dengan catatan' }).click()
  await expect(page.getByRole('alert')).toContainText('Tulis catatan 10-1000 karakter untuk HR')
  await expect(page.getByLabel('Catatan untuk HR')).toHaveAttribute('aria-invalid', 'true')
  expect(sent.some((x) => x.path === 'confirm')).toBe(false)
})

test('ringkasan gagal dimuat: langkah sesi tetap tampil dengan galat', async ({ page }) => {
  await setup(page, {
    flags: SUMMARY_ON, summary: { status: 500, json: { error: { code: 'INTERNAL', message: 'Terjadi kesalahan' } } },
    state: { status: 'in_progress', summaryAt: '2026-11-20T03:00:00.000Z', turns: [{ speaker: 'ai', text: 'Q', at: '' }, { speaker: 'human', text: 'A', at: '' }] },
  })
  await page.goto('/iv/s1')
  await expect(page.getByRole('heading', { name: 'Ringkasan temuan AI' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Terjadi kesalahan')
})

test('flag ringkasan mati: wawancara ditutup dengan tombol lama', async ({ page }) => {
  const sent = await setup(page, { state: { status: 'in_progress', turns: [{ speaker: 'ai', text: 'Q', at: '' }] } })
  await page.goto('/iv/s1')
  await expect(page.getByRole('button', { name: 'Lihat ringkasan temuan' })).toHaveCount(0)
  await page.getByLabel('Jawaban').fill('Jawaban saya.')
  await page.getByRole('button', { name: 'Kirim' }).click()
  await page.getByRole('button', { name: 'Selesai dan kirim' }).click()
  await expect.poll(() => sent.some((x) => x.path === 'complete')).toBe(true)
})

test('HR membuka sesi orang lain: percakapan tidak tampil', async ({ page }) => {
  await setup(page, { peran: 'hr', interviewee: false, state: { status: 'completed' } })
  await page.goto('/iv/s1')
  await expect(page.getByTestId('transcript-private')).toHaveText('Percakapan wawancara hanya bisa dibaca karyawan yang bersangkutan.')
  await expect(page.getByText('Status: Selesai')).toBeVisible()
  await expect(page.getByTestId('turn-human')).toHaveCount(0)
})

test('alamat lama /m/tna/sessions/:id dialihkan ke /iv/:id', async ({ page }) => {
  await setup(page, { flags: SUMMARY_ON })
  await page.goto('/m/tna/sessions/s1')
  await expect(page).toHaveURL(/\/iv\/s1$/)
})

// B8: transkrip hanya untuk yang diwawancarai (PO-6 A) kini bisa dibaca setelah sesi selesai atau dibatalkan
const TRANSKRIP = [
  { speaker: 'ai' as const, text: 'Ceritakan analisis insiden terakhir yang Anda kerjakan.', at: '' },
  { speaker: 'human' as const, text: 'Saya belum pernah dilatih eskalasi.', at: '' },
]

test('sesi selesai menampilkan transkrip read-only untuk yang diwawancarai', async ({ page }) => {
  await setup(page, { state: { status: 'completed', turns: TRANSKRIP } })
  await page.goto('/iv/s1')
  const transkrip = page.getByRole('region', { name: 'Transkrip' })
  await expect(transkrip).toContainText('Saya belum pernah dilatih eskalasi.')
  await expect(transkrip.getByRole('textbox')).toHaveCount(0)
})

test('sesi yang persetujuannya ditarik menyebut penarikan, bukan sekadar dibatalkan', async ({ page }) => {
  await setup(page, { state: { status: 'abandoned', turns: TRANSKRIP }, withdrawnAt: '2026-11-20T03:00:00.000Z' })
  await page.goto('/iv/s1')
  await expect(page.getByText('Persetujuan Anda untuk wawancara ini sudah ditarik.')).toBeVisible()
  await expect(page.getByText('Sesi ini dibatalkan.')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Transkrip' })).toContainText('Saya belum pernah dilatih eskalasi.')
})

test('sesi selesai yang persetujuannya kemudian ditarik juga menyebut penarikan', async ({ page }) => {
  await setup(page, { state: { status: 'completed', summaryConfirmedAt: '2026-11-19T03:00:00.000Z', turns: TRANSKRIP }, withdrawnAt: '2026-11-20T03:00:00.000Z' })
  await page.goto('/iv/s1')
  await expect(page.getByText('Persetujuan Anda untuk wawancara ini sudah ditarik.')).toBeVisible()
  await expect(page.getByText('Ringkasan sudah dikirim ke HR untuk ditinjau.')).toHaveCount(0)
})
