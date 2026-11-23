import { test, expect, type Page } from '@playwright/test'
import { loginSebagai, type OpsiSesi, type Peran } from './support/sesi'
import { mockApi, cocok, type ResponsApi } from './support/api'

// B8 layar web: "Hasil saya" (rute my) dan "Rencana belajar" (rute li). Spek: docs/designs/b8-karyawan.md "Layar web".
// API di-mock lewat support/ B18.

const ON = { 'learner.home': true }
const data = (d: unknown, status = 200): ResponsApi => ({ status, json: { data: d } })

function hasil(me: string, over: Record<string, unknown> = {}) {
  return {
    person: { id: me, name: 'Dimas', jobRoleName: 'Engineer Service Delivery', careerLevelName: 'L1' },
    competencies: {
      items: [
        { competencyId: 'c1', code: 'ST-B4', name: 'Manajemen tiket', required: 3, score: 3, status: 'met' },
        { competencyId: 'c2', code: null, name: 'Analisis insiden', required: 4, score: 3, status: 'partial' },
        { competencyId: 'c3', code: 'TC-I1', name: 'Otomasi infrastruktur', required: 4, score: 1, status: 'gap' },
        { competencyId: 'c4', code: 'ST-A2', name: 'Komunikasi pelanggan', required: 2, score: null, status: 'not_assessed' },
      ],
      summary: { total: 4, assessed: 3, met: 1, partial: 1, gaps: 1 },
    },
    invitations: [{ sessionId: 's1', submodule: 'tna', status: 'scheduled', inviteExpiresAt: '2026-12-05T16:59:59.000Z', expired: false, canStart: true, canContinue: false, consentVersionRequired: 'tna-consent-id-v1.0' }],
    interviews: [],
    plan: { total: 0, byStatus: {} },
    privacy: { exportPath: `/api/employees/${me}/export`, requestsPath: '/api/employees/me/data-requests', openRequests: [] },
    ...over,
  }
}

async function masuk(page: Page, peran: Peran = 'karyawan', opsi: OpsiSesi = {}, over: Record<string, unknown> = {}) {
  const me = `u-${peran}`
  await mockApi(page, (req) => {
    if (cocok(req, 'GET /my/results')) return data(hasil(me, over))
    return undefined
  })
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
  await expect(undangan.getByText('Undangan sudah lewat tenggat. Hubungi HR untuk undangan baru.')).toBeVisible()
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
