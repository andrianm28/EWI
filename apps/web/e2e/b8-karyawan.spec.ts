import { test, expect, type Page } from '@playwright/test'
import { loginSebagai, type OpsiSesi, type Peran } from './support/sesi'
import { mockApi, mockApiDasar, cocok, type ResponsApi } from './support/api'
import { penanganHasilSaya } from './support/hasil-saya'

// B8 layar web: "Hasil saya" (rute my) dan "Rencana belajar" (rute li). Spek: docs/designs/b8-karyawan.md "Layar web".
// API di-mock lewat support/ B18.

const ON = { 'learner.home': true }
const data = (d: unknown, status = 200): ResponsApi => ({ status, json: { data: d } })

async function masuk(page: Page, peran: Peran = 'karyawan', opsi: OpsiSesi = {}, over: Record<string, unknown> = {}) {
  const me = `u-${peran}`
  // Penangan dasar: kalah dari mockApi milik test, apa pun urutannya
  await mockApiDasar(page, penanganHasilSaya(me, over))
  return loginSebagai(page, peran, { ...opsi, flags: { ...ON, ...opsi.flags } })
}

test('karyawan mendarat di Hasil saya dengan skor vs target dan status kompetensi', async ({ page }) => {
  await masuk(page)
  await expect(page).toHaveURL(/\/my$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Hasil saya' })).toBeVisible()
  await expect(page.getByText('Posisi: Engineer Service Delivery · L1.')).toBeVisible()
  const tabel = page.getByRole('table')
  await expect(tabel.getByRole('row', { name: /ST-B4.*Manajemen tiket.*3 \/ 3.*Menguasai/ })).toBeVisible()
  await expect(tabel.getByRole('row', { name: /—.*Analisis insiden.*3 \/ 4.*Sebagian/ })).toBeVisible()
  await expect(tabel.getByRole('row', { name: /TC-I1.*Otomasi infrastruktur.*1 \/ 4.*Belum/ })).toBeVisible()
  await expect(tabel.getByRole('row', { name: /ST-A2.*Komunikasi pelanggan.*— \/ 2.*Belum dinilai/ })).toBeVisible()
})

test('menu karyawan sesuai mockup, tanpa butir peralihan; undangan membuka sesi', async ({ page }) => {
  await masuk(page)
  const nav = page.getByRole('navigation', { name: 'Navigasi utama' })
  await expect(nav.getByRole('link')).toHaveText(['Hasil saya', 'Wawancara visi & nilai', 'Wawancara akar masalah', 'Rencana belajar'])
  const undangan = page.getByTestId('my-invitations')
  await expect(undangan).toContainText('bukan untuk penilaian kinerja')
  await expect(undangan).toContainText('Tenggat')
  // paritas: catatan undangan berjarak 20px dari bagian berikutnya (.b8-list tidak menimpa .b8-sub)
  await expect(undangan).toHaveCSS('margin-bottom', '20px')
  await undangan.getByRole('link', { name: 'Mulai wawancara' }).click()
  await expect(page).toHaveURL(/\/iv\/s1$/)
})

test('undangan berjalan bisa dilanjutkan; undangan lewat tanpa tombol', async ({ page }) => {
  await masuk(page, 'karyawan', {}, {
    invitations: [
      { sessionId: 's2', submodule: 'tna', status: 'in_progress', inviteExpiresAt: '2026-11-01T16:59:59.000Z', expired: true, canStart: false, canContinue: true, consentVersionRequired: null },
      { sessionId: 's3', submodule: 'tna', status: 'scheduled', inviteExpiresAt: '2026-11-01T16:59:59.000Z', expired: true, canStart: false, canContinue: false, consentVersionRequired: null },
    ],
  })
  const undangan = page.getByTestId('my-invitations')
  await expect(undangan.getByRole('link', { name: 'Lanjutkan wawancara' })).toHaveAttribute('href', '/iv/s2')
  await expect(undangan.getByText('Undangan sudah berakhir. Minta HR memperpanjang undangan Anda.')).toBeVisible()
  await expect(undangan.getByRole('link')).toHaveCount(1)
})

test('kartu Rencana belajar saya: kosong memakai teks mockup; terisi menampilkan jumlah per status dan tautan', async ({ page }) => {
  await masuk(page)
  const kartu = page.getByTestId('my-plan')
  await expect(kartu).toContainText('akan muncul di sini setelah HR menyetujui hasil wawancara')
  await expect(kartu.getByRole('link')).toHaveCount(0)

  const lain = await page.context().newPage()
  await masuk(lain, 'karyawan', {}, { plan: { total: 3, byStatus: { new: 1, in_progress: 1, completed: 1 } } })
  const isi = lain.getByTestId('my-plan')
  await expect(isi).toContainText('Belum dimulai: 1')
  await expect(isi).toContainText('Sedang berjalan: 1')
  await expect(isi).toContainText('Selesai: 1')
  await expect(isi.getByRole('link', { name: 'Lihat rencana belajar' })).toHaveAttribute('href', '/li')
})

test('bagian null tersembunyi; TNA mati menyembunyikan Rencana belajar dan /li kembali ke Hasil saya', async ({ page }) => {
  await masuk(page, 'karyawan', { submodules: ['dna'] }, { competencies: null, invitations: null, interviews: null, plan: null })
  await expect(page.getByRole('heading', { level: 1, name: 'Hasil saya' })).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
  await expect(page.getByTestId('my-plan')).toHaveCount(0)
  await expect(page.getByTestId('my-invitations')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name: 'Rencana belajar' })).toHaveCount(0)
  await page.goto('/li')
  await expect(page).toHaveURL(/\/my$/)
})

