import { test, expect } from '@playwright/test'
import { loginSebagai, navigasi, semuaModulDengan, SEMUA_MODUL, type Peran } from '../support/sesi'
import { mockApi, mockApiDasar, permintaanBelumDimock } from '../support/api'
import { penanganHasilSaya, SESI_UNDANGAN } from '../support/hasil-saya'
import { penanganDashboardHr } from '../support/dashboard'
import { papanGapTna, ID_KOMPETENSI, ID_DIMAS, ID_PROYEK } from '../support/tna-gap'
import { sesiWawancara } from '../support/wawancara'
import { tanggalWib } from '../support/tanggal'

// B18 4.5 (docs/designs/b18-e2e-qa-malam.md): tiga jalur utama, langkah ditandai test.step.
// Seam: layar lewat browser setelah masuk lewat tautan email (loginSebagai), API di-mock lewat support/.
// Detail tiap layar (galat, variasi flag, peran lain) diuji di spec paketnya: dashboard.spec.ts, tna-gap.spec.ts, iv.spec.ts.

// Layar tidak boleh bergantung pada endpoint yang tidak di-mock (jaring pengaman support/api.ts)
test.afterEach(({ page }) => { expect(permintaanBelumDimock(page)).toEqual([]) })

// Jalur 1, satu test per peran. Store sesi menawarkan "Karyawan (saya)" karena layar beranda karyawan B8 ("Hasil saya",
// rute `my`, flag learner.home di SEMUA_MODUL) terbuka. Menu lengkap tiap peran diuji di menu-peran.spec.ts; di sini cukup butir pertamanya.
const TAMPILAN_UTAMA: { peran: Peran; label: string; butirPertama: string }[] = [
  { peran: 'hr', label: 'HR / L&D', butirPertama: 'Dashboard utama' },
  { peran: 'atasan', label: 'Atasan', butirPertama: 'Dashboard tim' },
  { peran: 'admin', label: 'Admin Tenant', butirPertama: 'Pengguna & peran' },
]
for (const t of TAMPILAN_UTAMA) {
  test(`jalur 1 (${t.peran}): masuk lewat tautan email, menu sesuai peran, ganti ke Karyawan (saya) dan kembali`, async ({ page }) => {
    const tampilan = page.getByRole('group', { name: 'Tampilan' })
    await test.step('masuk lewat tautan email: menu tampilan utama', async () => {
      await mockApiDasar(page, penanganHasilSaya(`u-${t.peran}`))
      await mockApiDasar(page, penanganDashboardHr)
      // Beranda Admin Tenant (Pengguna & peran): isi kosong cukup, layarnya diuji di admin-tenant.spec.ts
      await mockApiDasar(page, (req) => (req.method === 'GET' && req.path.startsWith('/tenant-admin/') ? { json: { data: [] } } : undefined))
      await loginSebagai(page, t.peran, { ...SEMUA_MODUL, peranLain: ['karyawan'] })
      await expect(navigasi(page).getByRole('link').first()).toHaveText(t.butirPertama)
      await expect(tampilan.getByRole('button', { name: t.label })).toHaveAttribute('aria-pressed', 'true')
    })
    await test.step('ganti ke Karyawan (saya): menu karyawan', async () => {
      await tampilan.getByRole('button', { name: 'Karyawan (saya)' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Hasil saya' })).toBeVisible()
      await expect(navigasi(page).getByRole('link')).toHaveText(['Hasil saya', 'Wawancara visi & nilai', 'Wawancara akar masalah', 'Rencana belajar'])
    })
    await test.step('kembali ke tampilan utama', async () => {
      await tampilan.getByRole('button', { name: t.label }).click()
      await expect(navigasi(page).getByRole('link').first()).toHaveText(t.butirPertama)
    })
  })
}

test('jalur 2: HR dari Dashboard utama ke Training Needs, membuka detail gap, lalu menugaskan wawancara', async ({ page }) => {
  const { penangan, terkirim } = papanGapTna({ peran: 'hr' })
  await mockApi(page, penangan)
  await mockApi(page, penanganDashboardHr)

  await test.step('masuk lewat tautan email: mendarat di Dashboard utama', async () => {
    await loginSebagai(page, 'hr', semuaModulDengan({ 'tna.interview_assignment': true }))
    await expect(page).toHaveURL((u) => u.pathname === '/dashboard')
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard utama' })).toBeVisible()
  })
  await test.step('menu Training Needs: papan gap, tab Gap kompetensi', async () => {
    await navigasi(page).getByRole('link', { name: 'Training Needs' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Training Needs' })).toBeVisible()
    await page.getByRole('tab', { name: 'Gap kompetensi' }).click()
  })
  await test.step('gap Analisis insiden: halaman detail', async () => {
    await page.getByRole('table', { name: 'Gap kompetensi' }).getByRole('link', { name: 'Analisis insiden' }).click()
    await expect(page).toHaveURL((u) => u.pathname === '/tna/gap')
    await expect(page.getByRole('heading', { level: 1, name: 'Analisis insiden' })).toBeVisible()
  })
  await test.step('tugaskan wawancara: karyawan, tenggat, durasi', async () => {
    // P8 R2: formulir penugasan dibuka di dialog dari CTA "Mulai wawancara akar masalah"
    await page.getByRole('button', { name: 'Mulai wawancara akar masalah' }).click()
    const form = page.getByRole('form', { name: 'Tugaskan wawancara' })
    await form.getByRole('checkbox', { name: 'Dimas' }).check()
    await form.getByLabel('Tenggat').fill(tanggalWib(11))
    await form.getByRole('radio', { name: '15 menit' }).check()
    await form.getByRole('button', { name: 'Tugaskan wawancara' }).click()
    await expect(page.getByRole('status')).toContainText('1 wawancara ditugaskan')
    // ID berasal dari data mock yang dipilih layar; tenggat dan durasi dari isian di atas
    expect(terkirim).toEqual([{
      path: '/assignments',
      body: { projectId: ID_PROYEK, gap: { kind: 'competency', competencyId: ID_KOMPETENSI }, mode: 'affected', employeeIds: [ID_DIMAS], dueDate: tanggalWib(11), durationMinutes: 15 },
    }])
  })
})

// Spek 4.5: jalur 3 mulai dari "Hasil saya" (B8), beranda karyawan, lewat catatan undangan wawancara.
test('jalur 3: karyawan membuka penugasan wawancara akar masalah, menyetujui, menjawab, dan mengirim ringkasan ke HR', async ({ page }) => {
  const { penangan, terkirim } = sesiWawancara({ pemilik: 'u-karyawan' })
  await mockApi(page, penangan)
  await mockApiDasar(page, penanganHasilSaya('u-karyawan'))
  await test.step('masuk lewat tautan email: mendarat di Hasil saya', async () => {
    await loginSebagai(page, 'karyawan', semuaModulDengan({ 'tna.interview_summary': true }))
    await expect(page).toHaveURL((u) => u.pathname === '/my')
    await expect(page.getByRole('heading', { level: 1, name: 'Hasil saya' })).toBeVisible()
  })
  await test.step('Hasil saya: undangan wawancara dibuka lewat Mulai wawancara', async () => {
    await page.getByTestId('my-invitations').getByRole('link', { name: 'Mulai wawancara' }).click()
    await expect(page).toHaveURL((u) => u.pathname === `/iv/${SESI_UNDANGAN}`)
    await expect(page.getByText('Topik: Analisis insiden')).toBeVisible()
  })
  await test.step('persetujuan: galat bila kotak belum dicentang, lalu dicentang', async () => {
    await page.getByRole('button', { name: 'Lanjut ke wawancara' }).click()
    await expect(page.getByRole('alert')).toContainText('Centang persetujuan untuk melanjutkan')
    expect(terkirim).toEqual([])
    await page.getByRole('checkbox', { name: 'Saya sudah membaca keterangan di atas dan setuju mengikuti wawancara.' }).check()
    await page.getByRole('button', { name: 'Lanjut ke wawancara' }).click()
  })
  await test.step('percakapan: pertanyaan AI dijawab', async () => {
    const percakapan = page.getByRole('log', { name: 'Percakapan wawancara' })
    await expect(percakapan).toContainText('Ceritakan analisis insiden terakhir yang Anda kerjakan.')
    expect(terkirim.find((t) => t.path === 'consent')?.body).toEqual({ consentVersion: 'tna-consent-id-v1.0' })
    await page.getByLabel('Jawaban').fill('Saya belum pernah dilatih eskalasi.')
    await page.getByRole('button', { name: 'Kirim' }).click()
    await expect(percakapan).toContainText('Saya belum pernah dilatih eskalasi.')
  })
  await test.step('ringkasan temuan diperiksa lalu dikirim ke HR sebagai sesuai', async () => {
    await page.getByRole('button', { name: 'Lihat ringkasan temuan' }).click()
    await expect(page.getByRole('heading', { name: 'Ringkasan temuan AI' })).toBeVisible()
    await expect(page.getByText('Belum paham langkah eskalasi insiden')).toBeVisible()
    await page.getByRole('button', { name: 'Sesuai, kirim ke HR' }).click()
    await expect(page.getByText('Ringkasan sudah dikirim ke HR untuk ditinjau.')).toBeVisible()
    // Tanpa `accurate: false` dan catatan: karyawan menyatakan ringkasan sesuai
    expect(terkirim.find((t) => t.path === 'confirm')?.body).toEqual({})
  })
})