test('flag learner.home mati: karyawan tetap di Beranda lama tanpa butir Hasil saya', async ({ page }) => {
  await loginSebagai(page, 'karyawan')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name: 'Hasil saya' })).toHaveCount(0)
})

test('HR dengan flag menyala melihat "Karyawan (saya)" dan mendarat di Hasil saya', async ({ page }) => {
  await mockApi(page, (req) => (cocok(req, 'GET /dashboard') ? data({}) : undefined))
  await masuk(page, 'hr')
  const views = page.getByRole('group', { name: 'Tampilan' })
  await views.getByRole('button', { name: 'Karyawan (saya)' }).click()
  await expect(page).toHaveURL(/\/my$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Hasil saya' })).toBeVisible()
})

test('hasil gagal dimuat: galat dan Coba lagi; kartu Data saya tetap tampil', async ({ page }) => {
  let gagal = true
  await mockApi(page, (req) => {
    if (cocok(req, 'GET /my/results') && gagal) return { status: 500, json: { error: { code: 'ERROR', message: 'Server sedang bermasalah' } } }
    if (cocok(req, 'GET /employees/me/data-requests')) return data([])
    return undefined
  })
  await masuk(page)
  await expect(page.getByText('Server sedang bermasalah')).toBeVisible()
  await expect(page.getByTestId('my-privacy')).toBeVisible()
  gagal = false
  await page.getByRole('button', { name: 'Coba lagi' }).click()
  await expect(page.getByRole('table')).toBeVisible()
})

interface Kirim { method: string; path: string; body: unknown }
async function dataSaya(page: Page, o: { peran?: Peran; permintaan?: unknown[]; tolak?: boolean } = {}) {
  const sent: Kirim[] = []
  let rows = o.permintaan ?? []
  await mockApi(page, (req) => {
    if (cocok(req, 'GET /employees/me/data-requests')) return data(rows)
    if (cocok(req, 'GET /employees/:id/export')) { sent.push({ method: 'GET', path: req.path, body: null }); return { json: { data: { profile: {} } } } }
    if (cocok(req, 'POST /employees/me/data-requests')) {
      sent.push({ method: 'POST', path: req.path, body: req.body })
      if (o.tolak) return { status: 409, json: { error: { code: 'REQUEST_EXISTS', message: 'Permintaan hapus data Anda masih diproses' } } }
      const b = req.body as { type: string }
      const row = { id: 'r9', type: b.type, status: 'open', createdAt: '2026-11-23T03:00:00.000Z', dueAt: b.type === 'delete_data' ? '2026-11-26T03:00:00.000Z' : null, sessions: 1 }
      rows = [row, ...rows]
      return data(row, 201)
    }
    const batal = cocok(req, 'DELETE /employees/me/data-requests/:id')
    if (batal) { sent.push({ method: 'DELETE', path: req.path, body: null }); rows = []; return data({ id: batal.id, status: 'cancelled' }) }
    return undefined
  })
  await masuk(page, o.peran ?? 'karyawan', {}, { interviews: [{ sessionId: 's0', submodule: 'tna', status: 'completed', endedAt: '2026-11-10T03:00:00.000Z', consentVersion: 'tna-consent-id-v1.0', consentWithdrawnAt: null, transcriptPath: '/api/tna/sessions/s0/transcript' }] })
  return sent
}

test('Data saya: unduh memakai jalur ekspor tanpa awalan ganda', async ({ page }) => {
  const sent = await dataSaya(page)
  const unduh = page.waitForEvent('download')
  await page.getByTestId('my-privacy').getByRole('button', { name: 'Unduh data saya' }).click()
  expect((await unduh).suggestedFilename()).toMatch(/^elgos-data-saya-\d{4}-\d{2}-\d{2}\.json$/)
  expect(sent).toEqual([{ method: 'GET', path: '/employees/u-karyawan/export', body: null }])
})

test('Data saya: tarik persetujuan lewat konfirmasi di halaman', async ({ page }) => {
  const sent = await dataSaya(page)
  const kartu = page.getByTestId('my-privacy')
  await kartu.getByRole('button', { name: 'Tarik persetujuan wawancara' }).click()
  const panel = kartu.getByRole('region', { name: 'Konfirmasi tarik persetujuan' })
  await expect(panel).toContainText('tidak bisa dipulihkan')
  await panel.getByRole('button', { name: 'Batal' }).click()
  expect(sent).toEqual([])
  await kartu.getByRole('button', { name: 'Tarik persetujuan wawancara' }).click()
  await kartu.getByRole('button', { name: 'Ya, tarik persetujuan' }).click()
  await expect(kartu.getByRole('status')).toHaveText('Persetujuan ditarik. 1 wawancara dihentikan.')
  expect(sent).toEqual([{ method: 'POST', path: '/employees/me/data-requests', body: { type: 'withdraw_consent' } }])
})

test('Data saya: minta hapus dengan alasan, lalu batalkan', async ({ page }) => {
  const sent = await dataSaya(page)
  const kartu = page.getByTestId('my-privacy')
  await kartu.getByLabel('Alasan (opsional)').fill('Saya keluar dari perusahaan')
  await kartu.getByRole('button', { name: 'Kirim permintaan hapus' }).click()
  await expect(kartu.getByRole('status')).toContainText('Permintaan hapus terkirim')
  await expect(kartu.getByRole('button', { name: 'Kirim permintaan hapus' })).toHaveCount(0)
  await expect(kartu.getByRole('listitem').filter({ hasText: 'Hapus data' })).toContainText('Terbuka')
  await kartu.getByRole('button', { name: 'Batalkan' }).click()
  await expect(kartu.getByRole('button', { name: 'Kirim permintaan hapus' })).toBeVisible()
  expect(sent).toEqual([
    { method: 'POST', path: '/employees/me/data-requests', body: { type: 'delete_data', reason: 'Saya keluar dari perusahaan' } },
    { method: 'DELETE', path: '/employees/me/data-requests/r9', body: null },
  ])
})

test('Data saya: galat 409 tampil; akun HR tidak melihat isian hapus', async ({ page, browser }) => {
  await dataSaya(page, { tolak: true })
  const kartu = page.getByTestId('my-privacy')
  await kartu.getByRole('button', { name: 'Kirim permintaan hapus' }).click()
  await expect(kartu.getByText('Permintaan hapus data Anda masih diproses')).toBeVisible()

  const hr = await (await browser.newContext()).newPage()
  await mockApi(hr, (req) => (cocok(req, 'GET /dashboard') ? data({}) : undefined))
  await dataSaya(hr, { peran: 'hr' })
  await hr.getByRole('group', { name: 'Tampilan' }).getByRole('button', { name: 'Karyawan (saya)' }).click()
  const k = hr.getByTestId('my-privacy')
  await expect(k).toContainText('Akun HR atau Admin ETA dihapus lewat Admin ETA.')
  await expect(k.getByRole('button', { name: 'Kirim permintaan hapus' })).toHaveCount(0)
})

const KARTU = [
  { id: 'p1', title: 'Alur tiket layanan', description: 'Alur tiket dari masuk sampai ditutup.', level: 'Basic', mode: null, code: 'ST-B4', status: 'completed', courseStatus: 'passed', courseScore: 87.5, reason: 'Belum paham eskalasi', needsModule: false, where: { target: 'elitementor', label: 'EliteMentor' }, launchUrl: 'https://elitementor.contoh.test/c/st-b4' },
  { id: 'p2', title: 'Dasar otomasi', description: null, level: null, mode: null, code: null, status: 'in_progress', courseStatus: 'failed', courseScore: 40, reason: 'Dasar otomasi', needsModule: false, where: { target: 'lms', label: 'Moodle Klien' }, launchUrl: null },
  { id: 'p3', title: 'Modul sedang disiapkan', description: null, level: null, mode: null, code: null, status: 'new', courseStatus: null, courseScore: null, reason: 'Analisis akar masalah', needsModule: true, where: { target: 'elitementor', label: 'EliteMentor' }, launchUrl: null },
  { id: 'p4', title: 'Analisis insiden', description: null, level: 'Intermediate', mode: null, code: 'ST-A2', status: 'new', courseStatus: null, courseScore: null, reason: 'Analisis insiden', needsModule: false, where: { target: 'elitementor', label: 'EliteMentor' }, launchUrl: 'https://elitementor.contoh.test/c/st-a2' },
]

async function rencana(page: Page, cards: unknown[], delivery = { target: 'elitementor', label: 'EliteMentor' }) {
  await mockApi(page, (req) => (cocok(req, 'GET /my/learning-plan') ? { json: { data: cards, delivery } } : undefined))
  await masuk(page)
  await page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name: 'Rencana belajar' }).click()
  await expect(page).toHaveURL(/\/li$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Rencana belajar' })).toBeVisible()
}

test('Rencana belajar: kartu dengan status, skor, tautan keluar, dan modul yang disiapkan', async ({ page }) => {
  await rencana(page, KARTU)
  await expect(page.getByText('EliteMentor langsung membantu Anda belajar')).toBeVisible()
  const k1 = page.getByTestId('li-card-p1')
  await expect(k1).toContainText('Basic')
  await expect(k1).toContainText('Selesai · skor 87,5')
  await expect(k1).toContainText('Alasan: Belum paham eskalasi')
  await expect(k1).toContainText('ST-B4')
  const buka = k1.getByRole('link', { name: /Buka EliteMentor/ })
  await expect(buka).toHaveAttribute('href', 'https://elitementor.contoh.test/c/st-b4')
  await expect(buka).toHaveAttribute('target', '_blank')
  await expect(buka).toHaveAttribute('rel', 'noopener noreferrer')

  const k2 = page.getByTestId('li-card-p2')
  await expect(k2).toContainText('Sedang berjalan')
  await expect(k2).toContainText('Tidak lulus')
  await expect(k2).toContainText('Moodle Klien')
  await expect(k2).toContainText('Tautan belum tersedia')
  await expect(k2).not.toContainText('Alasan:')

  const k3 = page.getByTestId('li-card-p3')
  await expect(k3).toContainText('Belum dimulai')
  await expect(k3.getByText('Modul sedang disiapkan')).toHaveCount(1)
  await expect(k3.getByRole('link')).toHaveCount(0)

  await expect(page.getByTestId('li-card-p4').getByRole('link', { name: /Belajar dengan EliteMentor/ })).toBeVisible()
})

test('Rencana belajar: kosong, dan pengantar memakai nama LMS tenant', async ({ page }) => {
  await rencana(page, [], { target: 'lms', label: 'Moodle Klien' })
  await expect(page.getByText('Pelatihan dipelajari di Moodle Klien.')).toBeVisible()
  await expect(page.getByText('Belum ada rencana belajar. Modul akan muncul di sini setelah HR menyetujui hasil wawancara Anda.')).toBeVisible()
})

test('HR dengan peran dari API (B2) berganti ke Karyawan (saya) lewat switch-role', async ({ page }) => {
  const ganti: unknown[] = []
  await mockApi(page, (req) => {
    if (cocok(req, 'GET /dashboard')) return data({})
    if (cocok(req, 'GET /me/access')) {
      const view = ganti.length ? 'karyawan' : 'hr'
      return { json: { submodules: ['cca', 'dna', 'tna', 'ina'], products: ['full_suite'], flags: { 'module.dna': true, 'module.tna': true, ...ON },
        role: ganti.length ? 'learner' : 'hr_admin', view,
        roles: [{ role: 'hr_admin', view: 'hr', label: 'HR / L&D' }, { role: 'learner', view: 'karyawan', label: 'Karyawan' }] } }
    }
    if (cocok(req, 'POST /auth/switch-role')) {
      ganti.push(req.body)
      return { json: { token: 'token-learner', user: { id: 'u-hr', tenantId: 't-contoh', email: 'hr@contoh.test', role: 'learner', roles: ['hr_admin', 'learner'] } } }
    }
    return undefined
  })
  await masuk(page, 'hr')
  await page.getByRole('group', { name: 'Tampilan' }).getByRole('button', { name: 'Karyawan (saya)' }).click()
  await expect(page).toHaveURL(/\/my$/)
  expect(ganti).toEqual([{ role: 'learner' }])
})
